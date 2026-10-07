"""Fixture dùng chung của các test API: ứng dụng web nối vào website giả, không mở cổng mạng."""

import asyncio
import io
import logging
import os
from pathlib import Path

import httpx
import pytest
from rich.console import Console

from crawl_data_app.config.logging import setup_logging
from crawl_data_app.config.settings import LogSettings
from crawl_data_app.web.app import create_app


class Gate:
    """`sleep` giả cho HttpClient: tua đồng hồ như FakeClock, nhưng giữ job đứng lại ở lần chờ thứ N
    (tức ngay trước request thứ N+1) cho tới khi `release()` — để test quan sát một job đang chạy dở.
    """

    def __init__(self, clock) -> None:
        self._clock = clock
        self._open = asyncio.Event()
        self._open.set()
        self._calls = 0
        self._hold_at: int | None = None

    def hold_at(self, call: int) -> None:
        self._hold_at = self._calls + call

    def release(self) -> None:
        self._hold_at = None
        self._open.set()

    async def sleep(self, seconds: float) -> None:
        self._calls += 1
        if self._hold_at is not None and self._calls >= self._hold_at:
            self._open.clear()
        await self._open.wait()
        await self._clock.sleep(seconds)


@pytest.fixture
def gate(clock) -> Gate:
    return Gate(clock)


@pytest.fixture
def env_file(tmp_path, monkeypatch) -> Path:
    """File `.env` riêng của test; biến môi trường thật của máy không được lọt vào."""
    for name in list(os.environ):
        if name.startswith(("HTTP_", "CRAWLER_", "DATABASE_", "LOG_", "ADMIN_")):
            monkeypatch.delenv(name)
    path = tmp_path / ".env"
    path.write_text(
        "# dòng chú thích này phải còn nguyên sau khi lưu cấu hình\n"
        "DATABASE_URL=postgresql+psycopg://bob:bi-mat@db.test/novels\n"
        "HTTP_REQUEST_DELAY=0.5\n"
        "HTTP_CONCURRENCY=1\n"
        "HTTP_MAX_RETRIES=0\n"
        f"LOG_DIR={(tmp_path / 'logs').as_posix()}\n",
        encoding="utf-8",
    )
    return path


@pytest.fixture
async def api(repo, site, gate, env_file, tmp_path):
    """Client HTTP nối thẳng vào ứng dụng (không mở cổng mạng); job nền chạy cùng event loop với test."""
    log_settings = LogSettings(_env_file=None, dir=str(tmp_path / "logs"))
    setup_logging(log_settings, Console(file=io.StringIO()))
    app = create_app(
        repo, env_file=env_file, transport=httpx.MockTransport(site.handler), sleep=gate.sleep
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield client
    root = logging.getLogger()
    for handler in root.handlers[:]:  # nhả file log để Windows xoá được thư mục tạm
        root.removeHandler(handler)
        handler.close()
