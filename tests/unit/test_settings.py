"""Cấu hình: mặc định an toàn, chặn giá trị gây quá tải, đọc được từ biến môi trường."""

import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from crawl_data_app.config.settings import (
    AdminSettings,
    CrawlerSettings,
    DatabaseSettings,
    HttpSettings,
    LogSettings,
)


def test_defaults_are_polite(monkeypatch: pytest.MonkeyPatch):
    for name in ("HTTP_REQUEST_DELAY", "HTTP_CONCURRENCY", "HTTP_USER_AGENT"):
        monkeypatch.delenv(name, raising=False)

    http = HttpSettings(_env_file=None)

    assert http.request_delay >= 1.0
    assert http.concurrency <= 2
    assert http.user_agent.startswith("crawl-data-app/")  # tự nhận là bot, không giả trình duyệt


@pytest.mark.parametrize(
    "values",
    [
        {"request_delay": 0},
        {"request_delay": 0.1},
        {"concurrency": 0},
        {"concurrency": 50},
        {"max_retries": -1},
        {"request_timeout": 0},
        {"user_agent": ""},
    ],
)
def test_abusive_or_invalid_http_values_are_rejected(values):
    with pytest.raises(ValidationError):
        HttpSettings(_env_file=None, **values)


def test_values_come_from_environment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("HTTP_REQUEST_DELAY", "3.5")
    monkeypatch.setenv("HTTP_MAX_RETRIES", "5")
    monkeypatch.setenv("CRAWLER_CONTENT_FORMAT", "markdown")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///khac.db")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    assert HttpSettings(_env_file=None).request_delay == 3.5
    assert HttpSettings(_env_file=None).max_retries == 5
    assert CrawlerSettings(_env_file=None).content_format == "markdown"
    assert DatabaseSettings(_env_file=None).url == "sqlite:///khac.db"
    assert LogSettings(_env_file=None).level == "DEBUG"


def test_env_example_is_valid_and_documents_the_real_defaults(monkeypatch: pytest.MonkeyPatch):
    for name in list(os.environ):
        if name.startswith(("HTTP_", "CRAWLER_", "DATABASE_", "LOG_")):
            monkeypatch.delenv(name)
    example = Path(__file__).parents[2] / ".env.example"

    for group in (HttpSettings, CrawlerSettings, DatabaseSettings, LogSettings):
        assert group(_env_file=example) == group(_env_file=None)


@pytest.mark.parametrize("line", ["ADMIN_TOKEN=", "ADMIN_TOKEN=''", "# ADMIN_TOKEN="])
def test_empty_admin_token_means_admin_is_off(
    line: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(line + "\n", encoding="utf-8")

    assert AdminSettings(_env_file=env_file).token is None  # không được làm app hỏng lúc khởi động

    monkeypatch.setenv("ADMIN_TOKEN", "")
    assert AdminSettings(_env_file=None).token is None


def test_short_admin_token_is_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ADMIN_TOKEN", "ngan-qua")

    with pytest.raises(ValidationError):
        AdminSettings(_env_file=None)


def test_unknown_content_format_is_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CRAWLER_CONTENT_FORMAT", "pdf")

    with pytest.raises(ValidationError):
        CrawlerSettings(_env_file=None)
