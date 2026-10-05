"""Giao diện chung: mọi crawler đã đăng ký phải tuân thủ, và luồng mặc định của BaseCrawler phải an toàn."""

import pytest

from crawl_data_app.core.base_crawler import BaseCrawler, BaseParser
from crawl_data_app.core.exceptions import ParseError, UnsupportedSiteError
from crawl_data_app.core.models import ChapterContent, ChapterListPage, ChapterRef, NovelInfo
from crawl_data_app.crawlers import CRAWLERS, crawler_class_for
from crawl_data_app.crawlers.truyenfull.crawler import TruyenFullCrawler


@pytest.mark.parametrize("crawler", CRAWLERS, ids=lambda crawler: crawler.name)
def test_registered_crawler_follows_the_interface(crawler):
    assert issubclass(crawler, BaseCrawler)
    assert crawler.name == crawler.name.lower().strip() != ""
    assert crawler.domains
    assert isinstance(crawler.parser, BaseParser)
    for domain in crawler.domains:
        url = f"https://{domain}/mot-truyen/"
        assert crawler.matches(url)
        assert crawler_class_for(f"https://www.{domain}/mot-truyen/") is crawler
        assert crawler.matches(crawler.novel_url(url))
        assert crawler.novel_url(crawler.novel_url(url)) == crawler.novel_url(url)  # ổn định


def test_crawler_names_are_unique():
    names = [crawler.name for crawler in CRAWLERS]

    assert len(names) == len(set(names))


def test_unknown_site_is_rejected_and_lists_supported_sources():
    with pytest.raises(UnsupportedSiteError, match="truyenfull"):
        crawler_class_for("https://example.com/truyen/abc/")


def test_crawler_missing_required_declarations_cannot_be_defined():
    with pytest.raises(TypeError, match="parser"):

        class Incomplete(BaseCrawler):
            name = "thieu-parser"
            domains = ("thieu.test",)


def test_parser_must_implement_every_method():
    class HalfParser(BaseParser):
        def parse_novel(self, html: str, url: str) -> NovelInfo:
            raise NotImplementedError

    with pytest.raises(TypeError):
        HalfParser()


def test_truyenfull_follows_domain_changes_but_not_lookalikes():
    assert TruyenFullCrawler.matches("https://truyenfull.xyz/mot-truyen/")
    assert not TruyenFullCrawler.matches("https://truyenfull.evil.com/mot-truyen/")
    assert not TruyenFullCrawler.matches("https://nottruyenfull.vn/mot-truyen/")
    assert not TruyenFullCrawler.matches("khong-phai-url")


# --- Luồng mặc định của BaseCrawler với một parser tối giản ---------------------------------------


class TinyParser(BaseParser):
    """Mỗi trang là 'tên|chương,chương|trang kế' — đủ để thử luồng tải mà không cần HTML."""

    def parse_novel(self, html: str, url: str) -> NovelInfo:
        return NovelInfo(slug="tiny", url=url, title=html.split("|")[0])

    def parse_chapter_list(self, html: str, url: str) -> ChapterListPage:
        _, chapters, next_url = html.split("|")
        refs = [ChapterRef(slug=c, url=f"{url}{c}", title=c) for c in chapters.split(",") if c]
        return ChapterListPage(chapters=refs, next_url=next_url or None)

    def parse_chapter(self, html: str, url: str) -> ChapterContent:
        return ChapterContent(paragraphs=[line for line in html.split("\n") if line])


class TinyCrawler(BaseCrawler):
    name = "tiny"
    domains = ("tiny.test",)
    parser = TinyParser()


@pytest.mark.anyio
async def test_default_flow_paginates_dedupes_and_survives_pagination_loops(site, make_client):
    site.pages["https://tiny.test/a/"] = "Truyện Tí Hon|c1,c2|https://tiny.test/a/p2"
    site.pages["https://tiny.test/a/p2"] = "Truyện Tí Hon|c2,c3|https://tiny.test/a/"  # quay vòng
    crawler = TinyCrawler(make_client())

    novel = await crawler.fetch_novel("https://tiny.test/a/")
    chapters = await crawler.fetch_chapter_list(novel)

    assert novel.title == "Truyện Tí Hon"
    assert [c.slug for c in chapters] == ["c1", "c2", "c3"]
    assert site.hits["https://tiny.test/a/"] == 1  # trang truyện không bị tải lại cho mục lục
    assert site.hits["https://tiny.test/a/p2"] == 1


@pytest.mark.anyio
async def test_invalid_parser_output_is_reported_as_parse_error(site, make_client):
    site.pages["https://tiny.test/a/"] = "|c1|"  # tên truyện rỗng → vi phạm model
    site.pages["https://tiny.test/a/c1"] = "\n\n"  # chương không có đoạn nào

    crawler = TinyCrawler(make_client())

    with pytest.raises(ParseError, match="không hợp lệ"):
        await crawler.fetch_novel("https://tiny.test/a/")
    with pytest.raises(ParseError, match="không hợp lệ"):
        await crawler.fetch_chapter(ChapterRef(slug="c1", url="https://tiny.test/a/c1", title="c1"))
