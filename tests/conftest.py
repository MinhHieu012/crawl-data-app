"""Fixture dùng chung. Không test nào gọi mạng thật: HTTP đi qua `httpx.MockTransport`."""

from collections import Counter
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest
from sqlalchemy.orm import Session, sessionmaker

from crawl_data_app import aviation, banks, provinces
from crawl_data_app.config.settings import HttpSettings
from crawl_data_app.core import http_client
from crawl_data_app.core.http_client import HttpClient
from crawl_data_app.database.session import create_db_engine, init_db, make_session_factory
from crawl_data_app.repository import NovelRepository

FIXTURES = Path(__file__).parent / "fixtures"
BASE = "https://truyenfull.live"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def load_fixture() -> Callable[[str], str]:
    return lambda name: (FIXTURES / name).read_text(encoding="utf-8")


class FakeClock:
    """Đồng hồ giả: `sleep` chỉ tua thời gian nên test chạy tức thì mà vẫn đo được thời gian chờ."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> FakeClock:
    fake = FakeClock()
    monkeypatch.setattr(http_client, "monotonic", fake.monotonic)
    return fake


def _novel_html(
    root: str, title: str, status: str, numbers: list[int], page: int, pages: int
) -> str:
    items = "".join(
        f'<li><span class="glyphicon glyphicon-certificate"></span> '
        f'<a href="{root}chuong-{n}/" title="{title} - Chương {n}">'
        f'<span class="chapter-text"><span>Chương </span></span>{n}: Tên chương {n}</a></li>'
        for n in numbers
    )
    links = "".join(
        f'<li class="active"><span>{p}</span></li>'
        if p == page
        else f'<li><a href="{root}{"" if p == 1 else f"trang-{p}/"}#list-chapter">{p}</a></li>'
        for p in range(1, pages + 1)
    )
    return f"""<html><head><link rel="canonical" href="{root}">
<meta property="book:release_date" content="2026-09-05T15:09:24+07:00"></head><body>
<div class="col-info-desc">
  <div class="info-holder">
    <div class="books"><div class="book"><img src="https://img.example.test/bia.jpg" itemprop="image"></div></div>
    <div class="info">
      <div><h3>Tác giả:</h3><a itemprop="author" href="{BASE}/tac-gia/tac-gia-mau/">Tác Giả Mẫu</a></div>
      <div><h3>Thể loại:</h3><a itemprop="genre" href="#">Tiên Hiệp</a>, <a itemprop="genre" href="#">Huyền Huyễn</a></div>
      <div><h3>Trạng thái:</h3><span class="text-primary">{status}</span></div>
    </div>
  </div>
  <h3 class="title" itemprop="name">{title}</h3>
  <div class="desc-text" itemprop="description"><p>Giới thiệu {title}.</p></div>
</div>
<div id="list-chapter"><ul class="list-chapter">{items}</ul>
<ul class="pagination pagination-sm">{links}</ul></div>
</body></html>"""


def _chapter_html(number: int, body: str) -> str:
    return f"""<html><body><div id="chapter-big-container">
<h2><a class="chapter-title" href="#"><span class="chapter-text"><span>Chương </span></span>{number}</a></h2>
<div id="chapter-c" class="chapter-c"><div id="ads-chapter-top"></div>{body}
<p style="display: none;visibility: hidden;height: 0;">truyen full</p></div>
</div></body></html>"""


class FakeSite:
    """Website giả dựng theo đúng markup của TruyenFull; đếm số request tới từng URL."""

    def __init__(self) -> None:
        # Giá trị là HTML (trả 200) hoặc hàm nhận request và tự trả response (để giả lập lỗi).
        self.pages: dict[str, str | Callable[[httpx.Request], httpx.Response]] = {}
        self.hits: Counter[str] = Counter()
        self.robots = "User-agent: *\nDisallow: /ajax\nDisallow: /api\n"

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.hits[url] += 1
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text=self.robots)
        page = self.pages.get(url)
        if page is None:
            return httpx.Response(404, text="không có trang này")
        return page(request) if callable(page) else httpx.Response(200, html=page)

    def requests_to(self, part: str) -> int:
        return sum(count for url, count in self.hits.items() if part in url)

    def add_novel(
        self,
        slug: str,
        chapters: int,
        *,
        per_page: int = 3,
        title: str = "Truyện Mẫu",
        status: str = "Đang ra",
        base: str = BASE,
    ) -> str:
        """Dựng trang truyện, các trang mục lục và trang chương; trả về URL truyện.

        Gọi lại với `chapters` lớn hơn để giả lập website vừa ra chương mới.
        """
        root = f"{base}/{slug}/"
        numbers = list(range(1, chapters + 1))
        chunks = [numbers[i : i + per_page] for i in range(0, chapters, per_page)] or [[]]
        for page, chunk in enumerate(chunks, start=1):
            url = root if page == 1 else f"{root}trang-{page}/"
            self.pages[url] = _novel_html(root, title, status, chunk, page, len(chunks))
        for n in numbers:
            self.set_chapter(root, n, f"Mở đầu chương {n}.<br><br>Kết thúc chương {n}.")
        return root

    def set_chapter(self, root: str, number: int, body: str) -> None:
        self.pages[f"{root}chuong-{number}/"] = _chapter_html(number, body)


@pytest.fixture
def site() -> FakeSite:
    return FakeSite()


@pytest.fixture
def sources(site: FakeSite, load_fixture: Callable[[str], str]) -> FakeSite:
    """Website giả trả thêm file dữ liệu của hai nguồn hàng không, của danh mục tỉnh thành và của
    danh mục ngân hàng (fixture tự viết).
    """
    files = {
        aviation.VNA_ROUTES_URL.format(lang="en"): "aviation/vna-routes.en.json",
        aviation.VNA_ROUTES_URL.format(lang="vi"): "aviation/vna-routes.vi.json",
        aviation.VNA_AIRLINES_URL: "aviation/vna-airlines.json",
        aviation.WORLD_COUNTRIES_URL: "aviation/world-countries.csv",
        aviation.WORLD_AIRPORTS_URL: "aviation/world-airports.csv",
        aviation.WORLD_AIRLINES_URL: "aviation/world-airlines.dat",
        provinces.DATA_URL: "provinces/vn-units.json",
        banks.DATA_URL: "banks/vn-banks.json",
    }
    for url, name in files.items():
        text = load_fixture(name)
        site.pages[url] = lambda _request, text=text: httpx.Response(200, text=text)
    site.robots = "User-agent: *\nDisallow:\n"
    return site


@pytest.fixture
def db(tmp_path: Path) -> Iterator[sessionmaker[Session]]:
    """Session factory trên SQLite tạm; schema dựng bằng chính migration Alembic như khi chạy thật."""
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    init_db(engine)
    yield make_session_factory(engine)
    engine.dispose()


@pytest.fixture
def repo(db: sessionmaker[Session]) -> NovelRepository:
    return NovelRepository(db)


@pytest.fixture
def make_client(site: FakeSite, clock: FakeClock) -> Callable[..., HttpClient]:
    """Tạo HttpClient nối vào website giả (hoặc `handler` riêng); mọi lần chờ đi qua `clock`."""

    def _make(handler: Callable | None = None, **overrides: object) -> HttpClient:
        values = {"request_delay": 0.5, "max_retries": 2, **overrides}
        return HttpClient(
            HttpSettings(_env_file=None, **values),
            transport=httpx.MockTransport(handler or site.handler),
            sleep=clock.sleep,
        )

    return _make
