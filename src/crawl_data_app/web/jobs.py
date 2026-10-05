"""Chạy các lần crawl dưới dạng task nền trong chính tiến trình web (không cần hàng đợi hay worker riêng)."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import NamedTuple
from urllib.parse import urlsplit

import httpx

from crawl_data_app import aviation
from crawl_data_app.aviation import AviationRepository
from crawl_data_app.config.settings import Settings
from crawl_data_app.core.exceptions import CrawlerError, ParseError
from crawl_data_app.core.http_client import HttpClient, Page
from crawl_data_app.core.models import CrawlRequest
from crawl_data_app.crawlers import crawler_class_for
from crawl_data_app.database.models import RunStatus, utcnow
from crawl_data_app.repository import NovelRepository
from crawl_data_app.service import CrawlService

log = logging.getLogger(__name__)


class DuplicateJobError(Exception):
    """Việc được yêu cầu (crawl một truyện, đồng bộ một nguồn) đang có một job chạy dở."""

    def __init__(self, run_id: int, what: str = "Truyện này đang được crawl") -> None:
        super().__init__(f"{what} ở job #{run_id}")
        self.run_id = run_id


class _Job(NamedTuple):
    task: asyncio.Task[object]
    # Việc job đang làm, để chặn job trùng: ("tên nguồn truyện", đường dẫn truyện) — không phụ thuộc
    # tên miền — hoặc ("aviation", nguồn hàng không).
    key: tuple[str, str]


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
        self._aviation = AviationRepository(repository.session_factory)
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

    def _reject_duplicate(self, key: tuple[str, str], what: str) -> None:
        for run_id, job in self._jobs.items():
            if job.key == key and not job.task.done():
                raise DuplicateJobError(run_id, what)

    def _register(self, run_id: int, key: tuple[str, str], work: Awaitable[object]) -> int:
        task = asyncio.ensure_future(work)
        self._jobs[run_id] = _Job(task, key)
        task.add_done_callback(lambda done: self._finished(run_id, done))
        return run_id

    async def start(
        self, request: CrawlRequest, *, force: bool = False, retry_failed: bool = True
    ) -> int:
        """Tạo một lần crawl truyện chạy nền và trả về ID ngay.

        Ném `CrawlerError` nếu URL không dùng được (website chưa hỗ trợ, nguồn đang tắt, không phải
        URL truyện) và `DuplicateJobError` nếu truyện đang được crawl.
        """
        settings = self._settings()
        crawler = crawler_class_for(request.url, settings.crawler.disabled_sources)
        request = request.model_copy(update={"url": crawler.novel_url(request.url)})
        key = (crawler.name, urlsplit(request.url).path)
        client = await self._shared_client()
        # Từ đây đến lúc ghi nhận job không còn `await` nào: hai yêu cầu đồng thời không thể cùng lọt
        # qua bước kiểm tra trùng.
        self._reject_duplicate(key, "Truyện này đang được crawl")
        service = CrawlService(
            self._repo,
            client,
            content_format=settings.crawler.content_format,
            concurrency=settings.http.concurrency,
            disabled_sources=settings.crawler.disabled_sources,
        )
        run_id = self._repo.start_run(request)
        return self._register(
            run_id,
            key,
            service.crawl(request, force=force, retry_failed=retry_failed, run_id=run_id),
        )

    async def start_aviation(self, source: str) -> int:
        """Tạo một job đồng bộ danh mục hàng không của `source` và trả về ID ngay.

        Ném `DuplicateJobError` nếu nguồn đó đang được đồng bộ.
        """
        key = ("aviation", source)
        client = await self._shared_client()
        self._reject_duplicate(
            key, "Nguồn này đang được đồng bộ"
        )  # không `await` từ đây, như `start`
        run_id = self._repo.start_run(
            CrawlRequest(url=aviation.HOMES[source]),
            crawler=aviation.crawler_name(source),
            total=aviation.FILES_PER_SYNC,
        )
        return self._register(run_id, key, self._sync_aviation(source, run_id, client))

    async def _sync_aviation(self, source: str, run_id: int, client: HttpClient) -> None:
        """Tải ba file của nguồn (ghi tiến độ sau mỗi file) rồi lưu tất cả trong một transaction:
        dừng hay lỗi giữa chừng thì dữ liệu đã có không bị đụng tới.
        """
        extra = {"run_id": run_id}
        done = 0

        async def fetch(url: str) -> Page:
            nonlocal done
            page = await client.get(url)
            done += 1
            self._repo.update_run(run_id, chapters_ok=done)
            log.info("Đã tải %s", url, extra=extra | {"url": url})
            return page

        try:
            records = await aviation.SOURCES[source](fetch)
            counts = self._aviation.save(source, records)
        except asyncio.CancelledError:
            # Tạm dừng, huỷ hoặc tắt server; `stop()` sẽ ghi lại trạng thái chính xác nếu là huỷ.
            self._repo.update_run(run_id, status=RunStatus.INTERRUPTED, finished_at=utcnow())
            raise
        except CrawlerError as exc:
            kind = "parse" if isinstance(exc, ParseError) else "request"
            log.error("Dừng đồng bộ hàng không (%s): %s", source, exc, extra=extra | {"kind": kind})
            self._repo.update_run(
                run_id, status=RunStatus.FAILED, error=str(exc), finished_at=utcnow()
            )
        except Exception as exc:
            self._repo.update_run(
                run_id,
                status=RunStatus.FAILED,
                error=f"Lỗi ngoài dự kiến: {type(exc).__name__}: {exc}",
                finished_at=utcnow(),
            )
            raise
        else:
            self._repo.update_run(
                run_id, status=RunStatus.COMPLETED, result=counts, finished_at=utcnow()
            )
            log.info("Đồng bộ hàng không (%s) xong: %s", source, counts, extra=extra)

    def _finished(self, run_id: int, task: asyncio.Task[object]) -> None:
        del self._jobs[run_id]
        if not task.cancelled() and task.exception() is not None:
            # Lỗi đã được ghi vào lịch sử crawl; ở đây chỉ để lại traceback trong log.
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
        # Job đã tự ghi `interrupted`; ghi lại để phân biệt huỷ với tạm dừng (và cho trường hợp task
        # bị dừng trước cả khi kịp chạy bước đầu tiên).
        self._repo.update_run(run_id, status=status, finished_at=utcnow())
        action = "Đã huỷ" if status == RunStatus.CANCELLED else "Tạm dừng"
        log.info("%s job #%d theo yêu cầu", action, run_id, extra={"run_id": run_id})
        return True

    async def fetch(self, url: str) -> Page:
        """Tải một trang qua client dùng chung (cùng nhịp giãn cách và robots.txt với các job)."""
        client = await self._shared_client()
        self._fetches += 1
        try:
            return await client.get(url)
        finally:
            self._fetches -= 1

    async def shutdown(self) -> None:
        """Dừng mọi job (job tự ghi `interrupted` → lần sau chạy tiếp được) và đóng kết nối."""
        tasks = [job.task for job in self._jobs.values()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.wait(tasks)
        if self._client is not None:
            await self._client.aclose()
