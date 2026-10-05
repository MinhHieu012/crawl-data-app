"""Bộ làm sạch nội dung: bỏ rác nhưng giữ đúng cấu trúc đoạn văn."""

from bs4 import BeautifulSoup

from novel_crawler.core.content import content_hash, extract_paragraphs, render


def paragraphs(html: str, drop: str = "") -> list[str]:
    soup = BeautifulSoup(f'<div id="c">{html}</div>', "html.parser")
    return extract_paragraphs(soup.div, drop)


def test_br_separated_text_becomes_paragraphs():
    html = "Đoạn một.<br><br><br><br>Đoạn hai.<br/>Đoạn ba."
    assert paragraphs(html) == ["Đoạn một.", "Đoạn hai.", "Đoạn ba."]


def test_block_tags_split_paragraphs_but_inline_tags_do_not():
    html = "<p>Anh <i>nói</i> khẽ.</p><p>Cô <b>gật</b> <a href='#'>đầu</a>.</p>"
    assert paragraphs(html) == ["Anh nói khẽ.", "Cô gật đầu."]


def test_junk_is_removed():
    html = (
        '<div id="ads-chapter-top"><ins class="adsbygoogle"></ins>Quảng cáo</div>'
        "Nội dung thật.<script>alert('x')</script><!-- ghi chú của trang -->"
        '<p style="display: none;visibility: hidden;height: 0;">truyen full</p>'
        '<p style="display:none"><a href="#">truyenfull</a></p>'
        '<img src="a.jpg"><iframe src="x"></iframe><style>p{color:red}</style>'
    )
    assert paragraphs(html, drop="[id^=ads]") == ["Nội dung thật."]


def test_source_newlines_are_whitespace_not_paragraph_breaks():
    assert paragraphs("  Một câu bị\n\t xuống dòng  trong mã nguồn.  ") == [
        "Một câu bị xuống dòng trong mã nguồn."
    ]


def test_unicode_is_normalised_to_nfc():
    decomposed = "Truyện"  # "Truyện" viết bằng dấu tổ hợp
    assert paragraphs(decomposed) == ["Truyện"]


def test_empty_container_gives_no_paragraphs():
    assert paragraphs("<br><br><script>x</script>  ") == []


def test_render_html_wraps_and_escapes():
    assert render(["a < b & c", "d"], "html") == "<p>a &lt; b &amp; c</p>\n<p>d</p>"


def test_render_markdown_keeps_text_literal():
    result = render(["- Xin chào *bạn*", "1. Một", "# Tiêu đề", "Bình thường"], "markdown")
    assert result == "\\- Xin chào \\*bạn\\*\n\n1\\. Một\n\n\\# Tiêu đề\n\nBình thường"


def test_content_hash_depends_only_on_text():
    assert content_hash(["a", "b"]) == content_hash(["a", "b"])
    assert content_hash(["a", "b"]) != content_hash(["a", "c"])
