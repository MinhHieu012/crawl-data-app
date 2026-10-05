"""HTTP client: retry/backoff, phân loại mã lỗi, robots.txt, giãn cách và giới hạn đồng thời."""

import asyncio

import httpx
import pytest

from novel_crawler.core.exceptions import (
    BlockedError,
    FetchError,
    NotFoundError,
    RobotsDisallowedError,
)

pytestmark = pytest.mark.anyio

URL = "https://example.test/truyen/"


class Server:
    """Trả lần lượt các phản hồi đã kê (phần tử cuối lặp lại mãi).

    Phần tử là mã HTTP, dict tham số của `httpx.Response`, hoặc Exception để ném ra.
    `calls` chỉ ghi request tới trang, không tính robots.txt.
    """

    def __init__(self, *script: object, robots: str | None = None) -> None:
        self.script = script
        self.robots = robots
        self.robots_hits = 0
        self.calls: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            self.robots_hits += 1
            return (
                httpx.Response(404)
                if self.robots is None
                else httpx.Response(200, text=self.robots)
            )
        self.calls.append(str(request.url))
        step = self.script[min(len(self.calls), len(self.script)) - 1]
        if isinstance(step, Exception):
            raise step
        if isinstance(step, int):
            return httpx.Response(step, text="ok" if step < 400 else "lỗi")
        return httpx.Response(**step)


async def test_returns_final_url_and_text(make_client):
    server = Server({"status_code": 200, "text": "<p>xin chào</p>"})
    assert await make_client(server).get(URL) == (URL, "<p>xin chào</p>")


async def test_sends_configured_user_agent(make_client):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(404 if request.url.path == "/robots.txt" else 200)

    await make_client(handler, user_agent="bot-thu-nghiem/1.0").get(URL)
    assert set(seen) == {"bot-thu-nghiem/1.0"}


# --- Retry và backoff -------------------------------------------------------------------------


async def test_transient_failures_are_retried_with_exponential_backoff(make_client, clock):
    server = Server(503, httpx.ReadTimeout("chậm"), httpx.ConnectError("đứt kết nối"), 200)

    page = await make_client(server, max_retries=3).get(URL)

    assert page.text == "ok"
    assert len(server.calls) == 4
    backoffs = [s for s in clock.sleeps if s >= 1.0]  # các lần nghỉ giãn cách đều < 1s
    assert len(backoffs) == 3
    assert 1.0 <= backoffs[0] <= 1.5
    assert 2.0 <= backoffs[1] <= 3.0
    assert 4.0 <= backoffs[2] <= 6.0


async def test_gives_up_after_max_retries(make_client):
    server = Server(500)

    with pytest.raises(FetchError) as error:
        await make_client(server, max_retries=2).get(URL)

    assert error.value.status_code == 500
    assert error.value.url == URL
    assert len(server.calls) == 3


async def test_timeout_is_retried_then_reported(make_client):
    server = Server(httpx.ConnectTimeout("quá thời gian"))

    with pytest.raises(FetchError, match="ConnectTimeout"):
        await make_client(server, max_retries=1).get(URL)

    assert len(server.calls) == 2


@pytest.mark.parametrize(
    ("status", "error"),
    [(404, NotFoundError), (410, NotFoundError), (401, BlockedError), (403, BlockedError)],
)
async def test_permanent_errors_are_not_retried(make_client, status, error):
    server = Server(status)

    with pytest.raises(error) as raised:
        await make_client(server).get(URL)

    assert raised.value.status_code == status
    assert len(server.calls) == 1


async def test_other_client_errors_fail_without_retry(make_client):
    server = Server(400)

    with pytest.raises(FetchError, match="HTTP 400"):
        await make_client(server).get(URL)

    assert len(server.calls) == 1


async def test_cloudflare_challenge_is_reported_as_blocked(make_client):
    challenge = {
        "status_code": 503,
        "headers": {"cf-mitigated": "challenge"},
        "text": "Just a moment...",
    }
    server = Server(challenge)

    with pytest.raises(BlockedError):
        await make_client(server).get(URL)

    assert len(server.calls) == 1  # không thử lại, không tìm cách vượt


async def test_retry_after_header_is_honoured(make_client, clock):
    server = Server({"status_code": 429, "headers": {"Retry-After": "7"}}, 200)

    await make_client(server).get(URL)

    assert 7.0 in clock.sleeps


async def test_excessive_retry_after_fails_instead_of_retrying_early(make_client):
    server = Server({"status_code": 429, "headers": {"Retry-After": "3600"}})

    with pytest.raises(FetchError):
        await make_client(server).get(URL)

    assert len(server.calls) == 1


# --- robots.txt -------------------------------------------------------------------------------


async def test_url_disallowed_by_robots_is_never_requested(make_client):
    server = Server(200, robots="User-agent: *\nDisallow: /ajax\n")

    with pytest.raises(RobotsDisallowedError):
        await make_client(server).get("https://example.test/ajax.php?type=list_chapter")

    assert server.calls == []


async def test_robots_wildcard_rules_are_understood(make_client):
    client = make_client(Server(200, robots="User-agent: *\nDisallow: /*?sort=\n"))

    assert (await client.get(URL)).text == "ok"
    with pytest.raises(RobotsDisallowedError):
        await client.get(f"{URL}?sort=moi-nhat")


async def test_rules_for_our_user_agent_take_precedence(make_client):
    robots = "User-agent: *\nAllow: /\n\nUser-agent: novel-crawler\nDisallow: /\n"

    with pytest.raises(RobotsDisallowedError):
        await make_client(Server(200, robots=robots)).get(URL)


async def test_missing_robots_txt_means_no_restriction(make_client):
    assert (await make_client(Server(200, robots=None)).get(URL)).text == "ok"


async def test_robots_txt_is_fetched_once_per_host(make_client):
    server = Server(200, robots="User-agent: *\nDisallow:\n")
    client = make_client(server)

    await asyncio.gather(*(client.get(f"{URL}{i}") for i in range(5)))

    assert server.robots_hits == 1
    assert len(server.calls) == 5


async def test_blocked_robots_txt_stops_the_crawl(make_client):
    with pytest.raises(BlockedError):
        await make_client(lambda request: httpx.Response(403)).get(URL)


# --- Chuyển hướng -----------------------------------------------------------------------------


async def test_redirect_is_followed_across_hosts(make_client):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.host == "old.test":
            return httpx.Response(301, headers={"Location": "https://new.test/truyen/"})
        return httpx.Response(200, text="trang mới")

    page = await make_client(handler).get("https://old.test/truyen/")

    assert page == ("https://new.test/truyen/", "trang mới")


async def test_redirect_target_must_pass_its_own_robots(make_client):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            if request.url.host == "new.test":
                return httpx.Response(200, text="User-agent: *\nDisallow: /\n")
            return httpx.Response(404)
        return httpx.Response(302, headers={"Location": "https://new.test/truyen/"})

    with pytest.raises(RobotsDisallowedError):
        await make_client(handler).get("https://old.test/truyen/")


async def test_redirect_loop_gives_up(make_client):
    server = Server({"status_code": 302, "headers": {"Location": URL}})

    with pytest.raises(FetchError, match="chuyển hướng"):
        await make_client(server).get(URL)


# --- Giãn cách và giới hạn đồng thời -------------------------------------------------------------


async def test_requests_are_spaced_by_request_delay(make_client, clock):
    client = make_client(Server(200), request_delay=2.0)

    for _ in range(3):
        await client.get(URL)

    # robots.txt + 3 trang = 4 request → 3 khoảng nghỉ, mỗi khoảng tối thiểu request_delay
    assert len(clock.sleeps) == 3
    assert all(pause >= 2.0 for pause in clock.sleeps)


async def test_crawl_delay_from_robots_wins_when_longer(make_client, clock):
    client = make_client(Server(200, robots="User-agent: *\nCrawl-delay: 5\n"), request_delay=0.5)

    await client.get(URL)
    await client.get(URL)

    assert max(clock.sleeps) >= 5.0


async def test_concurrency_limit_is_respected(make_client):
    in_flight = peak = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return httpx.Response(200, text="ok")

    client = make_client(handler, concurrency=2)
    await asyncio.gather(*(client.get(f"{URL}{i}") for i in range(8)))

    assert peak == 2
