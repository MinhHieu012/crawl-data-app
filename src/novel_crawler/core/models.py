"""Model dữ liệu chung giữa parser, service và repository (độc lập với website và database)."""

from datetime import datetime
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, Field, model_validator


class NovelStatus(StrEnum):
    ONGOING = "ongoing"  # đang cập nhật
    COMPLETED = "completed"  # hoàn thành
    PAUSED = "paused"  # tạm ngưng
    UNKNOWN = "unknown"


class NovelInfo(BaseModel):
    # slug: định danh truyện trong website nguồn, không phụ thuộc tên miền
    slug: str = Field(min_length=1)
    url: str
    title: str = Field(min_length=1)
    author: str | None = None
    genres: list[str] = []
    description: str | None = None  # text thuần, mỗi đoạn một dòng
    cover_url: str | None = None
    status: NovelStatus = NovelStatus.UNKNOWN
    total_chapters: int | None = None
    published_at: datetime | None = None  # thời điểm truyện được đăng lên website nguồn
    source_updated_at: datetime | None = None  # thời điểm cập nhật do website công bố (nếu có)


class ChapterRef(BaseModel):
    """Một dòng trong mục lục: đủ thông tin để tải chương, chưa có nội dung."""

    slug: str = Field(min_length=1)  # định danh chương trong phạm vi một truyện
    url: str
    title: str = Field(min_length=1)


class ChapterListPage(BaseModel):
    chapters: list[ChapterRef]
    next_url: str | None = None  # None = đã hết mục lục


class ChapterContent(BaseModel):
    title: str | None = None
    paragraphs: list[str] = Field(min_length=1)


class CrawlRequest(BaseModel):
    """Một yêu cầu crawl; khoảng chương tính theo số thứ tự trong mục lục, gồm cả hai đầu."""

    url: str
    with_chapters: bool = False
    from_chapter: int | None = Field(None, ge=1)
    to_chapter: int | None = Field(None, ge=1)

    @model_validator(mode="after")
    def _check_range(self) -> Self:
        if self.from_chapter and self.to_chapter and self.from_chapter > self.to_chapter:
            raise ValueError("from_chapter không được lớn hơn to_chapter")
        return self
