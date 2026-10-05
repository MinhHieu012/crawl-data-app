"""Luồng crawl đầu-cuối: website giả → HttpClient → crawler → service → repository → SQLite."""

import asyncio
from datetime import datetime

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import undefer

from crawl_data_app.core.models import ChapterRef, CrawlRequest, NovelInfo
from crawl_data_app.database.models import (
    Chapter,
    ChapterStatus,
    CrawlRun,
    Novel,
    RunStatus,
    Source,
)
from crawl_data_app.service import MAX_CONSECUTIVE_FAILURES, CrawlService

pytestmark = pytest.mark.anyio


@pytest.fixture
def service(repo, make_client) -> CrawlService:
    return CrawlService(repo, make_client(), concurrency=2)


def everything(url: str) -> CrawlRequest:
    return CrawlRequest(url=url, with_chapters=True)


def stored_chapters(db) -> list[Chapter]:
    with db() as session:
        query = select(Chapter).options(undefer(Chapter.content)).order_by(Chapter.number)
        return list(session.scalars(query))


def count(db, model) -> int:
    with db() as session:
        return session.scalar(select(func.count()).select_from(model))


def server_error(request: httpx.Request) -> httpx.Response:
    return httpx.Response(500, text="lỗi máy chủ")


# --- Crawl cơ bản -----------------------------------------------------------------------------


async def test_info_only_crawl_saves_metadata_with_a_single_page_request(service, site, db):
    root = site.add_novel("truyen-a", chapters=5, title="Truyện A", status="Full")

    result = await service.crawl(CrawlRequest(url=root))

    assert result.status is RunStatus.COMPLETED
    assert result.title == "Truyện A"
    with db() as session:
        novel = session.scalars(select(Novel)).one()
        source = session.get(Source, novel.source_id)
    assert source.name == "truyenfull"
    assert (novel.slug, novel.url, novel.title) == ("truyen-a", root, "Truyện A")
    assert novel.author == "Tác Giả Mẫu"
    assert novel.genres == ["Tiên Hiệp", "Huyền Huyễn"]
    assert novel.description == "Giới thiệu Truyện A."
    assert novel.cover_url == "https://img.example.test/bia.jpg"
    assert novel.status == "completed"
    assert novel.published_at == datetime(2026, 9, 5, 8, 9, 24)  # 15:09 +07:00 → lưu theo UTC
    assert novel.source_updated_at is None  # nguồn không công bố → không bịa
    assert novel.last_crawled_at is not None
    assert count(db, Chapter) == 0
    assert site.requests_to("chuong-") == 0
    assert site.requests_to("trang-") == 0


async def test_full_crawl_stores_every_chapter_in_order(service, site, db):
    root = site.add_novel("truyen-a", chapters=7, per_page=3)  # mục lục 3 trang

    result = await service.crawl(everything(root))

    assert (result.status, result.chapters_ok, result.chapters_failed) == (
        RunStatus.COMPLETED,
        7,
        0,
    )
    chapters = stored_chapters(db)
    assert [c.number for c in chapters] == [1, 2, 3, 4, 5, 6, 7]
    assert [c.slug for c in chapters] == [f"chuong-{n}" for n in range(1, 8)]
    assert chapters[0].title == "Chương 1: Tên chương 1"
    assert chapters[0].url == f"{root}chuong-1/"
    assert chapters[0].content == "<p>Mở đầu chương 1.</p>\n<p>Kết thúc chương 1.</p>"
    assert all(c.status == ChapterStatus.DONE and c.content_format == "html" for c in chapters)
    assert all(c.content_hash and c.crawled_at for c in chapters)
    with db() as session:
        assert session.scalars(select(Novel)).one().total_chapters == 7
    assert site.hits[root] == 1  # trang truyện dùng luôn làm trang 1 của mục lục
    assert site.hits[f"{root}trang-2/"] == site.hits[f"{root}trang-3/"] == 1


async def test_markdown_format_is_stored_when_configured(repo, make_client, site, db):
    root = site.add_novel("truyen-a", chapters=1)
    site.set_chapter(root, 1, "- Chào *ngươi*.<br><br>Hắn gật đầu.")
    service = CrawlService(repo, make_client(), content_format="markdown")

    await service.crawl(everything(root))

    chapter = stored_chapters(db)[0]
    assert chapter.content_format == "markdown"
    assert chapter.content == "\\- Chào \\*ngươi\\*.\n\nHắn gật đầu."


async def test_chapter_range_only_fetches_the_requested_chapters(service, site, db):
    root = site.add_novel("truyen-a", chapters=8)

    result = await service.crawl(
        CrawlRequest(url=root, with_chapters=True, from_chapter=3, to_chapter=5)
    )

    assert (result.chapters_ok, result.chapters_skipped) == (3, 0)
    statuses = {c.number: c.status for c in stored_chapters(db)}
    assert [n for n, s in statuses.items() if s == ChapterStatus.DONE] == [3, 4, 5]
    assert len(statuses) == 8  # cả mục lục được ghi nhận, phần ngoài khoảng ở trạng thái chờ
    assert site.requests_to("chuong-1/") == site.requests_to("chuong-6/") == 0


async def test_progress_callback_reports_every_chapter(service, site):
    root = site.add_novel("truyen-a", chapters=4)
    seen: list[tuple[int, int]] = []

    await service.crawl(
        everything(root), on_progress=lambda done, total: seen.append((done, total))
    )

    assert seen[0] == (0, 4)
    assert seen[-1] == (4, 4)
    assert len(seen) == 5


# --- Chống trùng lặp và crawl tăng dần -----------------------------------------------------------


async def test_crawling_again_fetches_nothing_and_duplicates_nothing(service, site, db):
    root = site.add_novel("truyen-a", chapters=4)
    await service.crawl(everything(root))

    again = await service.crawl(everything(root))

    assert (again.status, again.chapters_ok, again.chapters_skipped) == (RunStatus.COMPLETED, 0, 4)
    assert (count(db, Source), count(db, Novel), count(db, Chapter)) == (1, 1, 4)
    assert all(site.hits[f"{root}chuong-{n}/"] == 1 for n in range(1, 5))


async def test_only_new_chapters_are_fetched_after_the_source_updates(service, site, db):
    root = site.add_novel("truyen-a", chapters=4)
    await service.crawl(everything(root))
    with db() as session:
        before = session.scalars(select(Novel)).one().updated_at

    unchanged = await service.crawl(everything(root))
    with db() as session:
        assert session.scalars(select(Novel)).one().updated_at == before
    assert unchanged.chapters_ok == 0

    site.add_novel("truyen-a", chapters=6)  # website ra thêm 2 chương
    result = await service.crawl(everything(root))

    assert (result.chapters_ok, result.chapters_skipped) == (2, 4)
    assert [c.number for c in stored_chapters(db)] == [1, 2, 3, 4, 5, 6]
    assert site.hits[f"{root}chuong-1/"] == 1
    assert site.hits[f"{root}chuong-6/"] == 1
    with db() as session:
        novel = session.scalars(select(Novel)).one()
    assert novel.total_chapters == 6
    assert novel.updated_at > before  # có chương mới → ghi nhận truyện vừa được cập nhật


async def test_same_novel_on_another_domain_is_not_duplicated(service, site, db):
    old = site.add_novel("truyen-a", chapters=2, base="https://truyenfull.vn")
    new = site.add_novel("truyen-a", chapters=2, base="https://truyenfull.live")
    await service.crawl(everything(old))

    result = await service.crawl(everything(new))

    assert (result.chapters_ok, result.chapters_skipped) == (0, 2)
    assert (count(db, Novel), count(db, Chapter)) == (1, 2)
    with db() as session:
        assert session.scalars(select(Novel)).one().url == new  # URL gốc theo tên miền mới nhất


async def test_redirected_novel_is_stored_under_its_final_url(service, site, db):
    new = site.add_novel("truyen-a", chapters=1, base="https://truyenfull.live")
    site.pages["https://truyenfull.vn/truyen-a/"] = lambda request: httpx.Response(
        301, headers={"Location": new}
    )

    result = await service.crawl(everything("https://truyenfull.vn/truyen-a/"))

    assert result.chapters_ok == 1
    with db() as session:
        assert session.scalars(select(Novel)).one().url == new


async def test_unchanged_metadata_does_not_bump_updated_at(service, site, db):
    root = site.add_novel("truyen-a", chapters=1, status="Đang ra")
    await service.crawl(CrawlRequest(url=root))
    with db() as session:
        first = session.scalars(select(Novel)).one().updated_at

    await service.crawl(CrawlRequest(url=root))
    with db() as session:
        assert session.scalars(select(Novel)).one().updated_at == first

    site.add_novel("truyen-a", chapters=1, status="Full")  # truyện vừa hoàn thành
    await service.crawl(CrawlRequest(url=root))
    with db() as session:
        novel = session.scalars(select(Novel)).one()
    assert novel.status == "completed"
    assert novel.updated_at > first


async def test_force_refetches_and_rewrites_only_changed_chapters(service, site, db):
    root = site.add_novel("truyen-a", chapters=3)
    await service.crawl(everything(root))
    before = {c.number: c for c in stored_chapters(db)}
    site.set_chapter(root, 2, "Bản đã được biên tập lại.")

    normal = await service.crawl(everything(root))
    forced = await service.crawl(everything(root), force=True)

    assert normal.chapters_ok == 0  # không có tín hiệu thay đổi → không tải lại
    assert forced.chapters_ok == 3
    after = {c.number: c for c in stored_chapters(db)}
    assert after[2].content == "<p>Bản đã được biên tập lại.</p>"
    assert after[2].content_hash != before[2].content_hash
    assert after[2].updated_at > before[2].updated_at
    assert after[1].updated_at == before[1].updated_at  # nội dung y nguyên → không ghi đè


def test_renamed_chapter_is_queued_for_refetch(repo):
    novel_id = repo.upsert_novel(
        "truyenfull", NovelInfo(slug="a", url="https://x.test/a/", title="A")
    )
    ref = ChapterRef(slug="chuong-1", url="https://x.test/a/chuong-1/", title="Chương 1")
    repo.sync_chapters(novel_id, [ref])
    todo, _ = repo.chapters_to_fetch(novel_id, None, None)
    repo.save_chapter(todo[0].id, "<p>cũ</p>", "html", "hash-cu")
    assert repo.chapters_to_fetch(novel_id, None, None) == ([], 1)

    added = repo.sync_chapters(novel_id, [ref.model_copy(update={"title": "Chương 1: Bản sửa"})])

    todo, skipped = repo.chapters_to_fetch(novel_id, None, None)
    assert added == 0
    assert [(row.number, row.title) for row in todo] == [(1, "Chương 1: Bản sửa")]
    assert skipped == 0


# --- Lỗi và khả năng chạy tiếp --------------------------------------------------------------------


async def test_failed_chapter_is_recorded_with_its_url_and_retried_next_time(
    service, site, db, repo
):
    root = site.add_novel("truyen-a", chapters=4)
    site.pages[f"{root}chuong-2/"] = server_error

    result = await service.crawl(everything(root))

    assert (result.status, result.chapters_ok, result.chapters_failed) == (RunStatus.PARTIAL, 3, 1)
    failed = stored_chapters(db)[1]
    assert failed.status == ChapterStatus.FAILED
    assert failed.content is None
    assert "HTTP 500" in failed.error and f"{root}chuong-2/" in failed.error
    assert [(row.number, row.url) for row in repo.failed_chapters()] == [(2, f"{root}chuong-2/")]
    assert site.hits[f"{root}chuong-2/"] == 3  # 1 lần + 2 lần thử lại (max_retries=2)

    site.set_chapter(root, 2, "Đã tải được.")
    retry = await service.crawl(everything(root))

    assert (retry.status, retry.chapters_ok, retry.chapters_skipped) == (RunStatus.COMPLETED, 1, 3)
    fixed = stored_chapters(db)[1]
    assert (fixed.status, fixed.error, fixed.content) == ("done", None, "<p>Đã tải được.</p>")
    assert repo.failed_chapters() == []


async def test_resume_repeats_the_last_request_until_it_completes(service, site, repo):
    root = site.add_novel("truyen-a", chapters=6)
    site.pages[f"{root}chuong-3/"] = server_error
    request = CrawlRequest(url=root, with_chapters=True, from_chapter=1, to_chapter=4)
    await service.crawl(request)

    assert repo.unfinished_requests() == [request]
    assert repo.last_request(root) == request
    assert repo.last_request("https://truyenfull.live/chua-tung-crawl/") is None

    site.set_chapter(root, 3, "Ổn rồi.")
    resumed = await service.crawl(repo.unfinished_requests()[0])

    assert (resumed.chapters_ok, resumed.chapters_skipped) == (1, 3)  # vẫn đúng khoảng 1–4
    assert repo.unfinished_requests() == []
    assert site.requests_to("chuong-5/") == 0


async def test_interrupted_crawl_continues_from_where_it_stopped(repo, make_client, site, db):
    root = site.add_novel("truyen-a", chapters=4)
    reached = asyncio.Event()

    async def hang(request: httpx.Request) -> httpx.Response:
        reached.set()
        await asyncio.Event().wait()  # treo cho tới khi bị huỷ, như lúc người dùng bấm Ctrl+C
        raise AssertionError("không bao giờ tới đây")

    site.pages[f"{root}chuong-3/"] = hang
    service = CrawlService(repo, make_client(), concurrency=1)

    task = asyncio.create_task(service.crawl(everything(root)))
    await asyncio.wait_for(reached.wait(), timeout=5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert repo.recent_runs()[0].status == RunStatus.INTERRUPTED
    assert [c.status for c in stored_chapters(db)] == ["done", "done", "pending", "pending"]
    assert repo.unfinished_requests() == [everything(root)]

    site.set_chapter(root, 3, "Chương 3 đã tải lại được.")
    resumed = await service.crawl(repo.unfinished_requests()[0])

    assert (resumed.status, resumed.chapters_ok, resumed.chapters_skipped) == ("completed", 2, 2)
    assert site.hits[f"{root}chuong-1/"] == site.hits[f"{root}chuong-2/"] == 1


def test_runs_left_running_by_a_killed_process_are_closed(repo):
    repo.start_run(everything("https://truyenfull.live/truyen-a/"))

    assert repo.close_stale_runs() == 1
    assert repo.recent_runs()[0].status == RunStatus.INTERRUPTED
    assert repo.unfinished_requests() == [everything("https://truyenfull.live/truyen-a/")]


async def test_blocked_by_the_site_stops_immediately_and_keeps_chapters_pending(
    repo, make_client, site, db
):
    root = site.add_novel("truyen-a", chapters=4)
    site.pages[f"{root}chuong-2/"] = lambda request: httpx.Response(
        403, headers={"cf-mitigated": "challenge"}, text="Just a moment..."
    )
    service = CrawlService(repo, make_client(), concurrency=1)

    result = await service.crawl(everything(root))

    assert result.status is RunStatus.FAILED
    assert result.blocked
    assert "từ chối" in result.error
    assert [c.status for c in stored_chapters(db)] == ["done", "pending", "pending", "pending"]
    assert site.hits[f"{root}chuong-2/"] == 1  # không thử lại, không tìm cách vượt
    assert site.requests_to("chuong-3/") == 0


async def test_stops_after_too_many_consecutive_failures(repo, make_client, site, db):
    root = site.add_novel("truyen-a", chapters=10)
    for n in range(1, 11):
        site.pages[f"{root}chuong-{n}/"] = server_error
    service = CrawlService(repo, make_client(max_retries=0), concurrency=1)

    result = await service.crawl(everything(root))

    assert result.status is RunStatus.FAILED
    assert result.chapters_failed == MAX_CONSECUTIVE_FAILURES
    assert "lỗi liên tiếp" in result.error
    assert site.requests_to(f"chuong-{MAX_CONSECUTIVE_FAILURES + 1}/") == 0


async def test_changed_page_structure_is_reported_and_nothing_is_stored(service, site, db):
    site.pages["https://truyenfull.live/truyen-a/"] = (
        "<html><body><h1>Giao diện mới</h1></body></html>"
    )

    result = await service.crawl(everything("https://truyenfull.live/truyen-a/"))

    assert result.status is RunStatus.FAILED
    assert "Không tìm thấy tên truyện" in result.error
    assert count(db, Novel) == 0


async def test_chapter_with_changed_structure_fails_without_storing_content(service, site, db):
    root = site.add_novel("truyen-a", chapters=2)
    site.pages[f"{root}chuong-1/"] = "<html><body><article>bố cục mới</article></body></html>"

    result = await service.crawl(everything(root))

    assert (result.status, result.chapters_ok, result.chapters_failed) == (RunStatus.PARTIAL, 1, 1)
    broken = stored_chapters(db)[0]
    assert broken.status == ChapterStatus.FAILED
    assert broken.content is None
    assert "#chapter-c" in broken.error


async def test_missing_novel_is_reported(service, db):
    result = await service.crawl(everything("https://truyenfull.live/khong-ton-tai/"))

    assert result.status is RunStatus.FAILED
    assert "HTTP 404" in result.error
    assert count(db, Novel) == 0


async def test_unsupported_site_is_rejected_without_any_request(service, site, db):
    result = await service.crawl(everything("https://example.com/truyen/abc/"))

    assert result.status is RunStatus.FAILED
    assert "Chưa hỗ trợ" in result.error
    assert not site.hits
    with db() as session:
        run = session.scalars(select(CrawlRun)).one()
    assert (run.status, run.novel_id) == ("failed", None)


async def test_robots_txt_disallow_is_obeyed(service, site, db):
    root = site.add_novel("truyen-a", chapters=2)
    site.robots = "User-agent: *\nDisallow: /\n"

    result = await service.crawl(everything(root))

    assert result.status is RunStatus.FAILED
    assert "robots.txt" in result.error
    assert list(site.hits) == ["https://truyenfull.live/robots.txt"]
    assert count(db, Novel) == 0


async def test_every_run_is_recorded_in_history(service, site, repo):
    root = site.add_novel("truyen-a", chapters=3)
    site.pages[f"{root}chuong-2/"] = server_error
    await service.crawl(CrawlRequest(url=root, with_chapters=True, from_chapter=1, to_chapter=2))

    run = repo.recent_runs()[0]

    assert (run.url, run.with_chapters, run.from_chapter, run.to_chapter) == (root, True, 1, 2)
    assert (run.status, run.chapters_ok, run.chapters_failed, run.chapters_skipped) == (
        "partial",
        1,
        1,
        0,
    )
    assert run.novel_id is not None
    assert run.started_at <= run.finished_at


async def test_progress_is_visible_in_the_database_while_the_crawl_is_running(
    service, site, repo, db
):
    root = site.add_novel("truyen-a", chapters=3)
    seen: list[tuple[int | None, int, int]] = []

    def snapshot(_done: int, _total: int) -> None:
        with db() as session:
            run = session.scalars(select(CrawlRun)).one()
            seen.append((run.novel_id, run.chapters_ok, run.chapters_total))

    result = await service.crawl(everything(root), on_progress=snapshot)

    # Một tiến trình khác (web UI, lệnh `status`) đọc bảng crawl_runs là thấy đang tới đâu.
    assert all(novel_id is not None for novel_id, _, _ in seen)
    assert [(ok, total) for _, ok, total in seen] == [(0, 3), (1, 3), (2, 3), (3, 3)]
    assert result.run_id == 1


async def test_disabled_source_is_refused_without_touching_the_website(repo, make_client, site):
    root = site.add_novel("truyen-a", chapters=1)
    service = CrawlService(repo, make_client(), disabled_sources=["truyenfull"])

    result = await service.crawl(everything(root))

    assert result.status is RunStatus.FAILED
    assert "đang bị tắt" in result.error
    assert site.hits == {}
