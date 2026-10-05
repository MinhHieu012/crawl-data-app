"""Truy cập dữ liệu. Mỗi hàm là một transaction ngắn: commit khi xong, rollback nếu có lỗi."""

import re
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, Row, and_, func, or_, select, update
from sqlalchemy.orm import Session, sessionmaker

from crawl_data_app.core.models import ChapterRef, CrawlRequest, NovelInfo
from crawl_data_app.database.models import (
    Chapter,
    ChapterStatus,
    CrawlRun,
    Novel,
    RunStatus,
    Source,
    utcnow,
)

RunRow = tuple[CrawlRun, str | None]  # (lần crawl, URL hiện tại của truyện nếu đã xác định được)

_CHAPTER_COLUMNS = (
    Chapter.number,
    Chapter.title,
    Chapter.url,
    Chapter.status,
    Chapter.error,
    Chapter.crawled_at,
)


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _run_key(run: CrawlRun) -> int | str:
    return run.novel_id or run.url


def _to_request(run: CrawlRun, novel_url: str | None) -> CrawlRequest:
    return CrawlRequest(
        url=novel_url or run.url,
        with_chapters=run.with_chapters,
        from_chapter=run.from_chapter,
        to_chapter=run.to_chapter,
    )


def _unaccent_slug(text: str) -> str:
    """ "Nấu Ăn" → "nau-an": dạng không dấu giống slug của các website truyện, để tìm kiếm không dấu."""
    plain = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    plain = "".join(char for char in plain if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


class NovelRepository:
    # ponytail: gọi DB đồng bộ ngay trong event loop — ổn với SQLite cục bộ và nhịp crawl ~1 request/giây;
    # chuyển sang asyncio.to_thread hoặc engine async nếu dùng database ở xa có độ trễ cao.

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self.session_factory = (
            session_factory  # cho repository của crawler khác dùng chung database
        )

    # --- Truyện và chương ---------------------------------------------------------------------

    def upsert_novel(self, source_name: str, info: NovelInfo) -> int:
        """Thêm truyện hoặc cập nhật các trường đã đổi. Định danh theo (nguồn, slug) nên không trùng."""
        now = utcnow()
        fields = {
            "url": info.url,
            "title": info.title,
            "author": info.author,
            "genres": info.genres,
            "description": info.description,
            "cover_url": info.cover_url,
            "status": info.status.value,
            "published_at": _naive_utc(info.published_at),
            "source_updated_at": _naive_utc(info.source_updated_at),
        }
        if info.total_chapters is not None:
            fields["total_chapters"] = info.total_chapters
        with self._session_factory.begin() as session:
            source = session.scalar(select(Source).where(Source.name == source_name))
            if source is None:
                source = Source(name=source_name)
                session.add(source)
                session.flush()
            novel = session.scalar(
                select(Novel).where(Novel.source_id == source.id, Novel.slug == info.slug)
            )
            if novel is None:
                novel = Novel(source_id=source.id, slug=info.slug, created_at=now)
                session.add(novel)
            changed = {key: value for key, value in fields.items() if getattr(novel, key) != value}
            for key, value in changed.items():
                setattr(novel, key, value)
            if changed:
                novel.updated_at = now
            novel.last_crawled_at = now
            session.flush()
            return novel.id

    def sync_chapters(self, novel_id: int, refs: Sequence[ChapterRef]) -> int:
        """Đồng bộ mục lục: thêm chương mới, cập nhật thứ tự/tiêu đề/URL chương cũ. Trả về số chương mới.

        Chương đã lưu mà không còn trong mục lục của nguồn thì được giữ nguyên (không xoá dữ liệu).
        """
        with self._session_factory.begin() as session:
            known = {
                chapter.slug: chapter
                for chapter in session.scalars(select(Chapter).where(Chapter.novel_id == novel_id))
            }
            added = 0
            for number, ref in enumerate(refs, start=1):
                chapter = known.get(ref.slug)
                if chapter is None:
                    session.add(
                        Chapter(
                            novel_id=novel_id,
                            slug=ref.slug,
                            number=number,
                            title=ref.title,
                            url=ref.url,
                        )
                    )
                    added += 1
                    continue
                if chapter.title != ref.title and chapter.status == ChapterStatus.DONE:
                    # Nguồn đổi tiêu đề chương → nhiều khả năng nội dung cũng được sửa → tải lại.
                    chapter.status = ChapterStatus.PENDING
                chapter.number, chapter.title, chapter.url = number, ref.title, ref.url
            novel = session.get_one(Novel, novel_id)
            if refs:
                novel.total_chapters = len(refs)
            if added:
                novel.updated_at = utcnow()  # có chương mới = truyện vừa được cập nhật
            return added

    def chapters_to_fetch(
        self,
        novel_id: int,
        from_chapter: int | None,
        to_chapter: int | None,
        *,
        force: bool = False,
        retry_failed: bool = True,
    ) -> tuple[list[Row], int]:
        """Các chương trong khoảng cần tải (theo thứ tự) và số chương trong khoảng được bỏ qua.

        Mỗi dòng có: id, number, slug, url, title, status. `force` = lấy cả chương đã tải xong;
        `retry_failed=False` = bỏ qua cả những chương đang ở trạng thái lỗi.
        """
        stmt = (
            select(
                Chapter.id, Chapter.number, Chapter.slug, Chapter.url, Chapter.title, Chapter.status
            )
            .where(Chapter.novel_id == novel_id)
            .order_by(Chapter.number)
        )
        if from_chapter is not None:
            stmt = stmt.where(Chapter.number >= from_chapter)
        if to_chapter is not None:
            stmt = stmt.where(Chapter.number <= to_chapter)
        with self._session_factory() as session:
            rows = session.execute(stmt).all()
        skip = {ChapterStatus.DONE} if retry_failed else {ChapterStatus.DONE, ChapterStatus.FAILED}
        todo = [row for row in rows if force or row.status not in skip]
        return todo, len(rows) - len(todo)

    def save_chapter(self, chapter_id: int, content: str, content_format: str, digest: str) -> bool:
        """Lưu nội dung chương và đánh dấu hoàn tất. Trả về True nếu nội dung mới hoặc khác bản cũ."""
        now = utcnow()
        with self._session_factory.begin() as session:
            chapter = session.get_one(Chapter, chapter_id)
            changed = (chapter.content_hash, chapter.content_format) != (digest, content_format)
            if changed:
                chapter.content = content
                chapter.content_format = content_format
                chapter.content_hash = digest
                chapter.updated_at = now
            chapter.status = ChapterStatus.DONE
            chapter.error = None
            chapter.crawled_at = now
            return changed

    def mark_chapter_failed(self, chapter_id: int, error: str) -> None:
        """Ghi lỗi của chương. Nội dung cũ (nếu có) được giữ nguyên."""
        with self._session_factory.begin() as session:
            chapter = session.get_one(Chapter, chapter_id)
            chapter.status = ChapterStatus.FAILED
            chapter.error = error[:2000]

    # --- Lịch sử crawl ------------------------------------------------------------------------

    def start_run(self, request: CrawlRequest, *, crawler: str = "novel", total: int = 0) -> int:
        """Ghi nhận một lần chạy mới. `total`: số đơn vị phải xử lý, nếu crawler biết trước."""
        with self._session_factory.begin() as session:
            run = CrawlRun(
                crawler=crawler,
                chapters_total=total,
                url=request.url,
                with_chapters=request.with_chapters,
                from_chapter=request.from_chapter,
                to_chapter=request.to_chapter,
                status=RunStatus.RUNNING,
            )
            session.add(run)
            session.flush()
            return run.id

    def update_run(self, run_id: int, **values: object) -> None:
        """Ghi một phần thông tin của lần crawl: truyện và tiến độ khi đang chạy, trạng thái khi dừng/huỷ."""
        with self._session_factory.begin() as session:
            session.execute(update(CrawlRun).where(CrawlRun.id == run_id).values(**values))

    def finish_run(
        self,
        run_id: int,
        status: RunStatus,
        *,
        novel_id: int | None,
        ok: int,
        failed: int,
        skipped: int,
        error: str | None,
    ) -> None:
        with self._session_factory.begin() as session:
            run = session.get_one(CrawlRun, run_id)
            run.status = status
            run.novel_id = novel_id
            run.chapters_ok, run.chapters_failed, run.chapters_skipped = ok, failed, skipped
            run.error = error
            run.finished_at = utcnow()
            if novel_id is not None:
                # Các lần trước thất bại khi chưa xác định được truyện (cùng URL) nay thuộc về truyện này.
                session.execute(
                    update(CrawlRun)
                    .where(CrawlRun.url == run.url, CrawlRun.novel_id.is_(None))
                    .values(novel_id=novel_id)
                )

    def close_stale_runs(self) -> int:
        """Đánh dấu `interrupted` cho các lần crawl còn treo ở `running` (tiến trình trước bị tắt đột ngột)."""
        with self._session_factory.begin() as session:
            result = session.execute(
                update(CrawlRun)
                .where(CrawlRun.status == RunStatus.RUNNING)
                .values(status=RunStatus.INTERRUPTED, finished_at=utcnow())
            )
            return result.rowcount

    def _runs_newest_first(self, session: Session) -> Sequence[Row[RunRow]]:
        # ponytail: đọc cả bảng rồi gom nhóm bằng Python; dùng window function khi crawl_runs phình to.
        # Chỉ lần crawl truyện: kết quả dùng để dựng lại CrawlRequest cho lệnh `resume`/`update`.
        stmt = (
            select(CrawlRun, Novel.url)
            .outerjoin(Novel, CrawlRun.novel_id == Novel.id)
            .where(CrawlRun.crawler == "novel")
            .order_by(CrawlRun.id.desc())
        )
        return session.execute(stmt).all()

    def last_request(self, url: str) -> CrawlRequest | None:
        """Yêu cầu của lần crawl gần nhất cho truyện ứng với `url` (khớp URL đã nhập hoặc URL truyện)."""
        with self._session_factory() as session:
            runs = self._runs_newest_first(session)
            hit = next((run for run, novel_url in runs if url in (run.url, novel_url)), None)
            if hit is None:
                return None
            run, novel_url = next(row for row in runs if _run_key(row[0]) == _run_key(hit))
            return _to_request(run, novel_url)

    def unfinished_requests(self) -> list[CrawlRequest]:
        """Yêu cầu của lần crawl gần nhất của mỗi truyện, nếu lần đó chưa hoàn tất (và không bị huỷ)."""
        with self._session_factory() as session:
            latest: dict[int | str, RunRow] = {}
            for run, novel_url in self._runs_newest_first(session):
                latest.setdefault(_run_key(run), (run, novel_url))
            return [
                _to_request(run, novel_url)
                for run, novel_url in reversed(latest.values())
                if run.status not in (RunStatus.COMPLETED, RunStatus.CANCELLED)
            ]

    def run_request(self, run_id: int) -> CrawlRequest | None:
        """Yêu cầu của một lần crawl cũ (với URL hiện tại của truyện), để chạy lại đúng phạm vi đó."""
        stmt = (
            select(CrawlRun, Novel.url)
            .outerjoin(Novel, CrawlRun.novel_id == Novel.id)
            .where(CrawlRun.id == run_id)
        )
        with self._session_factory() as session:
            row = session.execute(stmt).first()
            return _to_request(*row) if row else None

    # --- Thống kê cho lệnh `status` -----------------------------------------------------------

    def novels_overview(self) -> list[tuple[Novel, str, Counter[str]]]:
        """Mỗi truyện kèm tên nguồn và số chương theo trạng thái."""
        with self._session_factory() as session:
            counts: defaultdict[int, Counter[str]] = defaultdict(Counter)
            grouped = select(Chapter.novel_id, Chapter.status, func.count()).group_by(
                Chapter.novel_id, Chapter.status
            )
            for novel_id, status, count in session.execute(grouped):
                counts[novel_id][status] = count
            novels = session.execute(
                select(Novel, Source.name)
                .join(Source, Novel.source_id == Source.id)
                .order_by(Novel.id)
            )
            return [(novel, source, counts[novel.id]) for novel, source in novels]

    def recent_runs(self, limit: int = 10) -> list[CrawlRun]:
        """Các lần crawl truyện gần nhất (lệnh `status` của CLI chỉ nói về truyện)."""
        with self._session_factory() as session:
            return list(
                session.scalars(
                    select(CrawlRun)
                    .where(CrawlRun.crawler == "novel")
                    .order_by(CrawlRun.id.desc())
                    .limit(limit)
                )
            )

    def done_chapters(self, novel_id: int) -> Sequence[Row]:
        """Các chương đã tải của một truyện, theo thứ tự: (number, title, content, content_format)."""
        stmt = (
            select(Chapter.number, Chapter.title, Chapter.content, Chapter.content_format)
            .where(Chapter.novel_id == novel_id, Chapter.status == ChapterStatus.DONE)
            .order_by(Chapter.number)
        )
        with self._session_factory() as session:
            return session.execute(stmt).all()

    def failed_chapters(self, limit: int = 50) -> Sequence[Row]:
        """Các chương đang lỗi: (tên truyện, số thứ tự, url, lỗi)."""
        stmt = (
            select(Novel.title, Chapter.number, Chapter.url, Chapter.error)
            .join(Novel, Chapter.novel_id == Novel.id)
            .where(Chapter.status == ChapterStatus.FAILED)
            .order_by(Novel.id, Chapter.number)
            .limit(limit)
        )
        with self._session_factory() as session:
            return session.execute(stmt).all()

    # --- Truy vấn có lọc / phân trang cho web UI ------------------------------------------------

    def novels_page(
        self,
        *,
        novel_id: int | None = None,
        search: str = "",
        source: str = "",
        status: str = "",
        sort: str = "last_crawled_at",
        descending: bool = True,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[Sequence[Row], int]:
        """Một trang danh sách truyện và tổng số truyện khớp bộ lọc.

        Mỗi dòng: (Novel, source, done, failed, pending) — ba số cuối là số chương theo trạng thái.
        `search` khớp tên truyện, tác giả, hoặc dạng không dấu của tên ("nau an" tìm ra "Nấu Ăn").
        """
        # ponytail: đếm chương bằng subquery cho từng truyện, tìm bằng LIKE (không dấu thì dựa vào slug);
        # thêm cột đếm sẵn / chỉ mục full-text khi có hàng chục nghìn truyện.
        done, failed, pending = (
            select(func.count())
            .where(Chapter.novel_id == Novel.id, Chapter.status == chapter_status)
            .scalar_subquery()
            .label(chapter_status.value)
            for chapter_status in (ChapterStatus.DONE, ChapterStatus.FAILED, ChapterStatus.PENDING)
        )
        conditions: list[ColumnElement[bool]] = []
        if novel_id is not None:
            conditions.append(Novel.id == novel_id)
        if search:
            matches = [
                Novel.title.icontains(search, autoescape=True),
                Novel.author.icontains(search, autoescape=True),
            ]
            if slug := _unaccent_slug(search):
                matches.append(Novel.slug.contains(slug, autoescape=True))
            conditions.append(or_(*matches))
        if source:
            conditions.append(Source.name == source)
        if status:
            conditions.append(Novel.status == status)
        order = {
            "title": Novel.title,
            "total_chapters": Novel.total_chapters,
            "done": done,
            "last_crawled_at": Novel.last_crawled_at,
        }[sort]
        novels = select(Novel).join(Source, Novel.source_id == Source.id).where(*conditions)
        page = (
            novels.add_columns(Source.name.label("source"), done, failed, pending)
            .order_by(order.desc() if descending else order.asc(), Novel.id)
            .limit(limit)
            .offset(offset)
        )
        with self._session_factory() as session:
            total = session.scalar(select(func.count()).select_from(novels.subquery())) or 0
            return session.execute(page).all(), total

    def chapters_page(
        self, novel_id: int, *, status: str = "", limit: int = 50, offset: int = 0
    ) -> tuple[Sequence[Row], int]:
        """Một trang mục lục đã lưu — (number, title, url, status, error, crawled_at) — và tổng số chương khớp."""
        conditions = [Chapter.novel_id == novel_id]
        if status:
            conditions.append(Chapter.status == status)
        page = (
            select(*_CHAPTER_COLUMNS)
            .where(*conditions)
            .order_by(Chapter.number)
            .limit(limit)
            .offset(offset)
        )
        with self._session_factory() as session:
            total = session.scalar(select(func.count()).select_from(Chapter).where(*conditions))
            return session.execute(page).all(), total or 0

    def chapter(self, novel_id: int, number: int) -> Row | None:
        """Một chương kèm nội dung: các cột của `chapters_page` + content, content_format."""
        stmt = select(*_CHAPTER_COLUMNS, Chapter.content, Chapter.content_format).where(
            Chapter.novel_id == novel_id, Chapter.number == number
        )
        with self._session_factory() as session:
            return session.execute(stmt).first()

    def latest_chapter(self, novel_id: int, since: datetime) -> Row | None:
        """Chương vừa tải xong gần nhất kể từ `since`: (number, title)."""
        stmt = (
            select(Chapter.number, Chapter.title)
            .where(Chapter.novel_id == novel_id, Chapter.crawled_at >= since)
            .order_by(Chapter.crawled_at.desc(), Chapter.number.desc())
            .limit(1)
        )
        with self._session_factory() as session:
            return session.execute(stmt).first()

    def runs_page(
        self,
        *,
        run_id: int | None = None,
        status: str = "",
        novel_id: int | None = None,
        crawler: str = "",
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[Sequence[Row], int]:
        """Một trang lịch sử crawl, mới nhất trước — (CrawlRun, tên truyện nếu đã xác định) — và tổng số dòng khớp."""
        conditions: list[ColumnElement[bool]] = []
        if crawler:
            conditions.append(CrawlRun.crawler == crawler)
        if run_id is not None:
            conditions.append(CrawlRun.id == run_id)
        if status:
            conditions.append(CrawlRun.status == status)
        if novel_id is not None:
            conditions.append(CrawlRun.novel_id == novel_id)
        page = (
            select(CrawlRun, Novel.title)
            .outerjoin(Novel, CrawlRun.novel_id == Novel.id)
            .where(*conditions)
            .order_by(CrawlRun.id.desc())
            .limit(limit)
            .offset(offset)
        )
        with self._session_factory() as session:
            total = session.scalar(select(func.count()).select_from(CrawlRun).where(*conditions))
            return session.execute(page).all(), total or 0

    def totals(self) -> tuple[int, Counter[str], Counter[str]]:
        """Số truyện, số chương theo trạng thái chương, số lần crawl theo trạng thái lần crawl."""
        with self._session_factory() as session:
            novels = session.scalar(select(func.count()).select_from(Novel)) or 0
            chapters = select(Chapter.status, func.count()).group_by(Chapter.status)
            runs = select(CrawlRun.status, func.count()).group_by(CrawlRun.status)
            return (
                novels,
                Counter(dict(session.execute(chapters).all())),
                Counter(dict(session.execute(runs).all())),
            )

    def source_totals(self) -> dict[str, tuple[int, int]]:
        """Tên nguồn → (số truyện, số chương đã tải)."""
        stmt = (
            select(Source.name, func.count(Novel.id.distinct()), func.count(Chapter.id))
            .select_from(Source)
            .outerjoin(Novel, Novel.source_id == Source.id)
            .outerjoin(
                Chapter, and_(Chapter.novel_id == Novel.id, Chapter.status == ChapterStatus.DONE)
            )
            .group_by(Source.name)
        )
        with self._session_factory() as session:
            return {name: (novels, chapters) for name, novels, chapters in session.execute(stmt)}
