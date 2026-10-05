"""Giao diện chung cho mọi website: `BaseParser` (HTML → model) và `BaseCrawler` (luồng tải trang).

Thêm một website mới = viết một `BaseParser` (3 hàm thuần, test bằng HTML fixture)
và khai báo một `BaseCrawler` trỏ tới parser đó. Xem README.
"""

from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import ClassVar
from urllib.parse import urlsplit

from pydantic import ValidationError

from crawl_data_app.core.exceptions import ParseError
from crawl_data_app.core.http_client import HttpClient, Page
from crawl_data_app.core.models import ChapterContent, ChapterListPage, ChapterRef, NovelInfo


class BaseParser(ABC):
    """Chuyển HTML của một website thành model chung. Không gọi mạng, không giữ trạng thái.

    Thiếu dữ liệu bắt buộc (tên truyện, nội dung chương...) thì ném `ParseError`;
    trường tuỳ chọn không tìm thấy thì để `None`.
    """

    @abstractmethod
    def parse_novel(self, html: str, url: str) -> NovelInfo:
        """Thông tin truyện từ trang giới thiệu."""

    @abstractmethod
    def parse_chapter_list(self, html: str, url: str) -> ChapterListPage:
        """Các chương trên MỘT trang mục lục (đúng thứ tự) và URL trang kế tiếp nếu còn."""

    @abstractmethod
    def parse_chapter(self, html: str, url: str) -> ChapterContent:
        """Nội dung một chương đã làm sạch."""


class BaseCrawler(ABC):
    """Luồng tải mặc định cho website render HTML sẵn và phân trang mục lục bằng link.

    Lớp con bắt buộc khai báo `name`, `domains`, `parser`; chỉ cần override `novel_url` hoặc các hàm
    `fetch_*` khi website có cơ chế riêng (mục lục nằm ở URL khác, tải thêm bằng AJAX được phép...).
    `domains[0]` là tên miền đang hoạt động: web UI tải thử trang chủ ở đó khi "kiểm tra kết nối".
    """

    name: ClassVar[str]
    domains: ClassVar[tuple[str, ...]]
    parser: ClassVar[BaseParser]

    def __init_subclass__(cls, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        missing = [attr for attr in ("name", "domains", "parser") if not hasattr(cls, attr)]
        if missing:
            raise TypeError(f"{cls.__name__} thiếu khai báo bắt buộc: {', '.join(missing)}")

    def __init__(self, client: HttpClient) -> None:
        self.client = client
        self._novel_page: Page | None = None

    @classmethod
    def matches(cls, url: str) -> bool:
        """Crawler này có xử lý được URL không (mặc định: so khớp tên miền)."""
        host = (urlsplit(url).hostname or "").removeprefix("www.")
        return host in cls.domains

    @classmethod
    def novel_url(cls, url: str) -> str:
        """URL trang truyện ứng với một URL bất kỳ thuộc truyện (mặc định: giữ nguyên).

        Override khi từ URL chương / trang mục lục có thể suy ra trang truyện.
        """
        return url

    async def fetch_novel(self, url: str) -> NovelInfo:
        page = await self.client.get(self.novel_url(url))
        self._novel_page = page  # thường cũng là trang 1 của mục lục → khỏi tải lại
        return self._parse(self.parser.parse_novel, page)

    async def fetch_chapter_list(self, novel: NovelInfo) -> list[ChapterRef]:
        """Toàn bộ mục lục theo đúng thứ tự của website, đã bỏ chương trùng."""
        # ponytail: mỗi lần đều duyệt lại toàn bộ mục lục (1 request / trang mục lục);
        # nếu cần tiết kiệm request cho truyện rất dài thì duyệt từ trang cuối và dừng khi gặp chương đã biết.
        chapters: dict[str, ChapterRef] = {}
        url: str | None = novel.url
        visited: set[str] = set()
        while url and url not in visited:
            visited.add(url)
            cached = self._novel_page
            page = cached if cached and cached.url == url else await self.client.get(url)
            listing = self._parse(self.parser.parse_chapter_list, page)
            for ref in listing.chapters:
                chapters.setdefault(ref.slug, ref)
            url = listing.next_url
        return list(chapters.values())

    async def fetch_chapter(self, ref: ChapterRef) -> ChapterContent:
        return self._parse(self.parser.parse_chapter, await self.client.get(ref.url))

    @staticmethod
    def _parse[T](parse: Callable[[str, str], T], page: Page) -> T:
        try:
            return parse(page.text, page.url)
        except ValidationError as exc:
            raise ParseError(f"Dữ liệu trích xuất không hợp lệ tại {page.url}: {exc}") from exc
