"""Hình dạng dữ liệu vào/ra của API (JSON)."""

from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field

from crawl_data_app.config.settings import CrawlerSettings, HttpSettings, LogSettings
from crawl_data_app.core.models import CrawlRequest


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


# Database lưu giờ UTC không kèm múi giờ; API trả kèm múi giờ để trình duyệt tự đổi sang giờ máy.
UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


class Page[T](BaseModel):
    items: list[T]
    total: int  # tổng số dòng khớp bộ lọc, không chỉ trang này


class Stats(BaseModel):
    novels: int
    chapters: dict[str, int]  # theo trạng thái chương: pending / done / failed
    jobs: dict[str, int]  # theo trạng thái lần crawl: running / completed / partial / ...


class AviationRecordOut(BaseModel):
    kind: str  # airport | airline | city | country
    code: str
    name: str
    name_vi: str | None
    city_code: str | None  # chỉ sân bay
    city_name: str | None
    country_code: str | None  # sân bay và thành phố
    country_name: str | None
    region: str | None
    crawled_at: UtcDatetime


class SourceOut(BaseModel):
    name: str
    domains: list[str]
    description: str
    enabled: bool
    novels: int
    chapters_done: int


class SourceUpdate(BaseModel):
    enabled: bool


class ConnectionTest(BaseModel):
    ok: bool
    message: str
    url: str  # URL đã thử; nếu kết nối được thì là URL cuối cùng sau chuyển hướng
    elapsed_ms: int


class NovelOut(BaseModel):
    id: int
    source: str
    slug: str
    url: str
    title: str
    author: str | None
    genres: list[str]
    description: str | None
    cover_url: str | None
    status: str
    total_chapters: int | None  # theo mục lục của nguồn; None nếu chưa từng crawl chương
    chapters_done: int
    chapters_failed: int
    chapters_pending: int
    published_at: UtcDatetime | None
    last_crawled_at: UtcDatetime | None


class ChapterOut(BaseModel):
    number: int
    title: str
    url: str
    status: str
    error: str | None
    crawled_at: UtcDatetime | None


class ChapterContent(ChapterOut):
    paragraphs: list[str]  # rỗng nếu chương chưa tải được


class JobCreate(CrawlRequest):
    """Yêu cầu crawl từ web UI: `CrawlRequest` kèm các tuỳ chọn của riêng lần chạy này."""

    with_chapters: bool = True
    source: str | None = None  # nếu có: URL phải thuộc đúng nguồn này
    force: bool = False  # tải lại cả chương đã có
    retry_failed: bool = True  # tải lại những chương đang lỗi


class JobOut(BaseModel):
    id: int
    crawler: str  # "novel", "aviation:<nguồn>" hoặc "provinces"
    url: str
    novel_id: int | None
    novel_title: str | None
    with_chapters: bool
    from_chapter: int | None
    to_chapter: int | None
    status: str
    # Bộ đếm tiến độ: số chương với job truyện, số file với job đồng bộ (hàng không, tỉnh thành).
    chapters_total: int
    chapters_ok: int
    chapters_failed: int
    chapters_skipped: int
    result: dict[str, int] | None  # job đồng bộ: số bản ghi theo loại khi chạy xong
    error: str | None
    started_at: UtcDatetime
    finished_at: UtcDatetime | None
    active: bool  # đang chạy trong tiến trình web này → tạm dừng / huỷ được
    # Chương vừa tải xong gần nhất — chỉ có ở trang chi tiết, khi job đang chạy.
    last_chapter: str | None = None


class AviationSummary(BaseModel):
    counts: dict[str, int]  # số bản ghi đang có trong database, theo loại
    last_job: JobOut | None  # job đồng bộ gần nhất của nguồn, kể cả job đang chạy


class ProvinceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # dựng thẳng từ dòng `vn_provinces`

    code: str  # mã đơn vị hành chính, ví dụ "01"
    name: str
    name_en: str
    full_name: str  # kèm loại đơn vị: "Thành phố Hà Nội"
    full_name_en: str
    code_name: str  # "ha_noi"
    unit: str  # "Thành phố" hoặc "Tỉnh"
    postal_code_prefix: str | None
    ward_count: int  # số phường/xã/đặc khu trực thuộc
    crawled_at: UtcDatetime


class WardOut(BaseModel):
    code: str  # "00004"
    name: str
    name_en: str
    full_name: str  # kèm loại đơn vị: "Phường Ba Đình"
    full_name_en: str
    code_name: str  # "ba_dinh"
    unit: str  # "Phường", "Xã" hoặc "Đặc khu"
    postal_code: str | None
    province_code: str
    province_name: str | None  # tên đầy đủ của tỉnh thành: "Thành phố Hà Nội"
    crawled_at: UtcDatetime


class ProvinceSummary(BaseModel):
    count: int  # số tỉnh thành đang có trong database
    ward_count: int  # số phường/xã đang có trong database
    last_job: JobOut | None  # job đồng bộ gần nhất, kể cả job đang chạy


class LogEntry(BaseModel):
    time: str
    level: str
    logger: str
    message: str
    run_id: int | None = None
    url: str | None = None
    kind: str | None = None  # request | parse | other — chỉ có ở dòng lỗi
    exception: str | None = None


class SettingsUpdate(BaseModel):
    http: HttpSettings
    crawler: CrawlerSettings
    log: LogSettings


class SettingsOut(SettingsUpdate):
    database_url: str  # mật khẩu (nếu có) đã được che
    env_file: str  # tên file mà cấu hình được ghi vào (không kèm đường dẫn)


# --- Góp ý ------------------------------------------------------------------------------------

FeedbackType = Literal["bug_report", "crawler_request"]
FeedbackStatus = Literal["open", "in_progress", "resolved", "rejected"]
BugSeverity = Literal["low", "medium", "high", "critical"]
# Loại dữ liệu muốn crawl — để chung chung, không gắn với nguồn nào; "other" kèm mô tả cho phần còn lại.
CrawlerDataType = Literal["novel", "aviation", "geography", "other"]


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _http_url(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("URL không hợp lệ — cần dạng https://ten-mien/...")
    return value


OptionalText = Annotated[str | None, BeforeValidator(_blank_to_none)]


class _FeedbackCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    contact: OptionalText = Field(None, max_length=200)  # tên/email để quản trị viên liên hệ lại


class BugReportCreate(_FeedbackCreate):
    type: Literal["bug_report"]
    area: OptionalText = Field(None, max_length=200)  # trang/chức năng xảy ra lỗi
    severity: BugSeverity = "medium"


class CrawlerRequestCreate(_FeedbackCreate):
    """`title` là tên nguồn/website được đề xuất."""

    type: Literal["crawler_request"]
    url: Annotated[str, AfterValidator(_http_url)] = Field(max_length=1000)
    data_type: CrawlerDataType


FeedbackCreate = Annotated[BugReportCreate | CrawlerRequestCreate, Field(discriminator="type")]


class FeedbackOut(BaseModel):
    """Góp ý như người gửi thấy (`GET /feedback/mine`)."""

    id: int
    type: FeedbackType
    title: str
    description: str
    # Trường riêng theo loại — báo lỗi: area, severity; gợi ý crawler: url, data_type.
    details: dict[str, str]
    status: FeedbackStatus
    response: str | None  # phản hồi của quản trị viên
    created_at: UtcDatetime
    updated_at: UtcDatetime


class FeedbackAdminOut(FeedbackOut):
    """Góp ý như quản trị viên thấy: thêm liên hệ và mã người gửi."""

    contact: str | None
    # 8 ký tự đầu của hash mã người gửi: nhận ra các góp ý cùng một trình duyệt, không lộ mã gốc.
    reporter: str | None


class FeedbackUpdate(BaseModel):
    """Chỉ những trường có trong body mới được ghi; `response: null` xoá phản hồi."""

    model_config = ConfigDict(extra="forbid")

    status: FeedbackStatus | None = None
    response: OptionalText = Field(None, max_length=5000)


class AdminSession(BaseModel):
    role: Literal["admin"]
