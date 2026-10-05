"""Phân loại lỗi của crawler — service dựa vào đây để quyết định thử lại, bỏ qua hay dừng hẳn."""


class CrawlerError(Exception):
    """Lỗi gốc; mọi lỗi "có chủ đích" của crawler đều kế thừa lớp này."""


class UnsupportedSiteError(CrawlerError):
    """Chưa có crawler nào nhận xử lý URL này."""


class SourceDisabledError(CrawlerError):
    """Website của URL có crawler nhưng đang bị tắt trong cấu hình (`CRAWLER_DISABLED_SOURCES`)."""


class ParseError(CrawlerError):
    """HTML không còn khớp cấu trúc mà parser mong đợi (website đổi giao diện, trang lỗi...)."""


class FetchError(CrawlerError):
    """Không tải được URL (đã hết số lần thử lại nếu là lỗi tạm thời)."""

    def __init__(self, url: str, message: str, status_code: int | None = None) -> None:
        super().__init__(f"{message}: {url}")
        self.url = url
        self.status_code = status_code


class NotFoundError(FetchError):
    """HTTP 404/410 — không thử lại."""


class RobotsDisallowedError(FetchError):
    """robots.txt của website không cho phép truy cập URL này."""


class BlockedError(FetchError):
    """Website từ chối hoặc thách thức client (401/403, Cloudflare challenge).

    Crawler không tìm cách vượt qua: gặp lỗi này là dừng cả phiên crawl.
    """
