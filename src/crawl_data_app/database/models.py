"""Schema lưu trữ: nguồn → truyện → chương, kèm lịch sử các lần crawl; danh mục hàng không; tỉnh thành.

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
    """Lịch sử crawl: mỗi lần chạy (crawl một truyện, đồng bộ một nguồn hàng không, đồng bộ tỉnh
    thành) là một dòng, kể cả khi thất bại.
    """

    # ponytail: các cột `chapters_*` là bộ đếm tiến độ chung — với crawler không phải truyện chúng
    # đếm đơn vị của crawler đó (hàng không, tỉnh thành: số file đã tải). Đổi tên cột là đổi cả API
    # contract (`JobOut`) lẫn giao diện, nên để tới khi có lý do khác buộc phải đổi contract.
    __tablename__ = "crawl_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Crawler tạo ra lần chạy này: "novel", "aviation:<nguồn>" (world, vna), "provinces" hoặc "banks".
    crawler: Mapped[str] = mapped_column(String(50), default="novel")
    url: Mapped[str] = mapped_column(
        String(1000)
    )  # URL người dùng yêu cầu (hoặc trang gốc của nguồn)
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
    # Tóm tắt kết quả khi chạy xong; hàng không: số bản ghi theo loại, ví dụ {"airport": 469}.
    result: Mapped[dict[str, int] | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None]


class AviationRecord(Base):
    """Một dòng danh mục hàng không: sân bay, hãng bay, thành phố hoặc quốc gia, theo từng nguồn."""

    # ponytail: bốn loại chung một bảng (phân biệt bằng `kind`) vì cùng dạng mã + tên; tách bảng khi
    # một loại cần cột riêng (toạ độ sân bay, liên minh của hãng bay...).
    __tablename__ = "aviation_records"
    __table_args__ = (
        UniqueConstraint("source", "kind", "code", name="uq_aviation_records_source_kind_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20))  # world | vna
    kind: Mapped[str] = mapped_column(String(20))  # airport | airline | city | country
    # Mã IATA (sân bay, hãng bay), ISO (quốc gia); thành phố: mã IATA (vna) hoặc mã tự đặt (world).
    code: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(255))  # tên tiếng Anh theo nguồn
    name_vi: Mapped[str | None] = mapped_column(String(255))
    city_code: Mapped[str | None] = mapped_column(String(64))  # chỉ sân bay
    country_code: Mapped[str | None] = mapped_column(String(10))  # sân bay và thành phố
    region: Mapped[str | None] = mapped_column(String(100))
    crawled_at: Mapped[datetime] = mapped_column(default=utcnow)  # lần cuối còn thấy ở nguồn


class Province(Base):
    """Một tỉnh hoặc thành phố trực thuộc trung ương của Việt Nam (34 đơn vị sau sáp nhập 2025)."""

    __tablename__ = "vn_provinces"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True)  # mã đơn vị hành chính: "01"
    name: Mapped[str] = mapped_column(String(100))  # "Hà Nội"
    name_en: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(150))  # "Thành phố Hà Nội"
    full_name_en: Mapped[str] = mapped_column(String(150))
    code_name: Mapped[str] = mapped_column(String(100))  # "ha_noi"
    unit: Mapped[str] = mapped_column(String(50))  # "Thành phố" | "Tỉnh"
    postal_code_prefix: Mapped[str | None] = mapped_column(String(100))  # "10, 11, 12, 13, 14"
    ward_count: Mapped[int]  # số phường/xã/đặc khu trực thuộc, theo nguồn
    crawled_at: Mapped[datetime] = mapped_column(default=utcnow)  # lần cuối còn thấy ở nguồn


class Ward(Base):
    """Một phường, xã hoặc đặc khu — cấp hành chính ngay dưới tỉnh thành sau sáp nhập 2025."""

    __tablename__ = "vn_wards"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True)  # "00004"
    # Mã tỉnh thành (`vn_provinces.code`). Không đặt khoá ngoại: hai bảng được ghi đè theo mã của
    # nguồn trong cùng một transaction, và bản ghi cũ được giữ lại kể cả khi nguồn bỏ tỉnh đó.
    province_code: Mapped[str] = mapped_column(String(10), index=True)
    name: Mapped[str] = mapped_column(String(100))  # "Ba Đình"
    name_en: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(150))  # "Phường Ba Đình"
    full_name_en: Mapped[str] = mapped_column(String(150))
    code_name: Mapped[str] = mapped_column(String(100))  # "ba_dinh"
    unit: Mapped[str] = mapped_column(String(50))  # "Phường" | "Xã" | "Đặc khu"
    postal_code: Mapped[str | None] = mapped_column(String(20))
    crawled_at: Mapped[datetime] = mapped_column(default=utcnow)  # lần cuối còn thấy ở nguồn


class Bank(Base):
    """Một ngân hàng tại Việt Nam, theo danh sách của VietQR."""

    __tablename__ = "vn_banks"

    id: Mapped[int] = mapped_column(primary_key=True)
    bin: Mapped[str] = mapped_column(String(10), unique=True)  # mã BIN Napas: "970415"
    code: Mapped[str] = mapped_column(String(20))  # mã ngắn của nguồn: "ICB"
    name: Mapped[str] = mapped_column(String(255))  # "Ngân hàng TMCP Công thương Việt Nam"
    short_name: Mapped[str] = mapped_column(String(100))  # "VietinBank"
    swift_code: Mapped[str | None] = mapped_column(String(20))
    logo: Mapped[str | None] = mapped_column(String(255))  # URL ảnh logo trên CDN của nguồn
    transfer_supported: Mapped[bool]  # nhận chuyển khoản nhanh qua mã QR
    lookup_supported: Mapped[bool]  # tra được tên chủ tài khoản
    crawled_at: Mapped[datetime] = mapped_column(default=utcnow)  # lần cuối còn thấy ở nguồn


class FeedbackType(StrEnum):
    BUG_REPORT = "bug_report"
    CRAWLER_REQUEST = "crawler_request"


class FeedbackStatus(StrEnum):
    OPEN = "open"  # mới gửi, quản trị viên chưa xử lý
    IN_PROGRESS = "in_progress"  # đã tiếp nhận, đang sửa lỗi / đang làm crawler
    RESOLVED = "resolved"  # đã sửa xong / đã có crawler
    REJECTED = "rejected"  # không làm (trùng, không tái hiện được, nguồn không cho phép crawl...)


class Feedback(Base):
    """Một góp ý người dùng gửi qua web UI: báo lỗi hoặc gợi ý crawler mới."""

    # ponytail: mọi loại góp ý chung một bảng; các trường riêng của từng loại (mức độ, URL nguồn...)
    # nằm trong `details` (JSON) nên thêm loại mới không cần migration. Tách cột khi cần lọc/thống kê
    # theo một trường riêng.
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(30))  # FeedbackType
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    details: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default=FeedbackStatus.OPEN.value)
    # Tên/email người gửi tự ghi (tuỳ chọn) để quản trị viên liên hệ lại.
    contact: Mapped[str | None] = mapped_column(String(200))
    # SHA-256 của mã ngẫu nhiên mà trình duyệt người gửi tự sinh và giữ: chỉ ai giữ mã gốc mới xem
    # lại được góp ý của mình. Không có tài khoản người dùng nên đây là "người gửi".
    reporter_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    # Phản hồi của quản trị viên; người gửi xem được ở "Góp ý đã gửi".
    response: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow)
