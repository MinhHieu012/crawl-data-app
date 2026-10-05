"""Crawler TruyenFull: dùng luồng mặc định của `BaseCrawler`, chỉ thêm nhận diện tên miền và chuẩn hoá URL."""

import re
from urllib.parse import urlsplit

from novel_crawler.core.base_crawler import BaseCrawler
from novel_crawler.crawlers.truyenfull.parser import TruyenFullParser, novel_root


class TruyenFullCrawler(BaseCrawler):
    name = "truyenfull"
    # Tên miền đang hoạt động ổn định nhất đứng đầu (khảo sát 05/10/2026), các tên miền cũ theo sau.
    domains = ("truyenfull.live", "truyenfull.today", "truyenfull.vision", "truyenfull.vn")
    parser = TruyenFullParser()

    @classmethod
    def matches(cls, url: str) -> bool:
        # Website đổi tên miền liên tục (.vn → .vision → .today/.live) nên nhận mọi truyenfull.<tld>;
        # `domains` chỉ là danh sách tên miền đã biết để hiển thị.
        host = (urlsplit(url).hostname or "").removeprefix("www.")
        return re.fullmatch(r"truyenfull\.[a-z]+", host) is not None

    @classmethod
    def novel_url(cls, url: str) -> str:
        # Chấp nhận cả URL chương hoặc trang mục lục: luôn quy về trang gốc của truyện.
        return novel_root(url)
