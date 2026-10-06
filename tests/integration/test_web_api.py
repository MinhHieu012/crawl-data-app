"""API web đầu-cuối: FastAPI + JobManager + SQLite thật; chỉ tầng mạng được thay bằng website giả."""

import asyncio

import httpx
import pytest

from crawl_data_app.core.models import ChapterRef, NovelInfo, NovelStatus
from crawl_data_app.web.app import create_app

pytestmark = pytest.mark.anyio

ROOT = "https://truyenfull.live/truyen-a/"


def server_error(request: httpx.Request) -> httpx.Response:
    return httpx.Response(500, text="lỗi máy chủ")


async def start(api: httpx.AsyncClient, url: str = ROOT, **options: object) -> dict:
    response = await api.post("/api/crawl/jobs", json={"url": url, **options})
    assert response.status_code == 201, response.text
    return response.json()


async def wait_for(api: httpx.AsyncClient, job_id: int, reached) -> dict:
    """Hỏi lại job (mỗi lần hỏi là một lần nhường event loop cho job chạy) tới khi `reached(job)`."""
    for _ in range(500):
        job = (await api.get(f"/api/crawl/jobs/{job_id}")).json()
        if reached(job):
            return job
        await asyncio.sleep(0)
    raise AssertionError(f"job #{job_id} không tới được trạng thái mong đợi: {job}")


async def finished(api: httpx.AsyncClient, job_id: int) -> dict:
    return await wait_for(api, job_id, lambda job: job["status"] != "running")


def seed(repo, slug: str, title: str, *, chapters: int = 0, done: int = 0, **info: object) -> int:
    """Đưa thẳng một truyện vào database (không crawl): `done` chương đầu đã có nội dung."""
    url = f"https://truyenfull.live/{slug}/"
    novel_id = repo.upsert_novel("truyenfull", NovelInfo(slug=slug, url=url, title=title, **info))
    refs = [
        ChapterRef(slug=f"chuong-{n}", url=f"{url}chuong-{n}/", title=f"Chương {n}")
        for n in range(1, chapters + 1)
    ]
    repo.sync_chapters(novel_id, refs)
    for row in repo.chapters_to_fetch(novel_id, None, None)[0][:done]:
        content = f"<p>Chương {row.number}: Mở đầu</p>\n<p>Nội dung {row.number}.</p>"
        repo.save_chapter(row.id, content, "html", f"hash-{row.number}")
    return novel_id


# --- Job crawl ---------------------------------------------------------------------------------


async def test_job_runs_in_background_and_reports_progress_until_done(api, site, gate):
    site.add_novel("truyen-a", chapters=5, title="Truyện A")
    # Các lần chờ: trang truyện, trang 2 của mục lục, chương 1, chương 2 → đứng lại trước chương 3.
    gate.hold_at(5)

    job = await start(api, ROOT + "chuong-2/")  # URL chương cũng được: quy về trang truyện

    assert (job["url"], job["status"], job["active"]) == (ROOT, "running", True)
    midway = await wait_for(api, job["id"], lambda job: job["chapters_ok"] == 2)
    assert (midway["status"], midway["novel_title"]) == ("running", "Truyện A")
    assert (midway["chapters_total"], midway["chapters_failed"]) == (5, 0)
    assert midway["last_chapter"] == "Chương 2: Tên chương 2"

    gate.release()
    done = await finished(api, job["id"])

    assert (done["status"], done["active"], done["error"]) == ("completed", False, None)
    assert (done["chapters_ok"], done["chapters_total"], done["last_chapter"]) == (5, 5, None)
    assert done["finished_at"].endswith("Z")  # giờ UTC kèm múi giờ → trình duyệt đổi sang giờ máy
    listed = (await api.get("/api/crawl/jobs", params={"status": "completed"})).json()
    assert [item["id"] for item in listed["items"]] == [job["id"]]


async def test_crawled_novel_shows_up_in_stats_lists_and_reader(api, site):
    site.add_novel("truyen-a", chapters=4, title="Truyện A", status="Full")
    job = await finished(api, (await start(api, from_chapter=1, to_chapter=3))["id"])

    stats = (await api.get("/api/stats")).json()
    assert (stats["novels"], stats["chapters"]) == (1, {"pending": 1, "done": 3, "failed": 0})
    assert (stats["jobs"]["completed"], stats["jobs"]["running"]) == (1, 0)

    novels = (await api.get("/api/novels")).json()
    assert novels["total"] == 1
    novel = novels["items"][0]
    assert (novel["id"], novel["title"], novel["source"]) == (
        job["novel_id"],
        "Truyện A",
        "truyenfull",
    )
    assert (novel["status"], novel["genres"]) == ("completed", ["Tiên Hiệp", "Huyền Huyễn"])
    assert (novel["total_chapters"], novel["chapters_done"], novel["chapters_pending"]) == (4, 3, 1)

    chapter = (await api.get(f"/api/novels/{novel['id']}/chapters/1")).json()
    assert chapter["status"] == "done"
    assert chapter["paragraphs"] == ["Mở đầu chương 1.", "Kết thúc chương 1."]
    history = (await api.get("/api/crawl/jobs", params={"novel_id": novel["id"]})).json()
    assert [(item["from_chapter"], item["to_chapter"]) for item in history["items"]] == [(1, 3)]


async def test_every_log_line_of_a_job_carries_its_id(api, site):
    site.add_novel("truyen-a", chapters=1)
    site.add_novel("truyen-b", chapters=1)
    first = await finished(api, (await start(api))["id"])
    await finished(api, (await start(api, "https://truyenfull.live/truyen-b/"))["id"])

    logs = (await api.get("/api/logs", params={"job_id": first["id"]})).json()

    assert {entry["run_id"] for entry in logs} == {first["id"]}
    messages = [entry["message"] for entry in logs]  # mới nhất trước
    assert messages[0].startswith("Kết thúc (completed)")
    assert messages[-1] == f"Bắt đầu crawl {ROOT}"
    assert all("truyen-b" not in message for message in messages)


async def test_running_novel_rejects_a_second_job_and_can_be_paused_then_resumed(api, site, gate):
    site.add_novel("truyen-a", chapters=2)
    gate.hold_at(1)  # đứng lại ngay trước request tải trang truyện
    job = await start(api)

    # Cùng truyện, chỉ khác tên miền và trỏ vào một chương.
    duplicate = await api.post(
        "/api/crawl/jobs", json={"url": "https://truyenfull.vn/truyen-a/chuong-1/"}
    )
    assert duplicate.status_code == 409
    assert (duplicate.json()["code"], duplicate.json()["job_id"]) == ("duplicate_job", job["id"])

    paused = await api.post(f"/api/crawl/jobs/{job['id']}/pause")
    assert (paused.json()["status"], paused.json()["active"]) == ("interrupted", False)
    again = await api.post(f"/api/crawl/jobs/{job['id']}/pause")
    assert (again.status_code, again.json()["code"]) == (409, "job_not_running")

    gate.release()
    resumed = await api.post(f"/api/crawl/jobs/{job['id']}/resume")
    assert resumed.status_code == 201
    assert resumed.json()["id"] != job["id"]  # mỗi lần chạy là một dòng lịch sử riêng
    done = await finished(api, resumed.json()["id"])
    assert (done["status"], done["chapters_ok"]) == ("completed", 2)


async def test_cancelled_job_is_not_picked_up_by_resume(api, site, gate, repo):
    site.add_novel("truyen-a", chapters=2)
    gate.hold_at(1)
    job = await start(api)

    cancelled = await api.post(f"/api/crawl/jobs/{job['id']}/cancel")

    assert (cancelled.json()["status"], cancelled.json()["active"]) == ("cancelled", False)
    assert repo.unfinished_requests() == []  # `crawl-data-app resume` không tự chạy lại job đã huỷ
    again = await api.post(f"/api/crawl/jobs/{job['id']}/cancel")
    assert (again.status_code, again.json()["code"]) == (409, "job_not_running")


async def test_paused_job_can_be_cancelled_and_a_running_one_cannot_be_rerun(api, site, gate):
    site.add_novel("truyen-a", chapters=2)
    gate.hold_at(1)
    job = await start(api)

    rerun = await api.post(f"/api/crawl/jobs/{job['id']}/retry")
    assert (rerun.status_code, rerun.json()["code"]) == (409, "job_running")

    await api.post(f"/api/crawl/jobs/{job['id']}/pause")
    cancelled = await api.post(f"/api/crawl/jobs/{job['id']}/cancel")
    assert cancelled.json()["status"] == "cancelled"


async def test_retry_reruns_the_same_range_and_only_fetches_what_is_missing(api, site):
    root = site.add_novel("truyen-a", chapters=4)
    site.pages[f"{root}chuong-2/"] = server_error
    first = await finished(api, (await start(api, from_chapter=1, to_chapter=3))["id"])
    assert (first["status"], first["chapters_ok"], first["chapters_failed"]) == ("partial", 2, 1)

    # Không yêu cầu thử lại chương lỗi → không còn gì để tải trong khoảng này.
    skipping = await finished(
        api, (await start(api, from_chapter=1, to_chapter=3, retry_failed=False))["id"]
    )
    assert (skipping["chapters_total"], skipping["chapters_skipped"]) == (0, 3)
    assert site.requests_to("chuong-2/") == 1

    site.set_chapter(root, 2, "Đã sửa.")
    retried = await api.post(f"/api/crawl/jobs/{first['id']}/retry")
    done = await finished(api, retried.json()["id"])

    assert (done["from_chapter"], done["to_chapter"]) == (1, 3)
    assert (done["status"], done["chapters_ok"], done["chapters_skipped"]) == ("completed", 1, 2)


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"url": "khong-phai-url"}, "invalid_url"),
        ({"url": "https://truyenfull.live/"}, "invalid_url"),  # trang chủ, không phải truyện
        ({"url": "https://example.com/truyen/"}, "unsupported_source"),
        ({"url": ROOT, "source": "nguon-khac"}, "unsupported_source"),
    ],
)
async def test_unusable_url_is_rejected_before_any_job_or_request(api, site, payload, code):
    response = await api.post("/api/crawl/jobs", json=payload)

    assert (response.status_code, response.json()["code"]) == (400, code)
    assert response.json()["detail"]  # có câu thông báo đọc được cho người dùng
    assert (await api.get("/api/crawl/jobs")).json()["total"] == 0
    assert site.hits == {}


async def test_invalid_chapter_range_is_a_validation_error(api):
    response = await api.post(
        "/api/crawl/jobs", json={"url": ROOT, "from_chapter": 5, "to_chapter": 2}
    )

    assert response.status_code == 422
    assert "from_chapter" in response.json()["detail"][0]["msg"]


async def test_missing_novel_fails_the_job_with_a_readable_error_in_job_and_log(api):
    url = "https://truyenfull.live/khong-co/"  # website giả trả 404

    failed = await finished(api, (await start(api, url))["id"])

    assert failed["status"] == "failed"
    assert "Trang không tồn tại" in failed["error"]
    errors = (await api.get("/api/logs", params={"level": "ERROR", "kind": "request"})).json()
    assert [(entry["run_id"], entry["url"]) for entry in errors] == [(failed["id"], url)]
    assert (await api.get("/api/logs", params={"kind": "parse"})).json() == []
    newest = (await api.get("/api/logs", params={"search": "KHONG-CO", "limit": 1})).json()
    assert [entry["message"].split(":")[0] for entry in newest] == ["Kết thúc (failed)"]
    assert (await api.get("/api/crawl/jobs/999")).status_code == 404


# --- Truyện và chương --------------------------------------------------------------------------


async def test_novels_can_be_searched_filtered_sorted_and_paged(api, repo):
    seed(
        repo,
        "nau-an-o-thap-nien-80",
        "Nấu Ăn Ở Thập Niên 80",
        author="Mộc Tử",
        status=NovelStatus.COMPLETED,
        chapters=3,
        done=3,
    )
    seed(repo, "kiem-lai", "Kiếm Lai", author="Phong Hỏa", chapters=4, done=1)
    seed(repo, "pham-nhan-tu-tien", "Phàm Nhân Tu Tiên", author="Vong Ngữ", chapters=2)

    async def titles(**params: object) -> list[str]:
        response = await api.get("/api/novels", params=params)
        return [novel["title"] for novel in response.json()["items"]]

    assert await titles(search="nau an") == ["Nấu Ăn Ở Thập Niên 80"]  # gõ không dấu
    assert await titles(search="Kiếm") == ["Kiếm Lai"]
    assert await titles(search="vong ngữ") == ["Phàm Nhân Tu Tiên"]  # theo tác giả
    assert await titles(search="100%") == []  # ký tự đặc biệt của LIKE không thành wildcard
    assert await titles(status="completed") == ["Nấu Ăn Ở Thập Niên 80"]
    assert await titles(source="nguon-khac") == []
    by_title = ["Kiếm Lai", "Nấu Ăn Ở Thập Niên 80", "Phàm Nhân Tu Tiên"]
    assert await titles(sort="title", order="asc") == by_title
    assert await titles(sort="done") == ["Nấu Ăn Ở Thập Niên 80", "Kiếm Lai", "Phàm Nhân Tu Tiên"]

    paging = {"sort": "title", "order": "asc", "page_size": 2}
    first = (await api.get("/api/novels", params=paging)).json()
    second = (await api.get("/api/novels", params=paging | {"page": 2})).json()
    assert (first["total"], second["total"]) == (3, 3)
    assert [novel["title"] for novel in first["items"] + second["items"]] == by_title
    assert (await api.get("/api/novels", params={"sort": "khong-co"})).status_code == 422


async def test_chapters_can_be_listed_filtered_and_read(api, repo):
    novel_id = seed(repo, "kiem-lai", "Kiếm Lai", chapters=4, done=1)
    last = repo.chapters_to_fetch(novel_id, 4, 4)[0][0]
    repo.mark_chapter_failed(last.id, "HTTP 500")

    novel = (await api.get(f"/api/novels/{novel_id}")).json()
    counts = (novel["chapters_done"], novel["chapters_failed"], novel["chapters_pending"])
    assert counts == (1, 1, 2)

    chapters = f"/api/novels/{novel_id}/chapters"
    page = (await api.get(chapters, params={"page_size": 3})).json()
    assert (page["total"], [chapter["number"] for chapter in page["items"]]) == (4, [1, 2, 3])
    failed = (await api.get(chapters, params={"status": "failed"})).json()
    assert [(chapter["number"], chapter["error"]) for chapter in failed["items"]] == [
        (4, "HTTP 500")
    ]

    read = (await api.get(f"{chapters}/1")).json()
    assert read["title"] == "Chương 1: Mở đầu"  # dòng đầu của nội dung là tiêu đề đầy đủ hơn
    assert read["paragraphs"] == ["Nội dung 1."]
    pending = (await api.get(f"{chapters}/2")).json()
    assert (pending["status"], pending["paragraphs"]) == ("pending", [])
    assert (await api.get(f"{chapters}/99")).json()["code"] == "not_found"
    assert (await api.get("/api/novels/999")).status_code == 404


# --- Nguồn và cấu hình ---------------------------------------------------------------------------


async def test_source_can_be_disabled_and_enabled_again(api, site, env_file):
    site.add_novel("truyen-a", chapters=1)
    sources = (await api.get("/api/sources")).json()
    assert [(s["name"], s["enabled"], s["novels"]) for s in sources] == [("truyenfull", True, 0)]
    assert sources[0]["domains"][0] == "truyenfull.live"

    off = await api.put("/api/sources/truyenfull", json={"enabled": False})

    assert off.json()["enabled"] is False
    assert "CRAWLER_DISABLED_SOURCES='[\"truyenfull\"]'" in env_file.read_text(encoding="utf-8")
    refused = await api.post("/api/crawl/jobs", json={"url": ROOT})
    assert (refused.status_code, refused.json()["code"]) == (409, "source_disabled")
    assert site.hits == {}

    on = await api.put("/api/sources/truyenfull", json={"enabled": True})

    assert on.json()["enabled"] is True
    await finished(api, (await start(api))["id"])
    source = (await api.get("/api/sources")).json()[0]
    assert (source["novels"], source["chapters_done"]) == (1, 1)
    assert (await api.put("/api/sources/khong-co", json={"enabled": False})).status_code == 404


async def test_connection_check_reports_success_and_refusal(api, site):
    site.pages["https://truyenfull.live/"] = "<html>trang chủ</html>"

    reachable = (await api.post("/api/sources/truyenfull/test")).json()

    assert (reachable["ok"], reachable["url"]) == (True, "https://truyenfull.live/")
    assert site.hits["https://truyenfull.live/robots.txt"] == 1  # vẫn hỏi robots.txt trước

    site.pages["https://truyenfull.live/"] = lambda request: httpx.Response(403)

    refused = (await api.post("/api/sources/truyenfull/test")).json()

    assert refused["ok"] is False
    assert "từ chối" in refused["message"]


async def test_settings_hide_secrets_are_validated_and_saved_to_env(api, env_file):
    shown = (await api.get("/api/settings")).json()
    assert shown["http"]["request_delay"] == 0.5  # đọc từ file .env của test
    assert "bi-mat" not in str(shown)
    assert "bob:***@db.test" in shown["database_url"]
    # Chỉ tên file cấu hình, không lộ đường dẫn thư mục của máy chủ.
    assert shown["env_file"] == ".env"
    assert env_file.as_posix() not in str(shown).replace("\\\\", "/")

    def with_http(**changes: object) -> dict:
        return shown | {"http": shown["http"] | changes}

    too_fast = await api.put("/api/settings", json=with_http(request_delay=0.1))
    assert too_fast.status_code == 422
    assert too_fast.json()["detail"][0]["loc"] == ["body", "http", "request_delay"]
    injected = await api.put("/api/settings", json=with_http(user_agent="bot\nX-Injected: 1"))
    assert injected.status_code == 422

    wanted = shown["http"] | {"request_delay": 1.5, "user_agent": "bot-thu/1.0 (+mailto:a@b.test)"}
    payload = {
        "http": wanted,
        "crawler": {"content_format": "markdown"},
        "log": {"level": "WARNING"},
    }
    saved = await api.put("/api/settings", json=payload)

    assert saved.status_code == 200, saved.text
    assert saved.json()["http"] == wanted
    assert (saved.json()["crawler"]["content_format"], saved.json()["log"]["level"]) == (
        "markdown",
        "WARNING",
    )
    text = env_file.read_text(encoding="utf-8")
    assert text.startswith("# dòng chú thích này")  # phần còn lại của .env còn nguyên
    assert "bob:bi-mat@db.test" in text
    assert "HTTP_REQUEST_DELAY='1.5'" in text
    assert (await api.get("/api/settings")).json()["http"] == wanted


# --- Phục vụ giao diện ---------------------------------------------------------------------------


async def test_built_ui_is_served_with_spa_fallback_but_unknown_api_stays_404(
    repo, env_file, tmp_path
):
    ui_dir = tmp_path / "dist"
    (ui_dir / "assets").mkdir(parents=True)
    (ui_dir / "index.html").write_text("<!doctype html><title>crawl-data-app</title>", "utf-8")
    (ui_dir / "assets" / "app.js").write_text("console.log('ui')", "utf-8")
    app = create_app(repo, env_file=env_file, ui_dir=ui_dir)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for path in ("/", "/novels/3", "/jobs"):
            page = await client.get(path)
            assert (page.status_code, "crawl-data-app" in page.text) == (200, True)
        assert (await client.get("/assets/app.js")).text == "console.log('ui')"
        missing = await client.get("/api/khong-co")
        assert (missing.status_code, missing.json()["code"]) == (404, "not_found")
        assert (await client.get("/api/stats")).status_code == 200


# --- API không có đăng nhập: chỉ chính giao diện này được gọi -----------------------------------------


async def test_writes_from_another_website_are_refused(api, site):
    site.add_novel("truyen-a", chapters=1)
    job = {"url": ROOT}

    # Một trang web lạ mở trong trình duyệt của người dùng tự gửi request tới server cục bộ (CSRF).
    foreign = await api.post("/api/crawl/jobs", json=job, headers={"Origin": "https://evil.test"})
    sandboxed = await api.post("/api/sources/truyenfull/test", headers={"Origin": "null"})

    assert (foreign.status_code, foreign.json()["code"]) == (403, "cross_origin")
    assert sandboxed.status_code == 403
    assert (await api.get("/api/crawl/jobs")).json()["total"] == 0
    assert site.hits == {}
    # Chính giao diện (Origin trùng Host) và việc đọc dữ liệu thì không bị ảnh hưởng.
    own = await api.post("/api/crawl/jobs", json=job, headers={"Origin": "http://test"})
    assert own.status_code == 201
    await finished(api, own.json()["id"])
    assert (await api.get("/api/stats", headers={"Origin": "https://evil.test"})).status_code == 200


async def test_local_server_only_answers_to_its_own_host_name(repo, env_file):
    app = create_app(repo, env_file=env_file, allowed_hosts=["127.0.0.1", "localhost"])

    async def status(base_url: str) -> int:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
            return (await client.get("/api/stats")).status_code

    assert await status("http://127.0.0.1:8000") == 200
    assert await status("http://localhost:8000") == 200
    # Tên miền lạ được trỏ về 127.0.0.1 (DNS rebinding) vẫn mang header Host của chính nó.
    assert await status("http://rebind.evil.test:8000") == 400
