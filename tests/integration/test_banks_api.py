"""API danh mục ngân hàng đầu-cuối: FastAPI + JobManager + SQLite thật, nguồn thay bằng fixture."""

import asyncio

import httpx
import pytest

from crawl_data_app import banks

pytestmark = pytest.mark.anyio

BASE = "/api/banks"
VIETINBANK = {
    "bin": "970415",
    "code": "ICB",
    "name": "Ngân hàng TMCP Công thương Việt Nam",
    "short_name": "VietinBank",
    "swift_code": "ICBVVNVX",
    "logo": "https://cdn.nguon.test/img/ICB.png",
    "transfer_supported": True,
    "lookup_supported": True,
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


async def bins(api, **params: object) -> list[str]:
    return [item["bin"] for item in (await api.get(BASE, params=params)).json()["items"]]


async def test_sync_is_a_background_job_that_fills_the_catalogue(api, sources):
    assert (await api.get(f"{BASE}/summary")).json() == {"count": 0, "last_job": None}

    created = (await api.post(f"{BASE}/sync")).json()

    assert (created["crawler"], created["status"], created["active"]) == ("banks", "running", True)
    assert (created["url"], created["chapters_total"]) == (banks.HOME, 1)
    job = await finished(api, created["id"])
    assert (job["status"], job["error"], job["chapters_ok"]) == ("completed", None, 1)
    assert job["result"] == {"bank": 3}
    assert sources.requests_to("api.vietqr.io") == 2  # robots.txt + file dữ liệu

    summary = (await api.get(f"{BASE}/summary")).json()
    assert (summary["count"], summary["last_job"]["id"]) == (3, job["id"])
    history = (await api.get("/api/crawl/jobs", params={"crawler": "banks"})).json()
    assert [item["id"] for item in history["items"]] == [job["id"]]
    listed = (await api.get(BASE)).json()
    assert listed["total"] == 3
    assert listed["items"][2] | {"crawled_at": None} == VIETINBANK


async def test_list_is_sorted_by_short_name_and_search_ignores_accents(api, sources):
    await sync(api)

    assert await bins(api) == ["546034", "970436", "970415"]  # BankMau, Vietcombank, VietinBank
    assert await bins(api, search="cong thuong") == ["970415"]
    assert await bins(api, search="Ngoại Thương") == ["970436"]
    assert await bins(api, search="9704") == ["970436", "970415"]
    assert await bins(api, search="bftv") == ["970436"]  # mã SWIFT
    assert await bins(api, search="icb") == ["970415"]
    assert await bins(api, page=2, page_size=2) == ["970415"]


async def test_export_downloads_every_bank_as_json(api, sources):
    await sync(api)

    response = await api.get(f"{BASE}/export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["content-disposition"] == 'attachment; filename="vn-banks.json"'
    assert "Công thương" in response.text  # tiếng Việt giữ nguyên, không thành \\uXXXX
    assert response.json() == (await api.get(BASE)).json()["items"]


async def test_resync_updates_in_place_and_a_broken_source_keeps_existing_data(api, sources):
    await sync(api)
    await sync(api)
    assert (await api.get(BASE)).json()["total"] == 3  # ghi đè theo mã BIN, không nhân đôi

    sources.pages[banks.DATA_URL] = lambda _request: httpx.Response(
        200, text='{"data": [{"ma": "970415"}]}'
    )
    failed = await sync(api)

    assert (failed["status"], failed["result"]) == ("failed", None)
    assert "không còn khớp cấu trúc" in failed["error"]
    assert (await api.get(f"{BASE}/summary")).json()["count"] == 3  # dữ liệu cũ còn nguyên

    # "Thử lại" một job ngân hàng là đồng bộ lại, không phải crawl truyện.
    rerun = await api.post(f"/api/crawl/jobs/{failed['id']}/retry")
    assert rerun.status_code == 201
    assert (rerun.json()["crawler"], rerun.json()["id"] != failed["id"]) == ("banks", True)
    await finished(api, rerun.json()["id"])


async def test_running_sync_blocks_a_second_one(api, sources, gate, repo):
    gate.hold_at(1)  # đứng lại trước file dữ liệu
    created = (await api.post(f"{BASE}/sync")).json()

    duplicate = await api.post(f"{BASE}/sync")

    assert duplicate.status_code == 409
    assert duplicate.json() == {
        "code": "duplicate_job",
        "detail": f"Danh mục ngân hàng đang được đồng bộ ở job #{created['id']}",
        "job_id": created["id"],
    }
    # Lệnh `resume` của CLI dựng lại yêu cầu crawl truyện: job ngân hàng không được lọt vào đó.
    assert repo.unfinished_requests() == []
    gate.release()
    assert (await finished(api, created["id"]))["status"] == "completed"
