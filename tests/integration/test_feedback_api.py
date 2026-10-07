"""Góp ý: người dùng gửi và xem lại góp ý của chính mình; chỉ quản trị viên xem/quản lý được tất cả.

Quyền được kiểm tra ở backend — mọi endpoint `/api/admin/*` phải trả 403 khi không đúng mã quản trị.
"""

import re
import uuid

import httpx
import pytest

from crawl_data_app.web.app import create_app

pytestmark = pytest.mark.anyio

TOKEN = "ma-quan-tri-dai-it-nhat-16-ky-tu"
ADMIN = {"Authorization": f"Bearer {TOKEN}"}
ALICE = {"X-Feedback-Key": str(uuid.uuid4())}
BOB = {"X-Feedback-Key": str(uuid.uuid4())}

BUG = {
    "type": "bug_report",
    "title": "Lỗi khi crawl truyện",
    "description": "Bấm Bắt đầu crawl thì báo lỗi máy chủ.",
    "area": "Crawl truyện",
    "severity": "high",
    "contact": "alice@example.com",
}
CRAWLER = {
    "type": "crawler_request",
    "title": "Sân bay Châu Âu",
    "url": "https://example.org/airports",
    "data_type": "aviation",
    "description": "Danh mục sân bay của các nước châu Âu.",
}


@pytest.fixture
def env_file(env_file):
    """Như fixture chung, thêm mã quản trị."""
    with env_file.open("a", encoding="utf-8") as file:
        file.write(f"ADMIN_TOKEN={TOKEN}\n")
    return env_file


async def send(api, body: dict, headers: dict = ALICE) -> dict:
    response = await api.post("/api/feedback", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def admin_routes(app) -> list[tuple[str, str]]:
    """(method, đường dẫn mẫu với id = 1) của mọi endpoint quản trị đang đăng ký."""
    return [
        (method.upper(), re.sub(r"\{[^}]+\}", "1", path))
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/admin")
        for method in operations
    ]


# --- Người dùng --------------------------------------------------------------------------------


async def test_user_sends_both_kinds_and_sees_only_their_own(api):
    bug = await send(api, BUG)
    crawler = await send(api, CRAWLER)
    await send(api, {**BUG, "title": "Góp ý của Bob"}, headers=BOB)

    assert bug["status"] == "open"
    assert bug["details"] == {"area": "Crawl truyện", "severity": "high"}
    assert crawler["details"] == {"url": "https://example.org/airports", "data_type": "aviation"}
    # Người gửi không thấy thông tin quản trị (liên hệ, mã người gửi).
    assert "contact" not in bug and "reporter" not in bug

    mine = (await api.get("/api/feedback/mine", headers=ALICE)).json()
    assert [item["id"] for item in mine] == [crawler["id"], bug["id"]]
    assert [
        item["title"] for item in (await api.get("/api/feedback/mine", headers=BOB)).json()
    ] == ["Góp ý của Bob"]


async def test_own_feedback_needs_a_reporter_key(api):
    assert (await api.get("/api/feedback/mine")).status_code == 422
    short = {"X-Feedback-Key": "ngan"}
    assert (await api.get("/api/feedback/mine", headers=short)).status_code == 422
    # Gửi không kèm mã vẫn được, chỉ là không xem lại được.
    await send(api, BUG, headers={})
    assert (await api.get("/api/feedback/mine", headers=ALICE)).json() == []


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({**BUG, "title": "  a "}, "title"),
        ({**BUG, "description": "ngắn"}, "description"),
        ({**BUG, "severity": "urgent"}, "severity"),
        ({**CRAWLER, "url": "example.org"}, "url"),
        ({**CRAWLER, "url": "ftp://example.org/"}, "url"),
        ({**CRAWLER, "data_type": "movie"}, "data_type"),
        ({**BUG, "type": "praise"}, "type"),
        ({**BUG, "status": "resolved"}, "status"),  # người gửi không tự đặt trạng thái
    ],
)
async def test_invalid_feedback_is_rejected_with_the_failing_field(api, body, field):
    response = await api.post("/api/feedback", json=body, headers=ALICE)

    assert response.status_code == 422
    # Lỗi chỉ ra đúng trường sai (loại góp ý lạ: FastAPI báo ở "tag" của union).
    locs = [error["loc"] for error in response.json()["detail"]]
    assert any(field in loc or (field == "type" and "body" in loc) for loc in locs), locs


async def test_blank_optional_fields_are_dropped(api):
    item = await send(api, {**BUG, "area": "  ", "contact": ""})

    assert item["details"] == {"severity": "high"}
    admin = (await api.get(f"/api/admin/feedback/{item['id']}", headers=ADMIN)).json()
    assert admin["contact"] is None


# --- Phân quyền --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "headers",
    [
        {},
        ALICE,  # người dùng thường: mã người gửi không phải mã quản trị
        {"Authorization": "Bearer sai-ma-quan-tri-roi-nhe"},
        {"Authorization": f"Basic {TOKEN}"},
        {"Authorization": TOKEN},
    ],
)
async def test_every_admin_endpoint_is_forbidden_without_the_admin_token(repo, env_file, headers):
    app = create_app(repo, env_file=env_file)
    routes = admin_routes(app)
    # List, detail, update, delete và kiểm tra phiên — thêm endpoint quản trị mới thì tự được kiểm tra.
    assert {method for method, _ in routes} >= {"GET", "PATCH", "DELETE"}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        await client.post("/api/feedback", json=BUG)
        for method, path in routes:
            response = await client.request(
                method, path, headers=headers, json={"status": "resolved"}
            )
            assert response.status_code == 403, (method, path)
            assert response.json()["code"] == "admin_only"
        # Không có gì bị đổi hay bị xoá.
        item = (await client.get("/api/admin/feedback/1", headers=ADMIN)).json()
        assert item["status"] == "open"


async def test_admin_api_is_off_until_a_token_is_configured(repo, tmp_path):
    env = tmp_path / "khong-co-ma.env"
    env.write_text("", encoding="utf-8")
    app = create_app(repo, env_file=env)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for method, path in admin_routes(app):
            response = await client.request(method, path, headers=ADMIN)
            assert (response.status_code, response.json()["code"]) == (403, "admin_disabled")
        # Gửi góp ý vẫn dùng được khi chưa bật quản trị.
        assert (await client.post("/api/feedback", json=BUG)).status_code == 201


async def test_admin_token_never_shows_up_in_settings(api):
    assert TOKEN not in (await api.get("/api/settings")).text
    assert (await api.get("/api/admin/session", headers=ADMIN)).json() == {"role": "admin"}


# --- Quản trị ----------------------------------------------------------------------------------


async def test_admin_lists_filters_and_searches_all_feedback(api):
    bug = await send(api, BUG)
    crawler = await send(api, CRAWLER, headers=BOB)

    async def ids(**params: object) -> list[int]:
        page = (await api.get("/api/admin/feedback", params=params, headers=ADMIN)).json()
        assert page["total"] == len(page["items"])
        return [item["id"] for item in page["items"]]

    assert await ids() == [crawler["id"], bug["id"]]
    assert await ids(type="bug_report") == [bug["id"]]
    assert await ids(type="crawler_request") == [crawler["id"]]
    assert await ids(search="san bay chau au") == [crawler["id"]]  # không dấu vẫn tìm được
    assert await ids(search="example.org") == [crawler["id"]]  # tìm cả trong trường riêng
    assert await ids(search="ALICE@") == [bug["id"]]
    assert await ids(status="resolved") == []
    page = (
        await api.get("/api/admin/feedback", params={"page_size": 1, "page": 2}, headers=ADMIN)
    ).json()
    assert ([item["id"] for item in page["items"]], page["total"]) == ([bug["id"]], 2)
    bad = await api.get("/api/admin/feedback", params={"type": "praise"}, headers=ADMIN)
    assert bad.status_code == 422


async def test_admin_sees_detail_updates_status_and_reporter_sees_the_result(api):
    bug = await send(api, BUG)

    detail = (await api.get(f"/api/admin/feedback/{bug['id']}", headers=ADMIN)).json()
    assert detail["contact"] == "alice@example.com"
    assert detail["reporter"] is not None and len(detail["reporter"]) == 8
    assert ALICE["X-Feedback-Key"] not in str(detail)

    updated = await api.patch(
        f"/api/admin/feedback/{bug['id']}",
        json={"status": "in_progress", "response": "Đã tái hiện được, đang sửa."},
        headers=ADMIN,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "in_progress"
    # Chỉ đổi trạng thái: phản hồi đã có được giữ nguyên.
    resolved = await api.patch(
        f"/api/admin/feedback/{bug['id']}", json={"status": "resolved"}, headers=ADMIN
    )
    assert resolved.json()["response"] == "Đã tái hiện được, đang sửa."
    assert resolved.json()["updated_at"] >= detail["updated_at"]

    mine = (await api.get("/api/feedback/mine", headers=ALICE)).json()
    assert (mine[0]["status"], mine[0]["response"]) == ("resolved", "Đã tái hiện được, đang sửa.")
    assert (await ids_with_status(api, "resolved")) == [bug["id"]]


async def ids_with_status(api, status: str) -> list[int]:
    page = (await api.get("/api/admin/feedback", params={"status": status}, headers=ADMIN)).json()
    return [item["id"] for item in page["items"]]


@pytest.mark.parametrize(
    "body", [{"status": "done"}, {"status": None}, {"owner": "admin"}, {"response": "x" * 5001}]
)
async def test_invalid_update_changes_nothing(api, body):
    bug = await send(api, BUG)

    response = await api.patch(f"/api/admin/feedback/{bug['id']}", json=body, headers=ADMIN)

    assert response.status_code in (400, 422)
    assert (await api.get(f"/api/admin/feedback/{bug['id']}", headers=ADMIN)).json()[
        "status"
    ] == "open"


async def test_admin_deletes_feedback(api):
    bug = await send(api, BUG)

    assert (await api.delete(f"/api/admin/feedback/{bug['id']}", headers=ADMIN)).status_code == 204

    for method in ("GET", "PATCH", "DELETE"):
        response = await api.request(
            method, f"/api/admin/feedback/{bug['id']}", headers=ADMIN, json={"status": "open"}
        )
        assert (response.status_code, response.json()["code"]) == (404, "not_found")
    assert (await api.get("/api/feedback/mine", headers=ALICE)).json() == []
