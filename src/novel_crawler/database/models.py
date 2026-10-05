"""Schema lưu trữ: nguồn → truyện → chương, kèm lịch sử các lần crawl.

Mọi cột thời gian lưu giờ UTC dạng naive (không kèm tzinfo) để SQLite và PostgreSQL cho kết quả như nhau.
"""

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import JSON, ForeignKey, Index, MetaData, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class ChapterStatus(StrEnum):
    PENDING = "pending"  # đã có trong mục lục, chưa tải nội dung
    DONE = "done"
    FAILED = "failed"  # lần tải gần nhất lỗi (xem cột `error`); `resume` sẽ thử lại


class RunStatus(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    PARTIAL = "partial"  # chạy hết nhưng còn chương lỗi
    FAILED = "failed"  # dừng giữa chừng: bị chặn, website sập, không đọc được trang truyện...
    INTERRUPTED = "interrupted"  # ngắt bằng Ctrl+C, tạm dừng trên web UI, hoặc tiến trình bị tắt
    CANCELLED = "cancelled"  # người dùng huỷ trên web UI; `resume` không tự chạy lại


class Base(DeclarativeBase):
    # Đặt tên ràng buộc tường minh để Alembic sửa/xoá được về sau (nhất là trên SQLite).
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class Source(Base):
    """Website nguồn — mỗi crawler một dòng."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Novel(Base):
    __tablename__ = "novels"
    # Định danh theo (nguồn, slug) chứ không theo URL: website đổi tên miền thì truyện vẫn không trùng.
    __table_args__ = (UniqueConstraint("source_id", "slug", name="uq_novels_source_slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"))
    slug: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(1000))
    title: Mapped[str] = mapped_column(String(500))
    author: Mapped[str | None] = mapped_column(String(255))
    # ponytail: thể loại lưu JSON cho gọn; tách bảng genres (N-N) khi cần lọc/thống kê theo thể loại.
    genres: Mapped[list[str]] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="unknown")
    total_chapters: Mapped[int | None]
    published_at: Mapped[datetime | None]  # ngày truyện được đăng lên nguồn
    source_updated_at: Mapped[datetime | None]  # ngày cập nhật do nguồn công bố; NULL nếu không có
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    # Lần gần nhất crawler phát hiện truyện thay đổi: thông tin đổi hoặc có chương mới.
    updated_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_crawled_at: Mapped[datetime | None]


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (
        UniqueConstraint("novel_id", "slug", name="uq_chapters_novel_slug"),
        Index("ix_chapters_novel_number", "novel_id", "number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    slug: Mapped[str] = mapped_column(String(255))
    number: Mapped[int]  # số thứ tự trong mục lục của nguồn (1..N) — giữ đúng thứ tự chương
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default=ChapterStatus.PENDING.value)
    # deferred: không kéo nội dung (vài KB/chương) khi chỉ cần duyệt mục lục.
    content: Mapped[str | None] = mapped_column(Text, deferred=True)
    content_format: Mapped[str | None] = mapped_column(String(20))  # html | markdown
    content_hash: Mapped[str | None] = mapped_column(String(64))
    error: Mapped[str | None] = mapped_column(Text)
    crawled_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow)  # lần cuối nội dung đổi


class CrawlRun(Base):
    """Lịch sử crawl: mỗi lần crawl một truyện là một dòng, kể cả khi thất bại."""

    __tablename__ = "crawl_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(1000))  # URL người dùng yêu cầu
    novel_id: Mapped[int | None] = mapped_column(ForeignKey("novels.id", ondelete="SET NULL"))
    with_chapters: Mapped[bool] = mapped_column(default=False)
    from_chapter: Mapped[int | None]
    to_chapter: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(20), default=RunStatus.RUNNING.value)
    # Số chương lần này phải tải (= ok + lỗi + chưa tới lượt). Các cột chapters_* được ghi dần trong
    # lúc chạy nên theo dõi được tiến độ của lần crawl đang diễn ra.
    chapters_total: Mapped[int] = mapped_column(default=0)
    chapters_ok: Mapped[int] = mapped_column(default=0)
    chapters_failed: Mapped[int] = mapped_column(default=0)
    chapters_skipped: Mapped[int] = mapped_column(default=0)  # đã có sẵn nên không tải lại
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None]
