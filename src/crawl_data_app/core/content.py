"""Làm sạch HTML nội dung truyện: bỏ rác (script, quảng cáo, phần tử ẩn), giữ cấu trúc đoạn văn."""

import hashlib
import html
import re
import unicodedata
from collections.abc import Iterable, Sequence

from bs4 import Comment, Tag

_JUNK = "script, style, noscript, iframe, ins, form, button, svg, img"
_HIDDEN = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden", re.IGNORECASE)
_BLOCKS = ["p", "div", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "tr"]
_MD_INLINE = re.compile(r"[\\`*_\[\]<>]")
_MD_LEADING = re.compile(r"^(?:[-+#]|\d+(?=[.)]\s))")


def clean_text(text: str) -> str:
    """Chuẩn hoá Unicode về NFC (tiếng Việt hay lẫn dấu tổ hợp) và gộp khoảng trắng thừa."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()


def _discard(elements: Iterable[Tag]) -> None:
    for element in elements:
        if not element.decomposed:  # có thể đã bị xoá cùng phần tử cha
            element.decompose()


def extract_paragraphs(node: Tag, drop: str = "") -> list[str]:
    """Trả về các đoạn văn (text thuần) theo đúng thứ tự trong `node`.

    `drop` là CSS selector bổ sung của riêng từng website (khối quảng cáo, ghi chú của trang...).
    Lưu ý: hàm sửa trực tiếp `node`.
    """
    # ponytail: chỉ giữ text — mất in đậm/nghiêng và ảnh minh hoạ; duyệt cây DOM nếu cần giữ.
    _discard(node.select(f"{_JUNK}, {drop}" if drop else _JUNK))
    _discard(node.find_all(style=_HIDDEN))
    for text in node.find_all(string=True):
        if isinstance(text, Comment):
            text.extract()
        else:  # xuống dòng trong mã nguồn HTML chỉ là khoảng trắng, không phải ngắt đoạn
            text.replace_with(re.sub(r"\s+", " ", text))
    for br in node.find_all("br"):
        br.replace_with("\n")
    for block in node.find_all(_BLOCKS):
        block.insert_before("\n")
        block.append("\n")
    lines = (clean_text(line) for line in node.get_text().split("\n"))
    return [line for line in lines if line]


def render(paragraphs: Sequence[str], content_format: str) -> str:
    """Kết xuất các đoạn văn thành HTML sạch (`<p>...</p>`) hoặc Markdown."""
    if content_format == "markdown":
        return "\n\n".join(_escape_markdown(p) for p in paragraphs)
    return "\n".join(f"<p>{html.escape(p, quote=False)}</p>" for p in paragraphs)


def _escape_markdown(paragraph: str) -> str:
    """Escape ký tự Markdown để văn bản hiển thị nguyên văn (vd. câu thoại mở đầu bằng "- ")."""
    escaped = _MD_INLINE.sub(lambda m: "\\" + m.group(), paragraph)
    return _MD_LEADING.sub(
        lambda m: m.group() + "\\" if m.group().isdigit() else "\\" + m.group(), escaped
    )


def to_paragraphs(content: str, content_format: str) -> list[str]:
    """Ngược với `render`: nội dung đã lưu → các đoạn văn text thuần."""
    if content_format == "markdown":
        return [re.sub(r"\\(.)", r"\1", p) for p in content.split("\n\n")]
    return [
        html.unescape(line.removeprefix("<p>").removesuffix("</p>")) for line in content.split("\n")
    ]


def split_title(title: str, paragraphs: list[str]) -> tuple[str, list[str]]:
    """Nhiều chương tự mở đầu bằng tiêu đề đầy đủ: lấy dòng đó làm tiêu đề thay vì lặp lại trong nội dung."""
    if paragraphs and paragraphs[0].startswith(title):
        return paragraphs[0], paragraphs[1:]
    return title, paragraphs


def content_hash(paragraphs: Sequence[str]) -> str:
    """Dấu vân tay nội dung, không phụ thuộc định dạng lưu — dùng để phát hiện chương bị sửa."""
    return hashlib.sha256("\n".join(paragraphs).encode()).hexdigest()
