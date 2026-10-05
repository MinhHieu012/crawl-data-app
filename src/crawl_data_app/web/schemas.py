"""Hình dạng dữ liệu vào/ra của API (JSON)."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel

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
    crawler: str  # "novel" hoặc "aviation:<nguồn>"
    url: str
    novel_id: int | None
    novel_title: str | None
    with_chapters: bool
    from_chapter: int | None
    to_chapter: int | None
    status: str
    # Bộ đếm tiến độ: số chương với job truyện, số file với job đồng bộ hàng không.
    chapters_total: int
    chapters_ok: int
    chapters_failed: int
    chapters_skipped: int
    result: dict[str, int] | None  # hàng không: số bản ghi theo loại khi chạy xong
    error: str | None
    started_at: UtcDatetime
    finished_at: UtcDatetime | None
    active: bool  # đang chạy trong tiến trình web này → tạm dừng / huỷ được
    # Chương vừa tải xong gần nhất — chỉ có ở trang chi tiết, khi job đang chạy.
    last_chapter: str | None = None


class AviationSummary(BaseModel):
    counts: dict[str, int]  # số bản ghi đang có trong database, theo loại
    last_job: JobOut | None  # job đồng bộ gần nhất của nguồn, kể cả job đang chạy


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
    env_file: str  # file `.env` mà cấu hình được ghi vào
