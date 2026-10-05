"""API HTTP cho web UI: bọc `NovelRepository`, `CrawlService` (qua `JobManager`) và cấu hình sẵn có.

Không có logic crawl nào ở đây — mỗi endpoint chỉ đổi dữ liệu của tầng dưới sang JSON và ngược lại.
"""

import asyncio
import logging
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from time import monotonic
from typing import Annotated, Literal
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import Row, make_url
from starlette.middleware.trustedhost import TrustedHostMiddleware

from crawl_data_app import __version__
from crawl_data_app.config.logging import read_logs
from crawl_data_app.config.settings import HttpSettings, env_values, load_settings, save_env
from crawl_data_app.core.base_crawler import BaseCrawler
from crawl_data_app.core.content import split_title, to_paragraphs
from crawl_data_app.core.exceptions import CrawlerError, SourceDisabledError, UnsupportedSiteError
from crawl_data_app.core.models import CrawlRequest
from crawl_data_app.crawlers import CRAWLERS, crawler_class_for
from crawl_data_app.database.models import ChapterStatus, CrawlRun, RunStatus
from crawl_data_app.repository import NovelRepository
from crawl_data_app.web.jobs import DuplicateJobError, JobManager
from crawl_data_app.web.schemas import (
    ChapterContent,
    ChapterOut,
    ConnectionTest,
    JobCreate,
    JobOut,
    LogEntry,
    NovelOut,
    Page,
    SettingsOut,
    SettingsUpdate,
    SourceOut,
    SourceUpdate,
    Stats,
)

PageNumber = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=200)]


class ApiError(Exception):
    """Lỗi trả về client dạng `{"code": ..., "detail": "câu thông báo cho người dùng"}`."""

    def __init__(self, status: int, code: str, detail: str, **extra: object) -> None:
        super().__init__(detail)
        self.status = status
        self.body = {"code": code, "detail": detail, **extra}


def _url_error(exc: CrawlerError) -> ApiError:
    if isinstance(exc, UnsupportedSiteError):
        return ApiError(400, "unsupported_source", str(exc))
    if isinstance(exc, SourceDisabledError):
        return ApiError(409, "source_disabled", str(exc))
    return ApiError(400, "invalid_url", str(exc))


def _window(page: int, page_size: int) -> dict[str, int]:
    return {"limit": page_size, "offset": (page - 1) * page_size}


def _novel_out(row: Row) -> NovelOut:
    novel = row.Novel
    return NovelOut(
        id=novel.id,
        source=row.source,
        slug=novel.slug,
        url=novel.url,
        title=novel.title,
        author=novel.author,
        genres=novel.genres,
        description=novel.description,
        cover_url=novel.cover_url,
        status=novel.status,
        total_chapters=novel.total_chapters,
        chapters_done=row.done,
        chapters_failed=row.failed,
        chapters_pending=row.pending,
        published_at=novel.published_at,
        last_crawled_at=novel.last_crawled_at,
    )


def create_app(
    repo: NovelRepository,
    *,
    env_file: str | Path = ".env",
    ui_dir: Path | None = None,
    allowed_hosts: Sequence[str] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> FastAPI:
    """Dựng ứng dụng web.

    `allowed_hosts`: các tên máy được chấp nhận trong header Host (None = không kiểm tra).
    `transport` và `sleep` chỉ để test thay tầng mạng, như ở `HttpClient`.
    """
    env_path = Path(env_file)
    settings = load_settings(env_path)
    jobs = JobManager(repo, lambda: settings, transport=transport, sleep=sleep)

    def reload_settings() -> None:
        nonlocal settings
        settings = load_settings(env_path)
        logging.getLogger().setLevel(settings.log.level)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        await jobs.shutdown()

    # API không có đăng nhập, nên phải chắc rằng chỉ chính giao diện này gọi được nó — chứ không phải
    # một website bất kỳ đang mở trong trình duyệt của người dùng.
    def reject_cross_site_writes(request: Request) -> None:
        # Chống CSRF: trình duyệt luôn gửi Origin kèm request ghi; Origin khác Host nghĩa là request
        # do một trang web khác gửi tới.
        origin = request.headers.get("origin")
        if (
            request.method not in ("GET", "HEAD", "OPTIONS")
            and origin is not None
            and urlsplit(origin).netloc != request.headers.get("host")
        ):
            raise ApiError(
                403, "cross_origin", "Yêu cầu được gửi từ một trang web khác nên bị từ chối"
            )

    app = FastAPI(title="crawl-data-app", version=__version__, lifespan=lifespan)
    if allowed_hosts:
        # Chống DNS rebinding: tên miền lạ trỏ về 127.0.0.1 vẫn mang header Host của chính nó.
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(allowed_hosts))
    api = APIRouter(prefix="/api", dependencies=[Depends(reject_cross_site_writes)])

    @app.exception_handler(ApiError)
    async def api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(exc.body, status_code=exc.status)

    # --- Tổng quan ----------------------------------------------------------------------------

    @api.get("/stats")
    async def stats() -> Stats:
        novels, chapters, runs = repo.totals()
        return Stats(
            novels=novels,
            chapters={status.value: chapters[status] for status in ChapterStatus},
            jobs={status.value: runs[status] for status in RunStatus},
        )

    # --- Nguồn --------------------------------------------------------------------------------

    def find_crawler(name: str) -> type[BaseCrawler]:
        for crawler in CRAWLERS:
            if crawler.name == name:
                return crawler
        raise ApiError(404, "not_found", f"Không có nguồn nào tên {name}")

    def source_out(crawler: type[BaseCrawler], totals: dict[str, tuple[int, int]]) -> SourceOut:
        novels, chapters = totals.get(crawler.name, (0, 0))
        return SourceOut(
            name=crawler.name,
            domains=list(crawler.domains),
            description=(sys.modules[crawler.__module__].__doc__ or "").strip(),
            enabled=crawler.name not in settings.crawler.disabled_sources,
            novels=novels,
            chapters_done=chapters,
        )

    @api.get("/sources")
    async def list_sources() -> list[SourceOut]:
        totals = repo.source_totals()
        return [source_out(crawler, totals) for crawler in CRAWLERS]

    @api.put("/sources/{name}")
    async def update_source(name: str, body: SourceUpdate) -> SourceOut:
        """Bật/tắt một nguồn. Job đang chạy không bị ảnh hưởng; nguồn tắt thì không nhận job mới."""
        crawler = find_crawler(name)
        disabled = set(settings.crawler.disabled_sources) - {name}
        if not body.enabled:
            disabled.add(name)
        save_env(env_path, {"CRAWLER_DISABLED_SOURCES": sorted(disabled)})
        reload_settings()
        return source_out(crawler, repo.source_totals())

    @api.post("/sources/{name}/test")
    async def test_source(name: str) -> ConnectionTest:
        """Tải thử trang chủ của nguồn: một request, vẫn theo robots.txt và nhịp giãn cách chung."""
        url = f"https://{find_crawler(name).domains[0]}/"
        started = monotonic()
        try:
            page = await jobs.fetch(url)
        except CrawlerError as exc:
            ok, message = False, str(exc)
        else:
            ok, message, url = True, "Kết nối được và robots.txt cho phép truy cập", page.url
        elapsed_ms = round((monotonic() - started) * 1000)
        return ConnectionTest(ok=ok, message=message, url=url, elapsed_ms=elapsed_ms)

    # --- Truyện và chương ---------------------------------------------------------------------

    @api.get("/novels")
    async def list_novels(
        search: str = "",
        source: str = "",
        status: str = "",
        sort: Literal["title", "total_chapters", "done", "last_crawled_at"] = "last_crawled_at",
        order: Literal["asc", "desc"] = "desc",
        page: PageNumber = 1,
        page_size: PageSize = 20,
    ) -> Page[NovelOut]:
        rows, total = repo.novels_page(
            search=search.strip(),
            source=source,
            status=status,
            sort=sort,
            descending=order == "desc",
            **_window(page, page_size),
        )
        return Page(items=[_novel_out(row) for row in rows], total=total)

    @api.get("/novels/{novel_id}")
    async def get_novel(novel_id: int) -> NovelOut:
        rows, _ = repo.novels_page(novel_id=novel_id)
        if not rows:
            raise ApiError(404, "not_found", f"Không có truyện #{novel_id}")
        return _novel_out(rows[0])

    @api.get("/novels/{novel_id}/chapters")
    async def list_chapters(
        novel_id: int,
        status: Literal["", "pending", "done", "failed"] = "",
        page: PageNumber = 1,
        page_size: PageSize = 50,
    ) -> Page[ChapterOut]:
        rows, total = repo.chapters_page(novel_id, status=status, **_window(page, page_size))
        return Page(items=[ChapterOut(**row._mapping) for row in rows], total=total)

    @api.get("/novels/{novel_id}/chapters/{number}")
    async def get_chapter(novel_id: int, number: int) -> ChapterContent:
        row = repo.chapter(novel_id, number)
        if row is None:
            raise ApiError(404, "not_found", f"Truyện #{novel_id} không có chương số {number}")
        title, paragraphs = row.title, []
        if row.content:
            title, paragraphs = split_title(
                row.title, to_paragraphs(row.content, row.content_format)
            )
        return ChapterContent(
            number=row.number,
            title=title,
            url=row.url,
            status=row.status,
            error=row.error,
            crawled_at=row.crawled_at,
            paragraphs=paragraphs,
        )

    # --- Job crawl ----------------------------------------------------------------------------

    def job_out(run: CrawlRun, novel_title: str | None, *, detail: bool = False) -> JobOut:
        last_chapter = None
        if detail and run.novel_id and run.status == RunStatus.RUNNING:
            chapter = repo.latest_chapter(run.novel_id, run.started_at)
            last_chapter = chapter.title if chapter else None
        return JobOut(
            id=run.id,
            url=run.url,
            novel_id=run.novel_id,
            novel_title=novel_title,
            with_chapters=run.with_chapters,
            from_chapter=run.from_chapter,
            to_chapter=run.to_chapter,
            status=run.status,
            chapters_total=run.chapters_total,
            chapters_ok=run.chapters_ok,
            chapters_failed=run.chapters_failed,
            chapters_skipped=run.chapters_skipped,
            error=run.error,
            started_at=run.started_at,
            finished_at=run.finished_at,
            active=jobs.is_active(run.id),
            last_chapter=last_chapter,
        )

    def find_job(job_id: int, *, detail: bool = False) -> JobOut:
        rows, _ = repo.runs_page(run_id=job_id)
        if not rows:
            raise ApiError(404, "not_found", f"Không có job #{job_id}")
        run, novel_title = rows[0]
        return job_out(run, novel_title, detail=detail)

    async def launch(
        request: CrawlRequest,
        *,
        source: str | None = None,
        force: bool = False,
        retry_failed: bool = True,
    ) -> JobOut:
        try:
            if source and crawler_class_for(request.url).name != source:
                raise ApiError(400, "unsupported_source", f"URL này không thuộc nguồn {source}")
            run_id = await jobs.start(request, force=force, retry_failed=retry_failed)
        except DuplicateJobError as exc:
            raise ApiError(409, "duplicate_job", str(exc), job_id=exc.run_id) from exc
        except CrawlerError as exc:
            raise _url_error(exc) from exc
        return find_job(run_id, detail=True)

    @api.post("/crawl/jobs", status_code=201)
    async def create_job(body: JobCreate) -> JobOut:
        url = body.url.strip()
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            raise ApiError(
                400, "invalid_url", "URL không hợp lệ — cần dạng https://ten-mien/ten-truyen/"
            )
        request = CrawlRequest(
            url=url,
            with_chapters=body.with_chapters,
            from_chapter=body.from_chapter,
            to_chapter=body.to_chapter,
        )
        return await launch(
            request, source=body.source, force=body.force, retry_failed=body.retry_failed
        )

    @api.get("/crawl/jobs")
    async def list_jobs(
        status: str = "",
        novel_id: int | None = None,
        page: PageNumber = 1,
        page_size: PageSize = 20,
    ) -> Page[JobOut]:
        rows, total = repo.runs_page(status=status, novel_id=novel_id, **_window(page, page_size))
        return Page(items=[job_out(run, title) for run, title in rows], total=total)

    @api.get("/crawl/jobs/{job_id}")
    async def get_job(job_id: int) -> JobOut:
        return find_job(job_id, detail=True)

    @api.post("/crawl/jobs/{job_id}/pause")
    async def pause_job(job_id: int) -> JobOut:
        """Tạm dừng: job chuyển sang `interrupted`, phần đã tải được giữ nguyên, sau đó `resume` được."""
        find_job(job_id)
        if not await jobs.stop(job_id, RunStatus.INTERRUPTED):
            raise ApiError(
                409, "job_not_running", "Job không còn chạy trên web nên không tạm dừng được"
            )
        return find_job(job_id, detail=True)

    @api.post("/crawl/jobs/{job_id}/cancel")
    async def cancel_job(job_id: int) -> JobOut:
        """Huỷ job đang chạy hoặc đang tạm dừng: job chuyển sang `cancelled` và không tự chạy lại."""
        job = find_job(job_id)
        if not await jobs.stop(job_id, RunStatus.CANCELLED):
            if job.status != RunStatus.INTERRUPTED:
                raise ApiError(409, "job_not_running", "Job đã kết thúc nên không huỷ được")
            repo.update_run(job_id, status=RunStatus.CANCELLED)
        return find_job(job_id, detail=True)

    @api.post("/crawl/jobs/{job_id}/resume", status_code=201)
    @api.post("/crawl/jobs/{job_id}/retry", status_code=201)
    async def rerun_job(job_id: int) -> JobOut:
        """Chạy lại đúng phạm vi của một job cũ, thành job mới.

        "Tiếp tục" và "thử lại chương lỗi" là một việc: chương đã xong được bỏ qua, chương chưa tải
        hoặc đang lỗi thì được tải — đúng quy ước của lệnh `resume`.
        """
        if find_job(job_id).status == RunStatus.RUNNING:
            raise ApiError(409, "job_running", "Job vẫn đang chạy")
        request = repo.run_request(job_id)
        assert request is not None  # find_job vừa xác nhận job tồn tại
        return await launch(request)

    # --- Log và cấu hình ----------------------------------------------------------------------

    @api.get("/logs")
    def get_logs(  # `def` thường: FastAPI chạy trong thread riêng, việc đọc file không chặn các job
        level: Literal["", "DEBUG", "INFO", "WARNING", "ERROR"] = "",
        kind: Literal["", "request", "parse", "other"] = "",
        job_id: int | None = None,
        search: str = "",
        limit: Annotated[int, Query(ge=1, le=1000)] = 200,
    ) -> list[LogEntry]:
        return read_logs(
            settings.log.dir,
            level=level,
            kind=kind,
            run_id=job_id,
            search=search.strip(),
            limit=limit,
        )

    def settings_out() -> SettingsOut:
        return SettingsOut(
            http=settings.http,
            crawler=settings.crawler,
            log=settings.log,
            database_url=make_url(settings.database.url).render_as_string(hide_password=True),
            env_file=str(env_path.resolve()),
        )

    @api.get("/settings")
    async def get_settings() -> SettingsOut:
        return settings_out()

    @api.put("/settings")
    async def update_settings(body: SettingsUpdate) -> SettingsOut:
        """Ghi cấu hình vào file `.env` rồi nạp lại.

        Chỉ những trường sửa được trên UI mới được ghi: `http.*`, `crawler.content_format`, `log.level`.
        Database và thư mục log phải sửa trong `.env` rồi khởi động lại server.
        """
        save_env(
            env_path,
            env_values(body.http, HttpSettings.model_fields)
            | env_values(body.crawler, ["content_format"])
            | env_values(body.log, ["level"]),
        )
        reload_settings()
        return settings_out()

    app.include_router(api)

    # --- Giao diện (bản build của web/) -------------------------------------------------------

    if ui_dir is not None and (ui_dir / "index.html").is_file():
        if (ui_dir / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=ui_dir / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def ui(path: str) -> FileResponse:
            # Ứng dụng một trang: mọi đường dẫn không phải API đều trả index.html, router phía trình
            # duyệt lo phần còn lại. Không đọc file theo `path` nên không có rủi ro path traversal.
            if path.startswith("api/"):
                raise ApiError(404, "not_found", "Không có API này")
            return FileResponse(ui_dir / "index.html")

    return app
