"""Chạy các lần crawl dưới dạng task nền trong chính tiến trình web (không cần hàng đợi hay worker riêng)."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import NamedTuple
from urllib.parse import urlsplit

import httpx

from crawl_data_app.config.settings import Settings
from crawl_data_app.core.http_client import HttpClient, Page
from crawl_data_app.core.models import CrawlRequest
from crawl_data_app.crawlers import crawler_class_for
from crawl_data_app.database.models import RunStatus, utcnow
from crawl_data_app.repository import NovelRepository
from crawl_data_app.service import CrawlService

log = logging.getLogger(__name__)


class DuplicateJobError(Exception):
    """Truyện được yêu cầu đang có một job chạy dở."""

    def __init__(self, run_id: int) -> None:
        super().__init__(f"Truyện này đang được crawl ở job #{run_id}")
        self.run_id = run_id


class _Job(NamedTuple):
    task: asyncio.Task[object]
    novel: tuple[str, str]  # (tên nguồn, đường dẫn truyện) — không phụ thuộc tên miền


class JobManager:
    # ponytail: job chỉ sống trong bộ nhớ của một tiến trình — tắt server là job dừng (ghi `interrupted`,
    # bấm "Tiếp tục" để chạy lại). Cần hàng đợi bền vững (arq, Celery...) khi chạy nhiều tiến trình web.

    def __init__(
        self,
        repository: NovelRepository,
        settings: Callable[[], Settings],
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._repo = repository
        self._settings = settings  # hàm, vì cấu hình có thể được sửa trên UI khi server đang chạy
        self._transport = transport
        self._sleep = sleep
        self._jobs: dict[int, _Job] = {}
        self._client: HttpClient | None = None
        self._fetches = 0  # số lần "kiểm tra kết nối" đang dùng client

    def is_active(self, run_id: int) -> bool:
        # Task vừa xong vẫn nằm trong `_jobs` thêm một nhịp event loop (tới khi `_finished` chạy),
        # nên phải hỏi cả task — nếu không sẽ có lúc job "completed" mà vẫn báo đang chạy.
        job = self._jobs.get(run_id)
        return job is not None and not job.task.done()

    async def _shared_client(self) -> HttpClient:
        """Một HttpClient cho mọi job đang chạy: nhịp giãn cách request là chung, nên chạy nhiều job
        cùng lúc không làm tăng tải lên website.

        Khi không còn ai dùng thì lần tới tạo client mới — nhận cấu hình HTTP mới nhất và đọc lại robots.txt.
        """
        if self._client is None or not (self._jobs or self._fetches):
            old, self._client = (
                self._client,
                HttpClient(self._settings().http, transport=self._transport, sleep=self._sleep),
            )
            if old is not None:
                await old.aclose()
        return self._client

    async def start(
        self, request: CrawlRequest, *, force: bool = False, retry_failed: bool = True
    ) -> int:
        """Tạo một lần crawl chạy nền và trả về ID ngay.

        Ném `CrawlerError` nếu URL không dùng được (website chưa hỗ trợ, nguồn đang tắt, không phải
        URL truyện) và `DuplicateJobError` nếu truyện đang được crawl.
        """
        settings = self._settings()
        crawler = crawler_class_for(request.url, settings.crawler.disabled_sources)
        request = request.model_copy(update={"url": crawler.novel_url(request.url)})
        novel = (crawler.name, urlsplit(request.url).path)
        client = await self._shared_client()
        # Từ đây đến lúc ghi nhận job không còn `await` nào: hai yêu cầu đồng thời không thể cùng lọt
        # qua bước kiểm tra trùng.
        for run_id, job in self._jobs.items():
            if job.novel == novel and not job.task.done():
                raise DuplicateJobError(run_id)
        service = CrawlService(
            self._repo,
            client,
            content_format=settings.crawler.content_format,
            concurrency=settings.http.concurrency,
            disabled_sources=settings.crawler.disabled_sources,
        )
        run_id = self._repo.start_run(request)
        task = asyncio.create_task(
            service.crawl(request, force=force, retry_failed=retry_failed, run_id=run_id)
        )
        self._jobs[run_id] = _Job(task, novel)
        task.add_done_callback(lambda done: self._finished(run_id, done))
        return run_id

    def _finished(self, run_id: int, task: asyncio.Task[object]) -> None:
        del self._jobs[run_id]
        if not task.cancelled() and task.exception() is not None:
            # Service đã ghi lỗi vào lịch sử crawl; ở đây chỉ để lại traceback trong log.
            log.error(
                "Job #%d dừng vì lỗi ngoài dự kiến",
                run_id,
                exc_info=task.exception(),
                extra={"run_id": run_id},
            )

    async def stop(self, run_id: int, status: RunStatus) -> bool:
        """Dừng job đang chạy rồi chốt trạng thái: `INTERRUPTED` = tạm dừng (chạy tiếp được),
        `CANCELLED` = huỷ. Trả về False nếu job không (còn) chạy trong tiến trình này.
        """
        job = self._jobs.get(run_id)
        if job is None or not job.task.cancel():
            return False
        await asyncio.wait([job.task])
        # Service đã ghi `interrupted`; ghi lại để phân biệt huỷ với tạm dừng (và cho trường hợp task
        # bị dừng trước cả khi kịp chạy bước đầu tiên).
        self._repo.update_run(run_id, status=status, finished_at=utcnow())
        action = "Đã huỷ" if status == RunStatus.CANCELLED else "Tạm dừng"
        log.info("%s job #%d theo yêu cầu", action, run_id, extra={"run_id": run_id})
        return True

    async def with_fetch[T](
        self, work: Callable[[Callable[[str], Awaitable[Page]]], Awaitable[T]]
    ) -> T:
        """Chạy `work(fetch)` trên client dùng chung (cùng nhịp giãn cách và robots.txt với các job).

        Client được giữ suốt lúc `work` chạy, nên tải nhiều trang liên tiếp chỉ đọc robots.txt một lần.
        """
        client = await self._shared_client()
        self._fetches += 1
        try:
            return await work(client.get)
        finally:
            self._fetches -= 1

    async def fetch(self, url: str) -> Page:
        """Tải một trang qua client dùng chung."""
        return await self.with_fetch(lambda fetch: fetch(url))

    async def shutdown(self) -> None:
        """Dừng mọi job (service ghi `interrupted` → lần sau chạy tiếp được) và đóng kết nối."""
        tasks = [job.task for job in self._jobs.values()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.wait(tasks)
        if self._client is not None:
            await self._client.aclose()
