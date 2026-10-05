"""Cấu hình: mặc định an toàn, chặn giá trị gây quá tải, đọc được từ biến môi trường."""

import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from novel_crawler.config.settings import (
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
    assert http.user_agent.startswith("novel-crawler/")  # tự nhận là bot, không giả trình duyệt


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


def test_unknown_content_format_is_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CRAWLER_CONTENT_FORMAT", "pdf")

    with pytest.raises(ValidationError):
        CrawlerSettings(_env_file=None)
