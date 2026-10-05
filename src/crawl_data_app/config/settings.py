"""Cấu hình ứng dụng, đọc từ biến môi trường hoặc file `.env`, tách theo từng nhóm."""

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import set_key
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from crawl_data_app import __version__


def _env(prefix: str) -> SettingsConfigDict:
    return SettingsConfigDict(
        env_prefix=prefix, env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


class HttpSettings(BaseSettings):
    """HTTP client — biến môi trường `HTTP_*`."""

    model_config = _env("HTTP_")

    # Không nhận ký tự điều khiển (xuống dòng...): giá trị này đi vào header HTTP và file `.env`.
    user_agent: str = Field(
        f"crawl-data-app/{__version__}", min_length=1, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    request_timeout: float = Field(20.0, gt=0)
    max_retries: int = Field(3, ge=0, le=10)
    # Trần 8 kết nối và sàn 0.5s giữa hai request là có chủ đích:
    # crawler không được phép gây quá tải cho website nguồn.
    concurrency: int = Field(2, ge=1, le=8)
    request_delay: float = Field(2.0, ge=0.5)


class CrawlerSettings(BaseSettings):
    """Hành vi crawl — biến môi trường `CRAWLER_*`."""

    model_config = _env("CRAWLER_")

    content_format: Literal["html", "markdown"] = "html"
    # Tên các nguồn tạm ngừng crawl, dạng JSON: CRAWLER_DISABLED_SOURCES=["truyenfull"]
    disabled_sources: list[str] = []


class DatabaseSettings(BaseSettings):
    """Database — biến môi trường `DATABASE_*`."""

    model_config = _env("DATABASE_")

    url: str = "sqlite:///data/crawl-data-app.db"


class LogSettings(BaseSettings):
    """Logging — biến môi trường `LOG_*`."""

    model_config = _env("LOG_")

    level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    dir: str = "logs"


@dataclass(frozen=True)
class Settings:
    http: HttpSettings = field(default_factory=HttpSettings)
    crawler: CrawlerSettings = field(default_factory=CrawlerSettings)
    database: DatabaseSettings = field(default_factory=DatabaseSettings)
    log: LogSettings = field(default_factory=LogSettings)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def load_settings(env_file: str | Path) -> Settings:
    """Đọc lại cấu hình từ biến môi trường và đúng file `.env` này (web UI ghi cấu hình vào đó)."""
    return Settings(
        http=HttpSettings(_env_file=env_file),
        crawler=CrawlerSettings(_env_file=env_file),
        database=DatabaseSettings(_env_file=env_file),
        log=LogSettings(_env_file=env_file),
    )


def env_values(group: BaseSettings, fields: Iterable[str]) -> dict[str, object]:
    """Tên biến môi trường → giá trị hiện tại, cho các trường `fields` của một nhóm cấu hình."""
    prefix = group.model_config.get("env_prefix") or ""
    return {f"{prefix}{name}".upper(): getattr(group, name) for name in fields}


def save_env(env_file: str | Path, values: Mapping[str, object]) -> None:
    """Ghi các biến vào file `.env` (tạo nếu chưa có); những dòng khác và chú thích được giữ nguyên.

    Lưu ý: biến môi trường thật của hệ điều hành vẫn được ưu tiên hơn file `.env` khi đọc lại.
    """
    for key, value in values.items():
        text = value if isinstance(value, str) else json.dumps(value)
        set_key(env_file, key, text, quote_mode="always", encoding="utf-8")
