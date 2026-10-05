"""Parser cho TruyenFull.

Cấu trúc HTML khảo sát trực tiếp trên truyenfull.live ngày 2026-10-05:

- Trang truyện `/<slug>/`: `h3.title`, `.info a[itemprop=author|genre]`, dòng "Trạng thái:" trong
  `.info`, `.desc-text`, `.book img`, `<meta property="book:release_date">`.
- Mục lục: `#list-chapter ul.list-chapter li a`, 50 chương/trang; trang kế là `/<slug>/trang-N/`
  (lấy từ `ul.pagination`). Không dùng `/ajax.php` vì robots.txt của website cấm `/ajax`.
- Trang chương `/<slug>/chuong-N/`: `a.chapter-title`, `#chapter-c` — các đoạn ngăn bằng `<br>`,
  lẫn khối quảng cáo `#ads-*` và thẻ ẩn `display:none` chứa từ khoá SEO.
"""

import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag

from crawl_data_app.core.base_crawler import BaseParser
from crawl_data_app.core.content import clean_text, extract_paragraphs
from crawl_data_app.core.exceptions import CrawlerError, ParseError
from crawl_data_app.core.models import (
    ChapterContent,
    ChapterListPage,
    ChapterRef,
    NovelInfo,
    NovelStatus,
)

_ADS = "[id^=ads], [class^=ads], [class*=' ads']"
_PAGE = re.compile(r"/trang-(\d+)/?$")


def novel_root(url: str) -> str:
    """URL gốc của truyện từ bất kỳ URL nào thuộc truyện đó (trang mục lục, trang chương...)."""
    parts = urlsplit(url)
    slug = parts.path.strip("/").split("/")[0]
    if not slug:
        raise CrawlerError(f"URL không trỏ tới truyện nào: {url}")
    return f"{parts.scheme}://{parts.netloc}/{slug}/"


def _text(element: Tag | None) -> str:
    return clean_text(element.get_text()) if element else ""


def _last_segment(url: str) -> str:
    return urlsplit(url).path.strip("/").split("/")[-1]


def _info_value(soup: BeautifulSoup, label: str) -> str:
    """Giá trị một dòng trong khối thông tin, vd. dòng "Trạng thái:" → "Full"."""
    for row in soup.select(".info > div"):
        heading = _text(row.find("h3"))
        if label in heading:
            return _text(row).removeprefix(heading).strip()
    return ""


def _status(label: str) -> NovelStatus:
    label = label.lower()
    if "full" in label or "hoàn" in label:
        return NovelStatus.COMPLETED
    if "đang" in label:
        return NovelStatus.ONGOING
    if "ngưng" in label or "drop" in label:
        return NovelStatus.PAUSED
    return NovelStatus.UNKNOWN


def _parse_datetime(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def _next_page(container: Tag, url: str) -> str | None:
    """Link tới trang mục lục kế tiếp (trang hiện tại + 1) trong thanh phân trang, nếu còn."""
    current = _PAGE.search(urlsplit(url).path)
    wanted = int(current.group(1)) + 1 if current else 2
    for link in container.select("ul.pagination a[href]"):
        target = urljoin(url, link["href"]).split("#")[0]
        page = _PAGE.search(urlsplit(target).path)
        if page and int(page.group(1)) == wanted:
            return target
    return None


class TruyenFullParser(BaseParser):
    def parse_novel(self, html: str, url: str) -> NovelInfo:
        soup = BeautifulSoup(html, "html.parser")
        title = _text(soup.select_one("h3.title"))
        if not title:
            raise ParseError(f"Không tìm thấy tên truyện (h3.title) tại {url}")
        root = novel_root(url)
        authors = [a for a in map(_text, soup.select(".info a[itemprop=author]")) if a]
        description = soup.select_one(".desc-text")
        cover = soup.select_one(".book img[src]")
        released = soup.select_one('meta[property="book:release_date"]')
        return NovelInfo(
            slug=_last_segment(root),
            url=root,
            title=title,
            author=", ".join(authors) or None,
            genres=[g for g in map(_text, soup.select(".info a[itemprop=genre]")) if g],
            description="\n".join(extract_paragraphs(description)) or None if description else None,
            cover_url=urljoin(url, cover["src"]) if cover else None,
            status=_status(_info_value(soup, "Trạng thái")),
            # `book:release_date` là ngày ĐĂNG truyện, không phải ngày cập nhật (đã đối chiếu với mục
            # "truyện mới cập nhật" ở trang chủ). Trang truyện không công bố thời điểm cập nhật,
            # nên `source_updated_at` để trống thay vì điền một mốc thời gian sai nghĩa.
            published_at=_parse_datetime(released.get("content") if released else None),
        )

    def parse_chapter_list(self, html: str, url: str) -> ChapterListPage:
        soup = BeautifulSoup(html, "html.parser")
        container = soup.select_one("#list-chapter")
        if container is None:
            raise ParseError(f"Không tìm thấy mục lục (#list-chapter) tại {url}")
        chapters = []
        for link in container.select("ul.list-chapter li a[href]"):
            chapter_url = urljoin(url, link["href"])
            title = _text(link)
            if title:
                chapters.append(
                    ChapterRef(slug=_last_segment(chapter_url), url=chapter_url, title=title)
                )
        return ChapterListPage(chapters=chapters, next_url=_next_page(container, url))

    def parse_chapter(self, html: str, url: str) -> ChapterContent:
        soup = BeautifulSoup(html, "html.parser")
        body = soup.select_one("#chapter-c")
        if body is None:
            raise ParseError(f"Không tìm thấy nội dung chương (#chapter-c) tại {url}")
        paragraphs = extract_paragraphs(body, drop=_ADS)
        if not paragraphs:
            raise ParseError(f"Nội dung chương rỗng (có thể là chương ảnh) tại {url}")
        title = _text(soup.select_one("a.chapter-title")) or None
        return ChapterContent(title=title, paragraphs=paragraphs)
