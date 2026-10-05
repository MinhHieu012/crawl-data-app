"""Danh bạ crawler.

Thêm website mới: tạo thư mục `crawlers/<ten_site>/` với parser + crawler, rồi đăng ký vào `CRAWLERS`.
"""

from collections.abc import Collection

from novel_crawler.core.base_crawler import BaseCrawler
from novel_crawler.core.exceptions import SourceDisabledError, UnsupportedSiteError
from novel_crawler.crawlers.truyenfull.crawler import TruyenFullCrawler

CRAWLERS: tuple[type[BaseCrawler], ...] = (TruyenFullCrawler,)


def crawler_class_for(url: str, disabled: Collection[str] = ()) -> type[BaseCrawler]:
    """Crawler xử lý được `url`. `disabled`: tên các nguồn đang bị tắt trong cấu hình."""
    for crawler in CRAWLERS:
        if crawler.matches(url):
            if crawler.name in disabled:
                raise SourceDisabledError(
                    f"Nguồn {crawler.name} đang bị tắt — bật lại ở trang Nguồn của web UI "
                    "hoặc sửa CRAWLER_DISABLED_SOURCES"
                )
            return crawler
    supported = ", ".join(crawler.name for crawler in CRAWLERS)
    raise UnsupportedSiteError(f"Chưa hỗ trợ website của URL: {url} (đang hỗ trợ: {supported})")
