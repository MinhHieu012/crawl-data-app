"""CLI đầu-cuối: chạy `main()` thật trong thư mục tạm, chỉ thay tầng mạng bằng website giả."""

import json
import logging
import os
import sqlite3
import subprocess
import sys
import zipfile
from contextlib import closing
from xml.etree import ElementTree

import httpx
import pytest

from crawl_data_app import aviation, banks, cli, provinces
from crawl_data_app.config.settings import get_settings
from crawl_data_app.core.http_client import HttpClient


@pytest.fixture
def run(tmp_path, monkeypatch, site, clock, capsys):
    """Gọi CLI với database/log mặc định nằm trong thư mục tạm; trả về (mã thoát, stdout)."""
    monkeypatch.chdir(tmp_path)
    for name in list(os.environ):
        if name.startswith(("HTTP_", "CRAWLER_", "DATABASE_", "LOG_")):
            monkeypatch.delenv(name)
    monkeypatch.setenv("COLUMNS", "400")  # bảng Rich không bị ngắt dòng → dễ so khớp output
    monkeypatch.setattr(
        cli,
        "HttpClient",
        lambda settings: HttpClient(
            settings, transport=httpx.MockTransport(site.handler), sleep=clock.sleep
        ),
    )
    get_settings.cache_clear()

    def _run(*args: str) -> tuple[int, str]:
        code = cli.main(list(args))
        return code, capsys.readouterr().out

    yield _run
    get_settings.cache_clear()
    root = logging.getLogger()
    for handler in root.handlers[:]:  # nhả file log để Windows xoá được thư mục tạm
        root.removeHandler(handler)
        handler.close()


def server_error(request: httpx.Request) -> httpx.Response:
    return httpx.Response(500, text="lỗi máy chủ")


def test_sources_lists_supported_sites(run):
    code, out = run("sources")

    assert code == 0
    assert "truyenfull" in out
    assert "truyenfull.live" in out


def test_init_db_creates_the_schema_at_the_default_location(run, tmp_path):
    code, out = run("init-db")

    assert code == 0
    assert "sqlite:///data/crawl-data-app.db" in out
    with closing(sqlite3.connect(tmp_path / "data" / "crawl-data-app.db")) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master")}
    assert {"sources", "novels", "chapters", "crawl_runs", "alembic_version"} <= tables


def test_status_works_on_a_fresh_database(run):
    code, out = run("status")

    assert code == 0
    assert "Truyện đã lưu" in out


def test_crawl_all_chapters_then_status(run, site):
    root = site.add_novel("truyen-cli", chapters=4, title="Truyện Qua CLI")

    code, out = run("crawl", "--url", root, "--all-chapters")

    assert code == 0
    assert "Truyện Qua CLI" in out
    assert "completed" in out

    code, out = run("status")

    assert code == 0
    assert "Truyện Qua CLI" in out
    assert "4/4" in out
    assert "mọi chương" in out


def test_crawl_without_chapter_options_only_saves_info(run, site):
    root = site.add_novel("truyen-cli", chapters=4)

    code, _ = run("crawl", "--url", root)

    assert code == 0
    assert site.requests_to("chuong-") == 0
    _, out = run("status")
    assert "0/?" in out
    assert "chỉ thông tin" in out


def test_failed_chapter_is_listed_and_resume_finishes_the_same_range(run, site):
    root = site.add_novel("truyen-cli", chapters=5)
    site.pages[f"{root}chuong-2/"] = server_error

    code, out = run("crawl", "--url", root, "--from-chapter", "1", "--to-chapter", "3")

    assert code == 1
    assert "partial" in out

    _, out = run("status", "--errors")

    assert f"{root}chuong-2/" in out
    assert "HTTP 500" in out
    assert "chương 1–3" in out

    site.set_chapter(root, 2, "Đã ổn.")
    code, out = run("resume")

    assert code == 0
    assert "completed" in out
    assert site.requests_to("chuong-4/") == 0  # vẫn chỉ trong khoảng 1–3

    code, out = run("resume")

    assert code == 0
    assert "Không có lần crawl nào dang dở" in out


def test_resume_by_url_repeats_that_novels_last_request(run, site):
    root = site.add_novel("truyen-cli", chapters=3)
    run("crawl", "--url", root, "--to-chapter", "2")
    site.add_novel("truyen-cli", chapters=6)  # website ra thêm chương ngoài khoảng đã yêu cầu

    code, out = run("resume", "--url", root)

    assert code == 0
    assert "completed" in out
    assert site.requests_to("chuong-3/") == 0


def test_resume_accepts_any_url_of_the_novel(run, site):
    root = site.add_novel("truyen-cli", chapters=3)
    site.pages[f"{root}chuong-2/"] = server_error
    run("crawl", "--url", root, "--all-chapters")
    site.set_chapter(root, 2, "Đã ổn.")

    code, out = run("resume", "--url", f"{root}chuong-2/")  # URL chương thay vì URL truyện

    assert code == 0
    assert "completed" in out
    assert site.hits[f"{root}chuong-1/"] == 1


def test_url_variants_of_one_novel_are_crawled_once(run, site):
    root = site.add_novel("truyen-cli", chapters=2)

    code, _ = run("crawl", "--url", root, "--url", f"{root}chuong-1/", "--url", root.rstrip("/"))

    assert code == 0
    assert site.hits[root] == 1


def test_resume_for_a_never_crawled_url_is_an_error(run, capsys):
    with pytest.raises(SystemExit) as stopped:
        run("resume", "--url", "https://truyenfull.live/chua-tung-crawl/")

    assert stopped.value.code == 2
    assert "chưa có lần crawl nào" in capsys.readouterr().err


def test_crawl_needs_a_url(run):
    with pytest.raises(SystemExit) as stopped:
        run("crawl", "--all-chapters")

    assert stopped.value.code == 2


def test_backwards_chapter_range_is_rejected(run, site, capsys):
    root = site.add_novel("truyen-cli", chapters=5)

    with pytest.raises(SystemExit) as stopped:
        run("crawl", "--url", root, "--from-chapter", "5", "--to-chapter", "2")

    assert stopped.value.code == 2
    assert "from_chapter" in capsys.readouterr().err
    assert not site.hits


def test_url_file_supports_comments_blank_lines_and_duplicates(run, site, tmp_path):
    first = site.add_novel("truyen-a", chapters=1, title="Truyện A")
    second = site.add_novel("truyen-b", chapters=1, title="Truyện B")
    (tmp_path / "urls.txt").write_text(
        f"# danh sách cần crawl\n{first}\n\n{second}\n{first}\n", encoding="utf-8"
    )

    code, _ = run("crawl", "--url-file", "urls.txt")

    assert code == 0
    assert site.hits[first] == site.hits[second] == 1
    _, out = run("status")
    assert "Truyện A" in out
    assert "Truyện B" in out


def test_blocked_site_stops_the_whole_batch(run, site):
    first = site.add_novel("truyen-a", chapters=1)
    second = site.add_novel("truyen-b", chapters=1)
    site.pages[first] = lambda request: httpx.Response(403, text="Forbidden")

    code, out = run("crawl", "--url", first, "--url", second, "--all-chapters")

    assert code == 1
    assert "failed" in out
    assert site.hits[second] == 0


def test_invalid_configuration_is_reported_clearly(run, monkeypatch, capsys):
    monkeypatch.setenv("HTTP_REQUEST_DELAY", "0")

    with pytest.raises(SystemExit) as stopped:
        run("status")

    assert stopped.value.code == 2
    assert "request_delay" in capsys.readouterr().err


def test_log_file_is_json_lines_carrying_the_failing_url(run, site, tmp_path):
    root = site.add_novel("truyen-cli", chapters=2)
    site.pages[f"{root}chuong-2/"] = server_error

    run("crawl", "--url", root, "--all-chapters")

    lines = (tmp_path / "logs" / "crawler.log").read_text(encoding="utf-8").splitlines()
    entries = [json.loads(line) for line in lines]
    assert {"time", "level", "logger", "message"} <= entries[0].keys()
    assert any(
        entry["level"] == "WARNING" and entry.get("url") == f"{root}chuong-2/" for entry in entries
    )


def test_export_writes_one_txt_per_novel_with_downloaded_chapters_in_order(run, site, tmp_path):
    root = site.add_novel("truyen-xuat", chapters=3, title="Truyện Xuất File")
    site.set_chapter(root, 2, "Chương 2: Tên chương 2 - bản đầy đủ<br><br>A &lt; B &amp; C.")
    empty = site.add_novel("truyen-rong", chapters=1, title="Chưa Tải Chương")
    run("crawl", "--url", root, "--to-chapter", "2")
    run("crawl", "--url", empty)

    code, out = run("export")

    assert code == 0
    assert "Đã xuất 2 chương" in out
    assert "Bỏ qua" in out
    assert not (tmp_path / "exports" / "truyen-rong.txt").exists()
    text = (tmp_path / "exports" / "truyen-xuat.txt").read_text(encoding="utf-8")
    assert text == (
        f"Truyện Xuất File\nTác giả: Tác Giả Mẫu\nNguồn: {root}\n\n\n"
        "Chương 1: Tên chương 1\n\nMở đầu chương 1.\n\nKết thúc chương 1.\n\n\n"
        "Chương 2: Tên chương 2 - bản đầy đủ\n\nA < B & C.\n"  # không lặp tiêu đề, đã bỏ escape
    )


def test_export_selected_novel_to_custom_folder_and_markdown_content(
    run, site, tmp_path, monkeypatch
):
    monkeypatch.setenv("CRAWLER_CONTENT_FORMAT", "markdown")
    root = site.add_novel("truyen-md", chapters=1)
    site.set_chapter(root, 1, "- Chào *ngươi*.")
    run("crawl", "--url", root, "--all-chapters")

    assert run("export", "--novel-id", "99")[0] == 1
    code, _ = run("export", "--novel-id", "1", "--out", "ra")

    assert code == 0
    text = (tmp_path / "ra" / "truyen-md.txt").read_text(encoding="utf-8")
    assert text.endswith("Chương 1: Tên chương 1\n\n- Chào *ngươi*.\n")


def test_export_epub_is_a_well_formed_book_with_chapters_in_order(run, site, tmp_path):
    root = site.add_novel("truyen-epub", chapters=3, title="Truyện Epub & Bạn")
    site.set_chapter(root, 2, 'Chương 2: Tên chương 2 - đủ<br><br>A &lt; B &amp; "C".')
    run("crawl", "--url", root, "--all-chapters")

    code, out = run("export", "--format", "epub")

    assert code == 0
    assert "Đã xuất 3 chương" in out
    opf_ns = {"o": "http://www.idpf.org/2007/opf", "dc": "http://purl.org/dc/elements/1.1/"}
    with zipfile.ZipFile(tmp_path / "exports" / "truyen-epub.epub") as book:
        first = book.infolist()[0]
        assert (first.filename, first.compress_type) == ("mimetype", zipfile.ZIP_STORED)
        assert book.read("mimetype") == b"application/epub+zip"
        # Mọi file XML/XHTML phải parse được — sai một ký tự escape là máy đọc từ chối cả cuốn.
        trees = {
            name: ElementTree.fromstring(book.read(name))
            for name in book.namelist()
            if name.endswith((".xml", ".opf", ".xhtml"))
        }
    opf = trees["OEBPS/content.opf"]
    assert opf.findtext(".//dc:title", namespaces=opf_ns) == "Truyện Epub & Bạn"
    assert opf.findtext(".//dc:creator", namespaces=opf_ns) == "Tác Giả Mẫu"
    hrefs = {item.get("id"): item.get("href") for item in opf.iterfind(".//o:item", opf_ns)}
    spine = [hrefs[ref.get("idref")] for ref in opf.iterfind(".//o:itemref", opf_ns)]
    assert spine == ["info.xhtml", "c1.xhtml", "c2.xhtml", "c3.xhtml"]
    assert all(f"OEBPS/{href}" in trees or href == "style.css" for href in hrefs.values())
    chapter_two = "".join(trees["OEBPS/c2.xhtml"].itertext())
    assert "Chương 2: Tên chương 2 - đủ" in chapter_two
    assert 'A < B & "C".' in chapter_two
    assert chapter_two.count("Chương 2") == 2  # <title> + <h2>, không lặp trong thân bài
    toc = "".join(trees["OEBPS/nav.xhtml"].itertext())
    assert toc.index("Chương 1: Tên chương 1") < toc.index("Chương 2") < toc.index("Chương 3")


def test_export_json_keeps_metadata_and_real_chapter_numbers(run, site, tmp_path):
    root = site.add_novel("truyen-json", chapters=5, title="Truyện Json", status="Full")
    run("crawl", "--url", root, "--from-chapter", "3", "--to-chapter", "4")

    code, _ = run("export", "--format", "json")

    assert code == 0
    raw = (tmp_path / "exports" / "truyen-json.json").read_text(encoding="utf-8")
    assert "Truyện Json" in raw  # tiếng Việt lưu nguyên dạng, không phải \uXXXX
    data = json.loads(raw)
    assert data["chapters"] == [
        {
            "number": number,
            "title": f"Chương {number}: Tên chương {number}",
            "paragraphs": [f"Mở đầu chương {number}.", f"Kết thúc chương {number}."],
        }
        for number in (3, 4)
    ]
    del data["chapters"]
    assert data == {
        "title": "Truyện Json",
        "author": "Tác Giả Mẫu",
        "genres": ["Tiên Hiệp", "Huyền Huyễn"],
        "description": "Giới thiệu Truyện Json.",
        "status": "completed",
        "cover_url": "https://img.example.test/bia.jpg",
        "url": root,
        "total_chapters": 5,
    }


def test_export_chapter_range_goes_to_its_own_file_named_after_the_chapters_in_it(
    run, site, tmp_path
):
    root = site.add_novel("truyen-khoang", chapters=5)
    run("crawl", "--url", root, "--to-chapter", "4")

    code, out = run("export", "--format", "json", "--from-chapter", "2", "--to-chapter", "9")

    assert code == 0
    assert "Đã xuất 3 chương" in out
    exports = tmp_path / "exports"
    # Tên file theo chương thật sự có (2–4), không theo số người dùng gõ (2–9).
    data = json.loads((exports / "truyen-khoang-c2-4.json").read_text(encoding="utf-8"))
    assert [chapter["number"] for chapter in data["chapters"]] == [2, 3, 4]
    assert not (exports / "truyen-khoang.json").exists()

    code, out = run("export", "--from-chapter", "5")  # chương 5 chưa tải

    assert code == 1
    assert "trong khoảng này" in out


def test_serve_starts_the_web_app_on_localhost_only_by_default(run, monkeypatch):
    started = []
    monkeypatch.setattr("uvicorn.run", lambda app, **options: started.append((app, options)))

    code, _ = run("serve", "--port", "8123")

    assert code == 0
    app, options = started[0]
    assert (options["host"], options["port"]) == ("127.0.0.1", 8123)  # API không có đăng nhập
    assert "/api/crawl/jobs" in app.openapi()["paths"]  # tài liệu API ở /docs cũng dựng được


def test_module_entry_point_runs_in_a_real_process(tmp_path):
    done = subprocess.run(
        [sys.executable, "-m", "crawl_data_app", "sources"],
        cwd=tmp_path,
        capture_output=True,
        timeout=120,
        check=False,
    )

    assert done.returncode == 0, done.stderr.decode("utf-8", "replace")
    assert "truyenfull" in done.stdout.decode("utf-8")


# --- Hàng không ------------------------------------------------------------------------------------


def aviation_runs(tmp_path) -> list[tuple]:
    with closing(sqlite3.connect(tmp_path / "data" / "crawl-data-app.db")) as connection:
        return connection.execute(
            "SELECT crawler, status, chapters_ok, result, error FROM crawl_runs ORDER BY id"
        ).fetchall()


def test_aviation_syncs_every_source_by_default(run, sources, tmp_path):
    code, out = run("aviation")

    assert code == 0
    assert "Kết quả đồng bộ hàng không" in out
    # Mỗi nguồn một dòng: tên, job, kết quả, số sân bay / hãng bay / thành phố / quốc gia.
    assert [line.split()[1:-1] for line in out.splitlines() if "completed" in line] == [
        ["world", "│", "#1", "│", "completed", "│", "5", "│", "2", "│", "3", "│", "3", "│"],
        ["vna", "│", "#2", "│", "completed", "│", "4", "│", "2", "│", "3", "│", "2", "│"],
    ]
    runs = aviation_runs(tmp_path)
    assert [row[:3] for row in runs] == [
        ("aviation:world", "completed", 3),
        ("aviation:vna", "completed", 3),
    ]
    assert json.loads(runs[1][3]) == {"country": 2, "city": 3, "airport": 4, "airline": 2}
    with closing(sqlite3.connect(tmp_path / "data" / "crawl-data-app.db")) as connection:
        stored = connection.execute(
            "SELECT source, count(*) FROM aviation_records GROUP BY source ORDER BY source"
        ).fetchall()
    assert stored == [("vna", 11), ("world", 13)]


def test_aviation_source_option_limits_the_sync(run, sources, tmp_path):
    code, out = run("aviation", "--source", "vna", "--source", "vna")

    assert code == 0
    assert "world" not in out
    assert [row[0] for row in aviation_runs(tmp_path)] == [
        "aviation:vna"
    ]  # lặp tên cũng chỉ chạy một lần
    assert sources.requests_to("vietnamairlines.com") == 4  # robots.txt + ba file
    assert sources.requests_to("ourairports") == 0


def test_aviation_failure_is_reported_recorded_and_keeps_old_data(run, sources, tmp_path):
    run("aviation", "--source", "world")
    sources.pages[aviation.WORLD_AIRPORTS_URL] = lambda _request: httpx.Response(
        200, text="id,ten\n1,Noi Bai\n"
    )

    code, out = run("aviation")

    assert code == 1  # một nguồn hỏng → mã thoát khác 0, nguồn còn lại vẫn chạy
    assert "failed" in out and "không còn khớp cấu trúc" in out
    runs = aviation_runs(tmp_path)
    assert [row[:2] for row in runs] == [
        ("aviation:world", "completed"),
        ("aviation:world", "failed"),
        ("aviation:vna", "completed"),
    ]
    with closing(sqlite3.connect(tmp_path / "data" / "crawl-data-app.db")) as connection:
        world = connection.execute(
            "SELECT count(*) FROM aviation_records WHERE source = 'world'"
        ).fetchone()
    assert world == (13,)  # dữ liệu của lần đồng bộ trước còn nguyên


def test_provinces_syncs_the_catalogue_as_one_job(run, sources, tmp_path):
    code, out = run("provinces")

    assert (code, out.strip()) == (0, "Đã đồng bộ 3 tỉnh thành, 4 phường/xã (job #1).")
    runs = aviation_runs(tmp_path)
    assert [row[:3] for row in runs] == [("provinces", "completed", 1)]
    assert json.loads(runs[0][3]) == {"province": 3, "ward": 4}

    sources.pages[provinces.DATA_URL] = lambda _request: httpx.Response(200, text="{}")
    code, out = run("provinces")

    assert code == 1
    assert "Đồng bộ tỉnh thành không xong (job #2)" in out
    with closing(sqlite3.connect(tmp_path / "data" / "crawl-data-app.db")) as connection:
        stored = connection.execute(
            "SELECT (SELECT count(*) FROM vn_provinces), (SELECT count(*) FROM vn_wards)"
        ).fetchone()
    assert stored == (3, 4)  # dữ liệu cũ còn nguyên


def test_aviation_rejects_unknown_source(run):
    with pytest.raises(SystemExit) as exit_info:
        run("aviation", "--source", "mars")

    assert exit_info.value.code == 2


def test_aviation_jobs_do_not_confuse_novel_commands(run, sources):
    run("aviation", "--source", "vna")

    code, out = run("resume")
    assert (code, "Không có lần crawl nào dang dở." in out) == (0, True)
    code, out = run("status")
    assert code == 0
    assert "vietnamairlines" not in out  # bảng lịch sử của `status` chỉ nói về truyện


# --- Đổi tên file database mặc định ----------------------------------------------------------------


def test_database_from_before_the_rename_is_adopted_not_replaced_by_an_empty_one(run, tmp_path):
    old, new = tmp_path / "data" / "novels.db", tmp_path / "data" / "crawl-data-app.db"
    old.parent.mkdir()
    with closing(sqlite3.connect(old)) as connection:
        connection.execute("CREATE TABLE du_lieu_cu (id INTEGER)")

    code, _ = run("init-db")

    assert code == 0
    assert (old.exists(), new.exists()) == (False, True)
    with closing(sqlite3.connect(new)) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master")}
    assert {"du_lieu_cu", "crawl_runs"} <= tables  # dữ liệu cũ còn đó, schema được nâng lên


def test_existing_new_database_and_custom_url_leave_the_old_file_alone(run, tmp_path, monkeypatch):
    old, new = tmp_path / "data" / "novels.db", tmp_path / "data" / "crawl-data-app.db"
    run("init-db")  # database tên mới đã có dữ liệu thật (schema)
    old.write_bytes(b"file cu")
    in_use = new.read_bytes()

    run("init-db")
    assert old.exists()  # đã có database tên mới: không ghi đè lên nó
    assert new.read_bytes() == in_use

    new.unlink()
    monkeypatch.setenv("DATABASE_URL", "sqlite:///data/rieng.db")
    get_settings.cache_clear()
    run("init-db")
    assert old.exists()  # tự đặt DATABASE_URL: không đụng tới file nào khác
    assert not new.exists()


def test_an_empty_file_with_the_new_name_does_not_hide_the_old_database(run, tmp_path):
    """Một công cụ SQLite mở thử file tên mới sẽ để lại file 0 byte — đó chưa phải database."""
    old, new = tmp_path / "data" / "novels.db", tmp_path / "data" / "crawl-data-app.db"
    old.parent.mkdir()
    with closing(sqlite3.connect(old)) as connection:
        connection.execute("CREATE TABLE du_lieu_cu (id INTEGER)")
    new.write_bytes(b"")

    run("init-db")

    assert not old.exists()
    with closing(sqlite3.connect(new)) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master")}
    assert "du_lieu_cu" in tables


def test_banks_syncs_the_catalogue_as_one_job(run, sources, tmp_path):
    code, out = run("banks")

    assert (code, out.strip()) == (0, "Đã đồng bộ 3 ngân hàng (job #1).")
    runs = aviation_runs(tmp_path)
    assert [row[:3] for row in runs] == [("banks", "completed", 1)]
    assert json.loads(runs[0][3]) == {"bank": 3}

    sources.pages[banks.DATA_URL] = lambda _request: httpx.Response(200, text="{}")
    code, out = run("banks")

    assert code == 1
    assert "Đồng bộ ngân hàng không xong (job #2)" in out
    with closing(sqlite3.connect(tmp_path / "data" / "crawl-data-app.db")) as connection:
        stored = connection.execute("SELECT count(*) FROM vn_banks").fetchone()
    assert stored == (3,)  # dữ liệu cũ còn nguyên
