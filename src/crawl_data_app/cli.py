"""Giao diện dòng lệnh: crawl, resume, status, export, sources, init-db, serve (web UI)."""

import argparse
import asyncio
import logging
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError
from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from rich.table import Table

from crawl_data_app.config.logging import setup_logging
from crawl_data_app.config.settings import Settings, get_settings
from crawl_data_app.core.content import split_title, to_paragraphs
from crawl_data_app.core.exceptions import CrawlerError
from crawl_data_app.core.http_client import HttpClient
from crawl_data_app.core.models import CrawlRequest
from crawl_data_app.crawlers import CRAWLERS, crawler_class_for
from crawl_data_app.database.models import ChapterStatus, CrawlRun, RunStatus
from crawl_data_app.database.session import create_db_engine, init_db, make_session_factory
from crawl_data_app.export import WRITERS
from crawl_data_app.repository import NovelRepository
from crawl_data_app.service import CrawlResult, CrawlService

log = logging.getLogger(__name__)

# markup=False: tên truyện / thông báo lỗi có thể chứa dấu [ ] — in nguyên văn, không diễn giải.
out = Console(markup=False)  # kết quả → stdout
# Log và thanh tiến độ → stderr, để không lẫn vào kết quả khi pipe.
err = Console(markup=False, stderr=True)

LOCAL_HOSTS = ("127.0.0.1", "localhost")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crawl-data-app",
        description="Crawl truyện chữ từ các website đọc truyện vào database.",
    )
    commands = parser.add_subparsers(dest="command", required=True, metavar="LỆNH")

    crawl = commands.add_parser(
        "crawl", help="crawl thông tin truyện, tuỳ chọn kèm nội dung chương"
    )
    crawl.add_argument(
        "--url",
        action="append",
        default=[],
        metavar="URL",
        help="URL truyện; lặp lại tham số để crawl nhiều truyện",
    )
    crawl.add_argument(
        "--url-file",
        metavar="FILE",
        help="file danh sách URL, mỗi dòng một URL (dòng bắt đầu bằng # bị bỏ qua)",
    )
    crawl.add_argument("--all-chapters", action="store_true", help="tải nội dung toàn bộ chương")
    crawl.add_argument(
        "--from-chapter", type=int, metavar="N", help="tải từ chương thứ N của mục lục"
    )
    crawl.add_argument("--to-chapter", type=int, metavar="M", help="tải đến hết chương thứ M")
    crawl.add_argument(
        "--force",
        action="store_true",
        help="tải lại cả chương đã có; chỉ ghi đè chương có nội dung thay đổi",
    )

    resume = commands.add_parser("resume", help="chạy tiếp lần crawl gần nhất, bỏ qua phần đã có")
    resume.add_argument(
        "--url",
        action="append",
        default=[],
        metavar="URL",
        help="truyện cần chạy tiếp; bỏ trống = mọi truyện có lần crawl gần nhất chưa hoàn tất",
    )

    status = commands.add_parser("status", help="xem dữ liệu đã lưu và lịch sử crawl")
    status.add_argument(
        "--errors", action="store_true", help="liệt kê chương đang lỗi kèm URL và nguyên nhân"
    )

    export = commands.add_parser(
        "export", help="xuất các chương đã tải ra file .txt, mỗi truyện một file"
    )
    export.add_argument(
        "--novel-id",
        action="append",
        type=int,
        default=[],
        metavar="ID",
        help="ID truyện (xem lệnh status); lặp lại được; bỏ trống = mọi truyện",
    )
    export.add_argument(
        "--out", default="exports", metavar="DIR", help="thư mục đích (mặc định: exports)"
    )

    export.add_argument(
        "--format", choices=sorted(WRITERS), default="txt", help="định dạng file (mặc định: txt)"
    )

    commands.add_parser("sources", help="liệt kê các website được hỗ trợ")
    commands.add_parser("init-db", help="tạo database / nâng schema lên phiên bản mới nhất")

    serve = commands.add_parser("serve", help="chạy web UI và API (mặc định http://127.0.0.1:8000)")
    serve.add_argument(
        "--host",
        default="127.0.0.1",
        help="địa chỉ lắng nghe; mặc định chỉ máy này vì API không có đăng nhập",
    )
    serve.add_argument("--port", type=int, default=8000, help="cổng (mặc định: 8000)")
    serve.add_argument(
        "--ui-dir",
        default="web/dist",
        metavar="DIR",
        help="thư mục chứa bản build của giao diện (mặc định: web/dist)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):  # console/pipe trên Windows mặc định không phải UTF-8
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "sources":
        return _show_sources()
    try:
        settings = get_settings()
    except ValidationError as exc:
        parser.error(f"cấu hình (.env / biến môi trường) không hợp lệ:\n{exc}")
    setup_logging(settings.log, err)
    engine = create_db_engine(settings.database.url)
    try:
        init_db(engine)
        repo = NovelRepository(make_session_factory(engine))
        if args.command == "init-db":
            out.print(f"Database sẵn sàng: {engine.url.render_as_string(hide_password=True)}")
            return 0
        if args.command == "status":
            return _show_status(repo, show_errors=args.errors)
        if args.command == "export":
            return _export(repo, set(args.novel_id), Path(args.out), args.format)
        repo.close_stale_runs()
        if args.command == "serve":
            return _serve(args, repo)
        if args.command == "crawl":
            requests, force = _crawl_requests(args, parser), args.force
        else:
            requests, force = _resume_requests(args, repo, parser), False
        if not requests:
            out.print("Không có lần crawl nào dang dở.")
            return 0
        try:
            results = asyncio.run(_run(requests, settings, repo, force=force))
        except KeyboardInterrupt:
            err.print(
                "Đã dừng theo yêu cầu. Chạy `crawl-data-app resume` để tải tiếp phần còn lại."
            )
            return 130
        _print_results(results)
        done = len(results) == len(requests) and all(
            result.status == RunStatus.COMPLETED for result in results
        )
        return 0 if done else 1
    finally:
        engine.dispose()


def _novel_url(url: str) -> str:
    """Quy URL bất kỳ của truyện (chương, trang mục lục, thiếu dấu / cuối) về URL trang truyện.

    Nhờ vậy `crawl` không chạy hai lần cho cùng một truyện và `resume` tìm lại được lần crawl trước.
    URL chưa được hỗ trợ thì giữ nguyên để service báo lỗi và ghi vào lịch sử.
    """
    try:
        return crawler_class_for(url).novel_url(url)
    except CrawlerError:
        return url


def _crawl_requests(
    args: argparse.Namespace, parser: argparse.ArgumentParser
) -> list[CrawlRequest]:
    urls = list(args.url)
    if args.url_file:
        try:
            with open(args.url_file, encoding="utf-8") as file:
                lines = [line.strip() for line in file]
        except OSError as exc:
            parser.error(f"không đọc được --url-file: {exc}")
        urls += [line for line in lines if line and not line.startswith("#")]
    if not urls:
        parser.error("cần ít nhất một --url hoặc --url-file")
    with_chapters = (
        args.all_chapters or args.from_chapter is not None or args.to_chapter is not None
    )
    try:
        return [
            CrawlRequest(
                url=url,
                with_chapters=with_chapters,
                from_chapter=args.from_chapter,
                to_chapter=args.to_chapter,
            )
            for url in dict.fromkeys(map(_novel_url, urls))  # bỏ truyện trùng, giữ thứ tự
        ]
    except ValidationError as exc:
        parser.error("khoảng chương không hợp lệ: " + "; ".join(e["msg"] for e in exc.errors()))


def _resume_requests(
    args: argparse.Namespace, repo: NovelRepository, parser: argparse.ArgumentParser
) -> list[CrawlRequest]:
    if not args.url:
        return repo.unfinished_requests()
    requests = []
    for url in dict.fromkeys(map(_novel_url, args.url)):
        request = repo.last_request(url)
        if request is None:
            parser.error(f"chưa có lần crawl nào cho {url} — hãy dùng lệnh `crawl` trước")
        requests.append(request)
    return requests


async def _run(
    requests: Sequence[CrawlRequest], settings: Settings, repo: NovelRepository, *, force: bool
) -> list[CrawlResult]:
    client = HttpClient(settings.http)
    service = CrawlService(
        repo,
        client,
        content_format=settings.crawler.content_format,
        concurrency=settings.http.concurrency,
        disabled_sources=settings.crawler.disabled_sources,
    )
    columns = (
        SpinnerColumn(),
        TextColumn("{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        TimeRemainingColumn(),
    )
    results: list[CrawlResult] = []
    try:
        with Progress(*columns, console=err, transient=True) as progress:
            for request in requests:
                task = progress.add_task(request.url.rstrip("/").rsplit("/", 1)[-1], total=None)

                def on_progress(done: int, total: int, task=task) -> None:
                    progress.update(task, completed=done, total=total)

                result = await service.crawl(request, force=force, on_progress=on_progress)
                progress.update(task, visible=False)
                results.append(result)
                if result.blocked:
                    log.error(
                        "Website từ chối truy cập — bỏ qua các URL còn lại. Hãy chờ rồi chạy `resume`, "
                        "cân nhắc tăng HTTP_REQUEST_DELAY."
                    )
                    break
    finally:
        await client.aclose()
    return results


def _table(title: str, *columns: str, wide: Sequence[str]) -> Table:
    """Cột ngắn không ngắt dòng; cột dài (`wide`: tên truyện, URL, lỗi) gập dòng chứ không bị cắt "…"."""
    table = Table(title=title)
    for column in columns:
        if column in wide:
            table.add_column(column, overflow="fold")
        else:
            table.add_column(column, no_wrap=True)
    return table


def _print_results(results: Sequence[CrawlResult]) -> None:
    columns = ("Truyện", "Kết quả", "Tải mới", "Lỗi", "Đã có", "Thời gian", "Ghi chú")
    table = _table("Kết quả crawl", *columns, wide=("Truyện", "Ghi chú"))
    for result in results:
        table.add_row(
            result.title or result.url,
            result.status.value,
            str(result.chapters_ok),
            str(result.chapters_failed),
            str(result.chapters_skipped),
            f"{result.seconds:.1f}s",
            result.error or "",
        )
    out.print(table)


def _local(value: datetime | None) -> str:
    """Giờ UTC trong database → giờ máy, để hiển thị."""
    if value is None:
        return "—"
    return value.replace(tzinfo=UTC).astimezone().strftime("%d/%m/%y %H:%M")


def _scope(run: CrawlRun) -> str:
    if not run.with_chapters:
        return "chỉ thông tin"
    if run.from_chapter is None and run.to_chapter is None:
        return "mọi chương"
    return f"chương {run.from_chapter or 1}–{run.to_chapter or 'cuối'}"


def _show_status(repo: NovelRepository, *, show_errors: bool) -> int:
    columns = ("ID", "Truyện", "Nguồn", "Tình trạng", "Đã tải", "Lỗi", "Crawl gần nhất")
    novels = _table("Truyện đã lưu", *columns, wide=("Truyện",))
    for novel, source, counts in repo.novels_overview():
        total = "?" if novel.total_chapters is None else novel.total_chapters
        novels.add_row(
            str(novel.id),
            novel.title,
            source,
            novel.status,
            f"{counts[ChapterStatus.DONE]}/{total}",
            str(counts[ChapterStatus.FAILED]),
            _local(novel.last_crawled_at),
        )
    out.print(novels)

    columns = ("#", "Bắt đầu", "Phạm vi", "Kết quả", "Tải/Lỗi/Đã có", "URL và ghi chú")
    runs = _table("10 lần crawl gần nhất", *columns, wide=("URL và ghi chú",))
    for run in repo.recent_runs():
        runs.add_row(
            str(run.id),
            _local(run.started_at),
            _scope(run),
            run.status,
            f"{run.chapters_ok}/{run.chapters_failed}/{run.chapters_skipped}",
            "\n".join(filter(None, (run.url, run.error))),
        )
    out.print(runs)

    if show_errors:
        title = "Chương đang lỗi (tối đa 50) — chạy `resume` để thử lại"
        errors = _table(title, "Truyện", "Chương", "URL và lỗi", wide=("Truyện", "URL và lỗi"))
        for novel_title, number, url, error in repo.failed_chapters():
            errors.add_row(novel_title, str(number), "\n".join(filter(None, (url, error))))
        out.print(errors)
    return 0


def _export(repo: NovelRepository, novel_ids: set[int], out_dir: Path, file_format: str) -> int:
    """Ghi `<out_dir>/<slug>.<định dạng>` cho từng truyện có chương đã tải. Trả về 1 nếu không xuất được gì."""
    exported = 0
    for novel, _source, _counts in repo.novels_overview():
        if novel_ids and novel.id not in novel_ids:
            continue
        rows = repo.done_chapters(novel.id)
        if not rows:
            out.print(f"Bỏ qua (chưa có chương nào đã tải): {novel.title}")
            continue
        chapters = [
            (row.number, *split_title(row.title, to_paragraphs(row.content, row.content_format)))
            for row in rows
        ]
        # ponytail: tên file chỉ theo slug; thêm tiền tố nguồn nếu hai website có truyện trùng slug.
        path = out_dir / f"{novel.slug}.{file_format}"
        out_dir.mkdir(parents=True, exist_ok=True)
        WRITERS[file_format](path, novel, chapters)
        out.print(f"Đã xuất {len(chapters)} chương: {path}")
        exported += 1
    if not exported:
        out.print("Không có truyện nào để xuất.")
    return 0 if exported else 1


def _serve(args: argparse.Namespace, repo: NovelRepository) -> int:
    # Nạp tại đây chứ không ở đầu file: các lệnh còn lại không phải chờ import web framework.
    import uvicorn

    from crawl_data_app.web.app import create_app

    ui_dir = Path(args.ui_dir)
    if not (ui_dir / "index.html").is_file():
        err.print(
            f"Chưa có bản build giao diện ở {ui_dir} — chỉ phục vụ API (/api, tài liệu ở /docs). "
            "Chạy `npm run build` trong thư mục web/, hoặc `npm run dev` khi đang phát triển."
        )
    # Chỉ nghe trên máy này → chỉ nhận request gọi đúng tên máy này (chặn DNS rebinding).
    allowed_hosts = LOCAL_HOSTS if args.host in LOCAL_HOSTS else None
    if allowed_hosts is None and args.host != "::1":
        err.print(
            f"CẢNH BÁO: đang mở web UI ra {args.host}. API không có đăng nhập — bất kỳ ai truy cập "
            "được địa chỉ này đều điều khiển được crawler và sửa được cấu hình."
        )
    app = create_app(repo, ui_dir=ui_dir, allowed_hosts=allowed_hosts)
    # access_log=False: giao diện hỏi tiến độ vài giây một lần, ghi từng request chỉ làm nhiễu console.
    uvicorn.run(app, host=args.host, port=args.port, access_log=False)
    return 0


def _show_sources() -> int:
    table = Table(title="Website được hỗ trợ")
    table.add_column("Tên")
    table.add_column("Tên miền đã biết")
    for crawler in CRAWLERS:
        table.add_row(crawler.name, ", ".join(crawler.domains))
    out.print(table)
    return 0
