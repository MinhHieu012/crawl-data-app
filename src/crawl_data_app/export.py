"""Xuất truyện đã lưu ra file .txt, .json hoặc .epub (EPUB 3) — chỉ dùng thư viện chuẩn."""

import html
import json
import re
import zipfile
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import Row

from crawl_data_app.core.content import split_title, to_paragraphs
from crawl_data_app.database.models import Novel

Chapters = Sequence[tuple[int, str, list[str]]]  # (số thứ tự, tiêu đề chương, các đoạn văn)

_XML_INVALID = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_CONTAINER = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""
_CSS = "body{line-height:1.6} p{margin:0 0 .8em;text-indent:1.5em} h1,h2{text-align:center}"


def write_txt(path: Path, novel: Novel, chapters: Chapters) -> None:
    blocks = [f"{novel.title}\nTác giả: {novel.author or 'không rõ'}\nNguồn: {novel.url}"]
    blocks += ["\n\n".join([title, *paragraphs]) for _, title, paragraphs in chapters]
    path.write_text("\n\n\n".join(blocks) + "\n", encoding="utf-8")


def to_chapters(rows: Sequence[Row]) -> list[tuple[int, str, list[str]]]:
    """Các dòng của `NovelRepository.done_chapters` → `Chapters` (nội dung thành đoạn văn text thuần)."""
    return [
        (row.number, *split_title(row.title, to_paragraphs(row.content, row.content_format)))
        for row in rows
    ]


def file_stem(novel: Novel, chapters: Chapters, *, ranged: bool) -> str:
    """Tên file (chưa có đuôi): `<slug>`, hoặc `<slug>-c<đầu>-<cuối>` khi chỉ xuất một khoảng chương
    — theo số chương thật sự có trong file, để không ghi đè lên bản xuất toàn bộ.
    """
    # ponytail: tên file chỉ theo slug; thêm tiền tố nguồn nếu hai website có truyện trùng slug.
    return f"{novel.slug}-c{chapters[0][0]}-{chapters[-1][0]}" if ranged else novel.slug


def novel_json(novel: Novel, chapters: Chapters) -> str:
    data = {
        "title": novel.title,
        "author": novel.author,
        "genres": novel.genres,
        "description": novel.description,
        "status": novel.status,
        "cover_url": novel.cover_url,
        "url": novel.url,
        "total_chapters": novel.total_chapters,  # theo mục lục của nguồn; `chapters` chỉ gồm chương đã tải
        "chapters": [
            {"number": number, "title": title, "paragraphs": paragraphs}
            for number, title, paragraphs in chapters
        ],
    }
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def write_json(path: Path, novel: Novel, chapters: Chapters) -> None:
    path.write_text(novel_json(novel, chapters), encoding="utf-8")


def _esc(text: str) -> str:
    return html.escape(_XML_INVALID.sub("", text))


def _paragraphs(lines: Sequence[str]) -> str:
    return "".join(f"<p>{_esc(line)}</p>\n" for line in lines)


def _page(title: str, body: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head><meta charset="utf-8"/><title>{_esc(title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
{body}</body>
</html>"""


def write_epub(path: Path, novel: Novel, chapters: Chapters) -> None:
    # ponytail: EPUB 3 tối giản — không ảnh bìa, không toc.ncx (chỉ máy đọc EPUB 2 rất cũ mới cần).
    files = [f"c{number}.xhtml" for number in range(1, len(chapters) + 1)]
    info = f"<h1>{_esc(novel.title)}</h1>\n<p>Tác giả: {_esc(novel.author or 'không rõ')}</p>\n"
    info += f"<p>Nguồn: {_esc(novel.url)}</p>\n" + _paragraphs(
        (novel.description or "").split("\n")
    )
    toc = "".join(
        f'<li><a href="{file}">{_esc(title)}</a></li>\n'
        for file, (_, title, _) in zip(files, chapters, strict=True)
    )
    nav = f'<nav epub:type="toc"><h1>Mục lục</h1>\n<ol>\n{toc}</ol></nav>\n'
    pages = ["info.xhtml", *files]
    manifest = "".join(
        f'<item id="{file.split(".")[0]}" href="{file}" media-type="application/xhtml+xml"/>\n'
        for file in pages
    )
    spine = "".join(f'<itemref idref="{file.split(".")[0]}"/>\n' for file in pages)
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="vi">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:{uuid5(NAMESPACE_URL, novel.url)}</dc:identifier>
<dc:title>{_esc(novel.title)}</dc:title>
<dc:language>vi</dc:language>
<dc:creator>{_esc(novel.author or "không rõ")}</dc:creator>
<dc:source>{_esc(novel.url)}</dc:source>
<meta property="dcterms:modified">{datetime.now(UTC):%Y-%m-%dT%H:%M:%SZ}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
{manifest}</manifest>
<spine>
{spine}</spine>
</package>"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as book:
        # Chuẩn EPUB: `mimetype` phải là mục đầu tiên và không nén.
        book.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        book.writestr("META-INF/container.xml", _CONTAINER)
        book.writestr("OEBPS/content.opf", opf)
        book.writestr("OEBPS/style.css", _CSS)
        book.writestr("OEBPS/nav.xhtml", _page("Mục lục", nav))
        book.writestr("OEBPS/info.xhtml", _page(novel.title, info))
        for file, (_, title, paragraphs) in zip(files, chapters, strict=True):
            body = f"<h2>{_esc(title)}</h2>\n{_paragraphs(paragraphs)}"
            book.writestr(f"OEBPS/{file}", _page(title, body))


WRITERS = {"txt": write_txt, "epub": write_epub, "json": write_json}
