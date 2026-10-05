"""Parser TruyenFull chạy trên HTML mẫu (khung markup thật, nội dung giả) — không có request nào."""

from datetime import datetime, timedelta, timezone

import pytest

from novel_crawler.core.exceptions import CrawlerError, ParseError
from novel_crawler.core.models import NovelStatus
from novel_crawler.crawlers.truyenfull.parser import TruyenFullParser, novel_root

NOVEL_URL = "https://truyenfull.live/truyen-mau/"
parser = TruyenFullParser()


@pytest.fixture
def novel_html(load_fixture) -> str:
    return load_fixture("truyenfull/novel.html")


@pytest.fixture
def chapter_html(load_fixture) -> str:
    return load_fixture("truyenfull/chapter.html")


# --- Thông tin truyện -------------------------------------------------------------------------


def test_parse_novel_extracts_every_field(novel_html):
    novel = parser.parse_novel(novel_html, NOVEL_URL)

    assert novel.slug == "truyen-mau"
    assert novel.url == NOVEL_URL
    assert novel.title == "Truyện Mẫu Kiểm Thử"
    assert novel.author == "Nguyễn Văn A"
    assert novel.genres == ["Tiên Hiệp", "Huyền Huyễn"]
    assert novel.description == "Đoạn giới thiệu thứ nhất.\nĐoạn giới thiệu thứ hai có chữ đậm."
    assert novel.cover_url == "https://cdn.example.test/covers/truyen-mau.jpg"
    assert novel.status is NovelStatus.ONGOING
    assert novel.total_chapters is None  # trang truyện không công bố; service tự đếm từ mục lục
    assert novel.published_at == datetime(
        2026, 9, 5, 15, 9, 24, tzinfo=timezone(timedelta(hours=7))
    )
    # Trang truyện không công bố ngày cập nhật; không được lấy ngày đăng điền thay.
    assert novel.source_updated_at is None


def test_hidden_seo_spam_does_not_leak_into_fields(novel_html):
    novel = parser.parse_novel(novel_html, NOVEL_URL)

    everything = " ".join([novel.author, *novel.genres, novel.description]).lower()
    assert "truyenfull" not in everything
    assert "truyện full" not in everything


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Full", NovelStatus.COMPLETED),
        ("Hoàn thành", NovelStatus.COMPLETED),
        ("Đang ra", NovelStatus.ONGOING),
        ("Tạm ngưng", NovelStatus.PAUSED),
        ("Nhãn chưa từng thấy", NovelStatus.UNKNOWN),
    ],
)
def test_status_label_mapping(novel_html, label, expected):
    html = novel_html.replace(
        '<span class="text-primary">Đang ra</span>', f'<span class="text-success">{label}</span>'
    )

    assert parser.parse_novel(html, NOVEL_URL).status is expected


def test_missing_optional_fields_become_none():
    novel = parser.parse_novel('<h3 class="title">Chỉ Có Tên</h3>', NOVEL_URL)

    assert novel.title == "Chỉ Có Tên"
    assert novel.author is None
    assert novel.description is None
    assert novel.cover_url is None
    assert novel.published_at is None
    assert novel.genres == []
    assert novel.status is NovelStatus.UNKNOWN


def test_missing_title_means_the_structure_changed():
    with pytest.raises(ParseError, match="tên truyện"):
        parser.parse_novel("<html><body><h1>Giao diện mới</h1></body></html>", NOVEL_URL)


def test_invalid_release_date_is_ignored(novel_html):
    html = novel_html.replace("2026-09-05T15:09:24+07:00", "hôm qua")

    assert parser.parse_novel(html, NOVEL_URL).published_at is None


@pytest.mark.parametrize("suffix", ["", "trang-3/", "chuong-12/", "trang-3/#list-chapter"])
def test_any_url_of_a_novel_maps_to_its_root(suffix):
    assert novel_root(NOVEL_URL + suffix) == NOVEL_URL


def test_site_home_is_not_a_novel():
    with pytest.raises(CrawlerError, match="không trỏ tới truyện"):
        novel_root("https://truyenfull.live/")


# --- Mục lục ----------------------------------------------------------------------------------


def test_chapter_list_first_page(novel_html):
    page = parser.parse_chapter_list(novel_html, NOVEL_URL)

    # Chỉ lấy trong #list-chapter: khối "Các chương mới nhất" (chương 5) không được lẫn vào.
    assert [(c.slug, c.title) for c in page.chapters] == [
        ("chuong-1", "Chương 1: Mở đầu"),
        ("chuong-2", "Chương 2: Gặp gỡ"),
        ("chuong-3", "Chương 3"),
    ]
    assert page.chapters[0].url == NOVEL_URL + "chuong-1/"
    assert page.next_url == NOVEL_URL + "trang-2/"  # đã bỏ phần #list-chapter


def test_chapter_list_last_page_has_no_next(load_fixture):
    html = load_fixture("truyenfull/novel_last_page.html")

    page = parser.parse_chapter_list(html, NOVEL_URL + "trang-2/")

    assert [c.slug for c in page.chapters] == ["chuong-4", "chuong-5"]
    assert page.next_url is None


def test_relative_links_are_resolved_against_the_page_url():
    html = (
        '<div id="list-chapter"><ul class="list-chapter">'
        '<li><a href="/truyen-mau/chuong-7/">Chương 7</a></li></ul>'
        '<ul class="pagination"><li><a href="/truyen-mau/trang-2/">2</a></li></ul></div>'
    )

    page = parser.parse_chapter_list(html, NOVEL_URL)

    assert page.chapters[0].url == NOVEL_URL + "chuong-7/"
    assert page.next_url == NOVEL_URL + "trang-2/"


def test_novel_without_chapters_gives_an_empty_list():
    page = parser.parse_chapter_list('<div id="list-chapter"></div>', NOVEL_URL)

    assert page.chapters == []
    assert page.next_url is None


def test_missing_chapter_list_container_is_an_error():
    with pytest.raises(ParseError, match="mục lục"):
        parser.parse_chapter_list("<html><body></body></html>", NOVEL_URL)


# --- Nội dung chương --------------------------------------------------------------------------


def test_parse_chapter_keeps_paragraphs_and_drops_junk(chapter_html):
    chapter = parser.parse_chapter(chapter_html, NOVEL_URL + "chuong-1/")

    assert chapter.title == "Chương 1"
    assert chapter.paragraphs == [
        "Chương 1: Khởi đầu",
        "Trời tờ mờ sáng, sương còn giăng kín lối.",
        "- Ngươi là ai? - Lão giả cất giọng hỏi.",
        'Hắn đáp: "Ta chỉ là kẻ qua đường & lữ khách."',
        "Hết chương.",
    ]


def test_page_without_chapter_body_is_an_error():
    with pytest.raises(ParseError, match="nội dung chương"):
        parser.parse_chapter("<html><body>Just a moment...</body></html>", NOVEL_URL + "chuong-1/")


def test_chapter_with_only_junk_is_an_error():
    html = (
        '<div id="chapter-c"><div id="ads-chapter-top"></div><img src="trang-1.jpg">'
        '<p style="display:none">truyenfull</p></div>'
    )

    with pytest.raises(ParseError, match="rỗng"):
        parser.parse_chapter(html, NOVEL_URL + "chuong-1/")
