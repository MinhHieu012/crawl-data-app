"""HTTP client "lịch sự" dùng chung cho mọi crawler.

- Giãn cách request (một nhịp chung) và giới hạn số request đồng thời.
- Thử lại với exponential backoff khi gặp lỗi tạm thời (timeout, lỗi mạng/TLS, HTTP 408/429/5xx),
  tôn trọng header Retry-After.
- Tuân thủ robots.txt (kể cả Crawl-delay) ở mọi chặng chuyển hướng.
- Bị website từ chối (401/403, Cloudflare challenge) thì báo `BlockedError` — không tìm cách vượt.
"""

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from time import monotonic
from typing import NamedTuple
from urllib.parse import urljoin, urlsplit

import httpx
from protego import Protego

from crawl_data_app.config.settings import HttpSettings
from crawl_data_app.core.exceptions import (
    BlockedError,
    FetchError,
    NotFoundError,
    RobotsDisallowedError,
)

log = logging.getLogger(__name__)

MAX_REDIRECTS = 5
BACKOFF_BASE = 1.0  # giây; lần thử lại thứ n chờ khoảng BACKOFF_BASE * 2^(n-1)
MAX_RETRY_WAIT = 120.0  # server yêu cầu chờ lâu hơn mức này thì bỏ URL, để lần `resume` sau xử lý


class Page(NamedTuple):
    url: str  # URL cuối cùng sau khi đi hết các chặng chuyển hướng
    text: str


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def _retry_after(response: httpx.Response) -> float:
    """Số giây server yêu cầu chờ (Retry-After dạng số giây hoặc HTTP-date); 0 nếu không có."""
    value = response.headers.get("retry-after", "").strip()
    if value.isdigit():
        return float(value)
    try:
        return max(0.0, (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds())
    except (TypeError, ValueError):
        return 0.0


class HttpClient:
    def __init__(
        self,
        settings: HttpSettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._settings = settings
        self._sleep = sleep
        self._http = httpx.AsyncClient(
            headers={"User-Agent": settings.user_agent, "Accept-Language": "vi,en;q=0.8"},
            timeout=settings.request_timeout,
            transport=transport,
        )
        self._slots = asyncio.Semaphore(settings.concurrency)
        self._next_start = 0.0
        self._robots: dict[str, Protego] = {}
        self._robots_lock = asyncio.Lock()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, url: str) -> Page:
        """Tải một trang; ném `FetchError` (hoặc lớp con) nếu bị cấm, không tồn tại, lỗi kéo dài."""
        return await self._fetch(url, check_robots=True)

    async def _fetch(self, url: str, *, check_robots: bool) -> Page:
        for _ in range(MAX_REDIRECTS + 1):
            if check_robots:
                await self._ensure_allowed(url)
            response = await self._request(url)
            if not response.has_redirect_location:
                return Page(str(response.url), response.text)
            url = urljoin(url, response.headers["location"])
            log.debug("Chuyển hướng tới %s", url)
        raise FetchError(url, "Quá nhiều lần chuyển hướng")

    async def _ensure_allowed(self, url: str) -> None:
        origin = _origin(url)
        async with self._robots_lock:
            if origin not in self._robots:
                self._robots[origin] = await self._load_robots(origin)
        if not self._robots[origin].can_fetch(url, self._settings.user_agent):
            raise RobotsDisallowedError(url, "robots.txt của website không cho phép truy cập")

    async def _load_robots(self, origin: str) -> Protego:
        # Lỗi khác 404 (bị chặn, lỗi mạng...) được ném tiếp: không đọc được robots.txt thì không crawl.
        try:
            page = await self._fetch(f"{origin}/robots.txt", check_robots=False)
        except NotFoundError:
            return Protego.parse("")  # không có robots.txt → không có hạn chế
        return Protego.parse(page.text)

    async def _wait_for_turn(self, url: str) -> None:
        """Giãn cách thời điểm bắt đầu các request: `request_delay`, hoặc Crawl-delay nếu lớn hơn."""
        # ponytail: một nhịp chung cho mọi host; tách theo host nếu crawl song song nhiều website.
        robots = self._robots.get(_origin(url))
        crawl_delay = robots.crawl_delay(self._settings.user_agent) if robots else None
        delay = max(self._settings.request_delay, crawl_delay or 0.0)
        now = monotonic()
        start = max(now, self._next_start)
        self._next_start = start + delay * random.uniform(1.0, 1.25)
        if start > now:
            await self._sleep(start - now)

    async def _request(self, url: str) -> httpx.Response:
        """Một GET (không tự đi theo chuyển hướng), tự thử lại khi gặp lỗi tạm thời."""
        attempt = 0
        while True:
            attempt += 1
            status: int | None = None
            retry_after = 0.0
            async with self._slots:
                await self._wait_for_turn(url)
                try:
                    response = await self._http.get(url)
                except httpx.TransportError as exc:  # timeout, mất kết nối, lỗi TLS...
                    problem = f"{type(exc).__name__}: {exc}"
                else:
                    status = response.status_code
                    if status < 400:
                        log.debug("GET %s -> %d", url, status)
                        return response
                    if status in (401, 403) or response.headers.get("cf-mitigated") == "challenge":
                        raise BlockedError(url, f"Website từ chối truy cập (HTTP {status})", status)
                    if status in (404, 410):
                        raise NotFoundError(url, f"Trang không tồn tại (HTTP {status})", status)
                    if status not in (408, 429) and status < 500:
                        raise FetchError(url, f"HTTP {status}", status)
                    problem = f"HTTP {status}"
                    retry_after = _retry_after(response)
            if attempt > self._settings.max_retries or retry_after > MAX_RETRY_WAIT:
                raise FetchError(url, f"Thất bại sau {attempt} lần thử ({problem})", status)
            wait = max(retry_after, BACKOFF_BASE * 2 ** (attempt - 1) * random.uniform(1.0, 1.5))
            log.warning(
                "%s — thử lại sau %.1fs (lần %d/%d): %s",
                problem,
                wait,
                attempt,
                self._settings.max_retries,
                url,
                extra={"url": url, "kind": "request"},
            )
            await self._sleep(wait)
