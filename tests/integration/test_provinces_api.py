"""API danh mục tỉnh thành đầu-cuối: FastAPI + JobManager + SQLite thật, nguồn thay bằng fixture."""

import asyncio

import httpx
import pytest

from crawl_data_app import provinces

pytestmark = pytest.mark.anyio

BASE = "/api/provinces"
HANOI = {
    "code": "01",
    "name": "Hà Nội",
    "name_en": "Hanoi",
    "full_name": "Thành phố Hà Nội",
    "full_name_en": "Hanoi City",
    "code_name": "ha_noi",
    "unit": "Thành phố",
    "postal_code_prefix": "10, 11, 12, 13, 14",
    "ward_count": 2,
    "crawled_at": None,
}


async def finished(api, job_id: int) -> dict:
    """Hỏi lại job (mỗi lần hỏi nhường event loop cho job chạy) tới khi nó kết thúc."""
    for _ in range(500):
        job = (await api.get(f"/api/crawl/jobs/{job_id}")).json()
        if job["status"] != "running":
            return job
        await asyncio.sleep(0)
    raise AssertionError(f"job #{job_id} không kết thúc: {job}")


async def sync(api) -> dict:
    response = await api.post(f"{BASE}/sync")
    assert response.status_code == 201, response.text
    return await finished(api, response.json()["id"])


async def codes(api, **params: object) -> list[str]:
    return [item["code"] for item in (await api.get(BASE, params=params)).json()["items"]]


async def test_sync_is_a_background_job_that_fills_the_catalogue(api, sources):
    assert (await api.get(f"{BASE}/summary")).json() == {
        "count": 0,
        "ward_count": 0,
        "last_job": None,
    }

    created = (await api.post(f"{BASE}/sync")).json()

    assert (created["crawler"], created["status"], created["active"]) == (
        "provinces",
        "running",
        True,
    )
    assert (created["url"], created["chapters_total"]) == (provinces.HOME, 1)
    job = await finished(api, created["id"])
    assert (job["status"], job["error"], job["chapters_ok"]) == ("completed", None, 1)
    assert job["result"] == {"province": 3, "ward": 4}
    assert sources.requests_to("raw.githubusercontent.com") == 2  # robots.txt + file dữ liệu

    summary = (await api.get(f"{BASE}/summary")).json()
    assert (summary["count"], summary["ward_count"]) == (3, 4)
    assert summary["last_job"]["id"] == job["id"]
    history = (await api.get("/api/crawl/jobs", params={"crawler": "provinces"})).json()
    assert [item["id"] for item in history["items"]] == [job["id"]]
    listed = (await api.get(BASE)).json()
    assert listed["total"] == 3
    assert listed["items"][0] | {"crawled_at": None} == HANOI


async def test_search_ignores_accents_and_matches_code_name_and_unit(api, sources):
    await sync(api)

    assert await codes(api) == ["01", "04", "48"]
    assert await codes(api, search="ha noi") == ["01"]
    assert await codes(api, search="Đà Nẵng") == ["48"]
    assert await codes(api, search="cao bang province") == ["04"]
    assert await codes(api, search="thanh pho") == ["01", "48"]
    assert await codes(api, search="48") == ["48"]
    assert await codes(api, page=2, page_size=2) == ["48"]


async def test_export_downloads_every_province_as_json(api, sources):
    await sync(api)

    response = await api.get(f"{BASE}/export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["content-disposition"] == 'attachment; filename="vn-provinces.json"'
    assert "Thành phố Đà Nẵng" in response.text  # tiếng Việt giữ nguyên, không thành \\uXXXX
    assert response.json() == (await api.get(BASE)).json()["items"]

    # Kèm phường/xã: mỗi tỉnh thành thêm mảng `wards`, phần còn lại y như bản không kèm.
    nested = await api.get(f"{BASE}/export", params={"with_wards": "true"})
    assert nested.headers["content-disposition"] == (
        'attachment; filename="vn-provinces-wards.json"'
    )
    assert [{**item, "wards": None} for item in nested.json()] == [
        {**item, "wards": None} for item in response.json()
    ]
    assert [[ward["code"] for ward in item["wards"]] for item in nested.json()] == [
        ["00004", "00070"],
        ["01279"],
        ["20333"],
    ]
    assert nested.json()[0]["wards"][0] | {"crawled_at": None} == {
        "code": "00004",
        "name": "Ba Đình",
        "name_en": "Ba Dinh",
        "full_name": "Phường Ba Đình",
        "full_name_en": "Ba Dinh Ward",
        "code_name": "ba_dinh",
        "unit": "Phường",
        "postal_code": "11120",
        "crawled_at": None,
    }


async def test_wards_are_listed_with_their_province_filtered_and_searched(api, sources):
    await sync(api)

    async def wards(**params: object) -> list[str]:
        response = await api.get(f"{BASE}/wards", params=params)
        assert response.status_code == 200, response.text
        return [item["code"] for item in response.json()["items"]]

    listed = (await api.get(f"{BASE}/wards")).json()
    assert listed["total"] == 4
    assert listed["items"][0] | {"crawled_at": None} == {
        "code": "00004",
        "name": "Ba Đình",
        "name_en": "Ba Dinh",
        "full_name": "Phường Ba Đình",
        "full_name_en": "Ba Dinh Ward",
        "code_name": "ba_dinh",
        "unit": "Phường",
        "postal_code": "11120",
        "province_code": "01",
        "province_name": "Thành phố Hà Nội",
        "crawled_at": None,
    }
    assert await wards(province_code="01") == ["00004", "00070"]
    assert await wards(search="hoa") == ["00070", "01279", "20333"]  # Hoàn Kiếm, Hoà An, Hoàng Sa
    assert await wards(search="hoa", province_code="04") == ["01279"]
    assert await wards(search="dac khu") == ["20333"]
    assert await wards(page=2, page_size=3) == ["20333"]
    assert await wards(province_code="99") == []
    assert (await api.get(f"{BASE}/wards", params={"province_code": "../x"})).status_code == 422


async def test_wards_export_covers_one_province_or_the_whole_country(api, sources):
    await sync(api)

    everything = await api.get(f"{BASE}/wards/export")
    hanoi = await api.get(f"{BASE}/wards/export", params={"province_code": "01"})

    assert everything.headers["content-type"] == "application/json"
    assert everything.headers["content-disposition"] == 'attachment; filename="vn-wards.json"'
    assert hanoi.headers["content-disposition"] == 'attachment; filename="vn-wards-01.json"'
    assert "Phường Hoàn Kiếm" in hanoi.text  # tiếng Việt giữ nguyên, không thành \\uXXXX
    assert everything.json() == (await api.get(f"{BASE}/wards")).json()["items"]
    assert [item["code"] for item in hanoi.json()] == ["00004", "00070"]


async def test_resync_updates_in_place_and_a_broken_source_keeps_existing_data(api, sources):
    await sync(api)
    await sync(api)
    assert (await api.get(BASE)).json()["total"] == 3  # ghi đè theo mã, không nhân đôi
    assert (await api.get(f"{BASE}/wards")).json()["total"] == 4

    sources.pages[provinces.DATA_URL] = lambda _request: httpx.Response(
        200, text='[{"ma": "01", "ten": "Hà Nội"}]'
    )
    failed = await sync(api)

    assert (failed["status"], failed["result"]) == ("failed", None)
    assert "không còn khớp cấu trúc" in failed["error"]
    summary = (await api.get(f"{BASE}/summary")).json()
    assert (summary["count"], summary["ward_count"]) == (3, 4)  # dữ liệu cũ còn nguyên
    logs = (await api.get("/api/logs", params={"job_id": failed["id"], "kind": "parse"})).json()
    assert len(logs) == 1

    # "Thử lại" một job tỉnh thành là đồng bộ lại, không phải crawl truyện.
    rerun = await api.post(f"/api/crawl/jobs/{failed['id']}/retry")
    assert rerun.status_code == 201
    assert (rerun.json()["crawler"], rerun.json()["id"] != failed["id"]) == ("provinces", True)
    await finished(api, rerun.json()["id"])


async def test_running_sync_blocks_a_second_one(api, sources, gate, repo):
    gate.hold_at(1)  # đứng lại trước file dữ liệu
    created = (await api.post(f"{BASE}/sync")).json()

    duplicate = await api.post(f"{BASE}/sync")

    assert duplicate.status_code == 409
    assert duplicate.json() == {
        "code": "duplicate_job",
        "detail": f"Danh mục tỉnh thành đang được đồng bộ ở job #{created['id']}",
        "job_id": created["id"],
    }
    # Lệnh `resume` của CLI dựng lại yêu cầu crawl truyện: job tỉnh thành không được lọt vào đó.
    assert repo.unfinished_requests() == []
    gate.release()
    assert (await finished(api, created["id"]))["status"] == "completed"
