"""API danh mục hàng không đầu-cuối: FastAPI + JobManager + SQLite thật, các nguồn thay bằng fixture."""

import asyncio

import httpx
import pytest

from crawl_data_app import aviation

pytestmark = pytest.mark.anyio

VNA = "/api/aviation/vna"
WORLD = "/api/aviation/world"
EMPTY = {"airport": 0, "airline": 0, "city": 0, "country": 0}


async def wait_for(api, job_id: int, reached) -> dict:
    """Hỏi lại job (mỗi lần hỏi nhường event loop cho job chạy) tới khi `reached(job)`."""
    for _ in range(500):
        job = (await api.get(f"/api/crawl/jobs/{job_id}")).json()
        if reached(job):
            return job
        await asyncio.sleep(0)
    raise AssertionError(f"job #{job_id} không tới được trạng thái mong đợi: {job}")


async def sync(api, base: str) -> dict:
    """Tạo job đồng bộ rồi chờ nó kết thúc; trả về job ở trạng thái cuối."""
    response = await api.post(f"{base}/sync")
    assert response.status_code == 201, response.text
    return await wait_for(api, response.json()["id"], lambda job: job["status"] != "running")


async def records(api, base: str, kind: str, **params: object) -> dict:
    response = await api.get(f"{base}/records", params={"kind": kind, **params})
    assert response.status_code == 200, response.text
    return response.json()


async def codes(api, base: str, kind: str, **params: object) -> list[str]:
    return [item["code"] for item in (await records(api, base, kind, **params))["items"]]


async def jobs_of(api, crawler: str) -> dict:
    return (await api.get("/api/crawl/jobs", params={"crawler": crawler})).json()


async def test_sync_is_a_background_job_with_progress(api, sources):
    assert (await api.get(f"{VNA}/summary")).json() == {"counts": EMPTY, "last_job": None}

    created = (await api.post(f"{VNA}/sync")).json()

    assert (created["crawler"], created["status"], created["active"]) == (
        "aviation:vna",
        "running",
        True,
    )
    assert (created["url"], created["chapters_total"]) == ("https://www.vietnamairlines.com", 3)
    job = await wait_for(api, created["id"], lambda job: job["status"] != "running")
    assert (job["status"], job["error"], job["active"]) == ("completed", None, False)
    assert (job["chapters_ok"], job["chapters_failed"]) == (3, 0)  # ba file đã tải
    assert job["result"] == {"airport": 4, "airline": 2, "city": 3, "country": 2}
    assert sources.requests_to("vietnamairlines.com") == 4  # robots.txt + ba file dữ liệu

    summary = (await api.get(f"{VNA}/summary")).json()
    assert summary["counts"] == job["result"]
    assert summary["last_job"]["id"] == job["id"]
    # Job hàng không nằm chung danh sách và chung thống kê với job truyện.
    assert [item["id"] for item in (await api.get("/api/crawl/jobs")).json()["items"]] == [
        job["id"]
    ]
    assert (await api.get("/api/stats")).json()["jobs"]["completed"] == 1

    airports = await records(api, VNA, "airport")
    assert airports["total"] == 4
    assert airports["items"][0] | {"crawled_at": None} == {
        "kind": "airport",
        "code": "DAD",
        "name": "Da Nang",
        "name_vi": "Đà Nẵng",
        "city_code": "DAD",
        "city_name": "Da Nang",
        "country_code": "VN",
        "country_name": "Vietnam",
        "region": "VIETNAM",
        "crawled_at": None,
    }


async def test_world_sync_reads_open_data_and_derives_cities(api, sources):
    job = await sync(api, WORLD)

    assert (job["crawler"], job["status"]) == ("aviation:world", "completed")
    assert job["result"] == {"airport": 5, "airline": 2, "city": 3, "country": 3}
    assert sources.requests_to("vietnamairlines.com") == 0

    hanoi = (await records(api, WORLD, "airport", search="noi bai"))["items"][0]
    assert hanoi | {"crawled_at": None} == {
        "kind": "airport",
        "code": "HAN",
        "name": "Noi Bai International Airport",
        "name_vi": None,
        "city_code": "VN-hanoi",
        "city_name": "Hanoi",
        "country_code": "VN",
        "country_name": "Vietnam",
        "region": "Asia",
        "crawled_at": None,
    }
    assert await codes(api, WORLD, "city") == ["JP-tokyo", "VN-da-nang", "VN-hanoi"]
    assert await codes(api, WORLD, "airline") == ["AF", "VN"]


async def test_the_two_sources_are_kept_apart(api, sources):
    await sync(api, VNA)
    await sync(api, WORLD)

    # Cùng mã HAN ở hai nguồn là hai bản ghi khác nhau, mỗi nguồn một tên.
    assert (await records(api, VNA, "airport", search="HAN"))["items"][0]["name"] == "Hanoi"
    world = (await records(api, WORLD, "airport", search="HAN"))["items"]
    assert [item["name"] for item in world] == [
        "Noi Bai International Airport",
        "Tokyo Haneda International Airport",  # khớp chữ "han" trong "Haneda"
    ]
    assert (await api.get(f"{VNA}/summary")).json()["counts"]["country"] == 2
    assert (await api.get(f"{WORLD}/summary")).json()["counts"]["country"] == 3
    # Lịch sử của từng nguồn = các job của crawler đó.
    assert (await jobs_of(api, "aviation:vna"))["total"] == 1
    assert (await jobs_of(api, "aviation:world"))["total"] == 1
    assert (await jobs_of(api, "novel"))["total"] == 0
    assert (await api.get("/api/aviation/mars/summary")).status_code == 422
    assert (await api.post("/api/aviation/mars/sync")).status_code == 422


async def test_syncing_again_updates_in_place_without_duplicates(api, sources):
    await sync(api, VNA)
    await sync(api, VNA)

    assert (await records(api, VNA, "airport"))["total"] == 4
    history = await jobs_of(api, "aviation:vna")
    assert [job["status"] for job in history["items"]] == ["completed", "completed"]


async def test_search_ignores_accents_and_matches_city_and_country(api, sources):
    await sync(api, VNA)

    assert await codes(api, VNA, "airport", search="da nang") == ["DAD"]
    assert await codes(api, VNA, "airport", search="japan") == ["HND", "NRT"]
    assert await codes(api, VNA, "city", search="hà nội") == ["HAN"]
    paged = await records(api, VNA, "airport", page=2, page_size=3)
    assert (paged["total"], [r["code"] for r in paged["items"]]) == (4, ["NRT"])
    assert (await api.get(f"{VNA}/records", params={"kind": "plane"})).status_code == 422


async def test_changed_source_structure_fails_the_job_and_keeps_existing_data(api, sources):
    await sync(api, WORLD)
    sources.pages[aviation.WORLD_AIRPORTS_URL] = lambda _request: httpx.Response(
        200, text="id,ten\n1,Noi Bai\n"
    )

    job = await sync(api, WORLD)

    assert job["status"] == "failed"
    assert "không còn khớp cấu trúc" in job["error"]
    assert job["result"] is None
    assert (await records(api, WORLD, "airport"))["total"] == 5  # dữ liệu cũ còn nguyên
    history = await jobs_of(api, "aviation:world")
    assert [item["status"] for item in history["items"]] == ["failed", "completed"]
    logs = (await api.get("/api/logs", params={"job_id": job["id"], "kind": "parse"})).json()
    assert len(logs) == 1  # lỗi parser vào log của đúng job đó


async def test_robots_disallow_stops_the_job_before_any_data_request(api, sources):
    sources.robots = "User-agent: *\nDisallow: /bin/\n"

    job = await sync(api, VNA)

    assert job["status"] == "failed"
    assert "robots.txt" in job["error"]
    assert sources.requests_to("/bin/") == 0
    assert (await api.get(f"{VNA}/summary")).json()["counts"] == EMPTY


async def test_running_sync_blocks_duplicates_can_be_paused_and_rerun(api, sources, gate, repo):
    gate.hold_at(2)  # đứng lại trước file thứ hai
    created = (await api.post(f"{VNA}/sync")).json()
    midway = await wait_for(api, created["id"], lambda job: job["chapters_ok"] == 1)
    assert (midway["status"], midway["active"]) == ("running", True)

    duplicate = await api.post(f"{VNA}/sync")
    assert duplicate.status_code == 409
    assert duplicate.json() == {
        "code": "duplicate_job",
        "detail": f"Nguồn này đang được đồng bộ ở job #{created['id']}",
        "job_id": created["id"],
    }
    other = await api.post(f"{WORLD}/sync")  # nguồn khác thì không bị chặn
    assert other.status_code == 201

    paused = (await api.post(f"/api/crawl/jobs/{created['id']}/pause")).json()
    assert (paused["status"], paused["active"]) == ("interrupted", False)
    assert (await api.get(f"{VNA}/summary")).json()[
        "counts"
    ] == EMPTY  # chưa ghi gì khi dừng giữa chừng
    # Lệnh `resume` của CLI dựng lại yêu cầu crawl truyện: job hàng không không được lọt vào đó.
    assert repo.unfinished_requests() == []

    gate.release()
    await wait_for(api, other.json()["id"], lambda job: job["status"] != "running")
    rerun = await api.post(f"/api/crawl/jobs/{created['id']}/resume")
    assert rerun.status_code == 201
    again = rerun.json()
    assert (again["crawler"], again["id"] != created["id"]) == ("aviation:vna", True)
    done = await wait_for(api, again["id"], lambda job: job["status"] != "running")
    assert (done["status"], done["result"]["airport"]) == ("completed", 4)


async def test_export_downloads_every_record_of_a_kind_as_json(api, sources):
    await sync(api, VNA)

    response = await api.get(f"{VNA}/export", params={"kind": "airport"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["content-disposition"] == (
        'attachment; filename="aviation-vna-airport.json"'
    )
    assert "Đà Nẵng" in response.text  # tiếng Việt giữ nguyên, không thành \\uXXXX
    exported = response.json()
    assert exported == (await records(api, VNA, "airport", page_size=200))["items"]
    assert [item["code"] for item in exported] == ["DAD", "HAN", "HND", "NRT"]
    assert (await api.get(f"{VNA}/export", params={"kind": "plane"})).status_code == 422
