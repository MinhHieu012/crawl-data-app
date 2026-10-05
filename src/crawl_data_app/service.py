"""Điều phối một lần crawl: thông tin truyện → mục lục → nội dung chương; ghi lại lịch sử và lỗi."""

import asyncio
import logging
from collections.abc import Callable, Collection
from dataclasses import dataclass
from time import monotonic

from crawl_data_app.config.logging import current_run
from crawl_data_app.core.base_crawler import BaseCrawler
from crawl_data_app.core.content import content_hash, render
from crawl_data_app.core.exceptions import BlockedError, CrawlerError, FetchError, ParseError
from crawl_data_app.core.http_client import HttpClient
from crawl_data_app.core.models import ChapterRef, CrawlRequest, NovelInfo
from crawl_data_app.crawlers import crawler_class_for
from crawl_data_app.database.models import RunStatus
from crawl_data_app.repository import NovelRepository

log = logging.getLogger(__name__)

# Quá ngần này chương lỗi liên tiếp thì dừng: website đang sập hoặc đã đổi cấu trúc,
# tiếp tục chỉ dội thêm request vô ích vào website.
MAX_CONSECUTIVE_FAILURES = 5

ProgressCallback = Callable[[int, int], None]  # (số chương đã xử lý, số chương cần tải)


def _kind(exc: Exception) -> str:
    """Nhóm lỗi ghi kèm dòng log (trường `kind`) để lọc: lỗi tải trang hay lỗi đọc HTML."""
    if isinstance(exc, FetchError):
        return "request"
    return "parse" if isinstance(exc, ParseError) else "other"


@dataclass
class CrawlResult:
    url: str
    run_id: int = 0  # ID của lần crawl này trong bảng crawl_runs
    status: RunStatus = RunStatus.FAILED
    title: str | None = None
    chapters_ok: int = 0
    chapters_failed: int = 0
    # Trong khoảng yêu cầu nhưng không tải: đã có sẵn, hoặc đang lỗi mà không yêu cầu thử lại.
    chapters_skipped: int = 0
    seconds: float = 0.0
    error: str | None = None
    blocked: bool = False  # website từ chối truy cập → nên dừng cả loạt URL cùng website


class CrawlService:
    def __init__(
        self,
        repository: NovelRepository,
        client: HttpClient,
        *,
        content_format: str = "html",
        concurrency: int = 2,
        disabled_sources: Collection[str] = (),
    ) -> None:
        self._repo = repository
        self._client = client
        self._format = content_format
        self._concurrency = concurrency
        self._disabled = disabled_sources

    async def crawl(
        self,
        request: CrawlRequest,
        *,
        force: bool = False,
        retry_failed: bool = True,
        on_progress: ProgressCallback | None = None,
        run_id: int | None = None,
    ) -> CrawlResult:
        """Crawl một truyện. Lỗi của crawler không bị ném ra mà ghi vào kết quả và lịch sử crawl.

        Chạy lại bao nhiêu lần cũng an toàn: chỉ chương chưa tải xong mới được tải
        (`force=True` để tải lại tất cả và chỉ ghi đè những chương có nội dung thay đổi;
        `retry_failed=False` để bỏ qua các chương đang ở trạng thái lỗi).
        `run_id`: lần crawl đã tạo sẵn bằng `start_run` — web UI cần ID trước khi việc crawl bắt đầu.
        """
        started = monotonic()
        if run_id is None:
            run_id = self._repo.start_run(request)
        result = CrawlResult(url=request.url, run_id=run_id)
        log_context = current_run.set(run_id)  # mọi dòng log của lần crawl này mang theo run_id
        novel_id: int | None = None
        log.info("Bắt đầu crawl %s", request.url)
        try:
            crawler = crawler_class_for(request.url, self._disabled)(self._client)
            info = await crawler.fetch_novel(request.url)
            novel_id = self._repo.upsert_novel(crawler.name, info)
            self._repo.update_run(
                run_id, novel_id=novel_id
            )  # ai đang theo dõi biết ngay là truyện nào
            result.title = info.title
            log.info("Truyện: %s — %s (%s)", info.title, info.author or "?", info.status.value)
            if request.with_chapters:
                await self._crawl_chapters(
                    crawler,
                    info,
                    novel_id,
                    request,
                    result,
                    on_progress,
                    force=force,
                    retry_failed=retry_failed,
                )
            result.status = RunStatus.PARTIAL if result.chapters_failed else RunStatus.COMPLETED
        except CrawlerError as exc:
            result.error = str(exc)
            result.blocked = isinstance(exc, BlockedError)
            log.error("Dừng crawl: %s", exc, extra={"url": request.url, "kind": _kind(exc)})
        except asyncio.CancelledError:
            result.status = RunStatus.INTERRUPTED
            raise
        except Exception as exc:  # lỗi ngoài dự kiến: vẫn ghi lịch sử rồi ném tiếp
            result.error = repr(exc)
            raise
        finally:
            result.seconds = monotonic() - started
            self._repo.finish_run(
                run_id,
                result.status,
                novel_id=novel_id,
                ok=result.chapters_ok,
                failed=result.chapters_failed,
                skipped=result.chapters_skipped,
                error=result.error,
            )
            log.info(
                "Kết thúc (%s): tải %d chương, lỗi %d, đã có sẵn %d — %.1fs",
                result.status.value,
                result.chapters_ok,
                result.chapters_failed,
                result.chapters_skipped,
                result.seconds,
                extra={"url": request.url, "run_id": run_id},
            )
            current_run.reset(log_context)
        return result

    async def _crawl_chapters(
        self,
        crawler: BaseCrawler,
        info: NovelInfo,
        novel_id: int,
        request: CrawlRequest,
        result: CrawlResult,
        on_progress: ProgressCallback | None,
        *,
        force: bool,
        retry_failed: bool,
    ) -> None:
        refs = await crawler.fetch_chapter_list(info)
        added = self._repo.sync_chapters(novel_id, refs)
        todo, result.chapters_skipped = self._repo.chapters_to_fetch(
            novel_id,
            request.from_chapter,
            request.to_chapter,
            force=force,
            retry_failed=retry_failed,
        )
        log.info(
            "Mục lục %d chương (%d chương mới); cần tải %d, đã có sẵn %d",
            len(refs),
            added,
            len(todo),
            result.chapters_skipped,
        )

        def report() -> None:
            # Tiến độ ghi vào database sau mỗi chương: web UI và lệnh `status` thấy được lần crawl đang chạy.
            self._repo.update_run(
                result.run_id,
                chapters_total=len(todo),
                chapters_ok=result.chapters_ok,
                chapters_failed=result.chapters_failed,
                chapters_skipped=result.chapters_skipped,
            )
            if on_progress:
                on_progress(result.chapters_ok + result.chapters_failed, len(todo))

        report()
        queue = iter(todo)  # các worker cùng rút việc từ một iterator → giữ đúng thứ tự chương
        failures_in_a_row = 0

        async def worker() -> None:
            nonlocal failures_in_a_row
            for chapter in queue:
                ref = ChapterRef(slug=chapter.slug, url=chapter.url, title=chapter.title)
                try:
                    content = await crawler.fetch_chapter(ref)
                except BlockedError:
                    raise  # dừng cả phiên; chương giữ trạng thái chờ để `resume` tải sau
                except CrawlerError as exc:
                    self._repo.mark_chapter_failed(chapter.id, str(exc))
                    result.chapters_failed += 1
                    failures_in_a_row += 1
                    log.warning(
                        "Chương %d lỗi: %s",
                        chapter.number,
                        exc,
                        extra={"url": chapter.url, "kind": _kind(exc)},
                    )
                    if failures_in_a_row >= MAX_CONSECUTIVE_FAILURES:
                        raise CrawlerError(
                            f"{MAX_CONSECUTIVE_FAILURES} chương lỗi liên tiếp — dừng để không dội "
                            f"request vào website đang gặp sự cố (lỗi gần nhất: {exc})"
                        ) from exc
                else:
                    self._repo.save_chapter(
                        chapter.id,
                        render(content.paragraphs, self._format),
                        self._format,
                        content_hash(content.paragraphs),
                    )
                    result.chapters_ok += 1
                    failures_in_a_row = 0
                report()

        try:
            async with asyncio.TaskGroup() as group:
                for _ in range(min(self._concurrency, len(todo))):
                    group.create_task(worker())
        except ExceptionGroup as errors:
            # TaskGroup gói lỗi của worker vào ExceptionGroup; trả lại đúng lỗi crawler cho `crawl()` xử lý.
            for error in errors.exceptions:
                if isinstance(error, CrawlerError):
                    raise error from None
            raise
