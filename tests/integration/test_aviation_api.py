"""API danh mục hàng không đầu-cuối: FastAPI + SQLite thật, các nguồn được thay bằng fixture."""

import httpx
import pytest

from crawl_data_app import aviation

pytestmark = pytest.mark.anyio

VNA = "/api/aviation/vna"
WORLD = "/api/aviation/world"
EMPTY = {"airport": 0, "airline": 0, "city": 0, "country": 0}


@pytest.fixture
def sources(site, load_fixture):
    """Website giả trả file dữ liệu của cả hai nguồn."""
    files = {
        aviation.VNA_ROUTES_URL.format(lang="en"): "vna-routes.en.json",
        aviation.VNA_ROUTES_URL.format(lang="vi"): "vna-routes.vi.json",
        aviation.VNA_AIRLINES_URL: "vna-airlines.json",
        aviation.WORLD_COUNTRIES_URL: "world-countries.csv",
        aviation.WORLD_AIRPORTS_URL: "world-airports.csv",
        aviation.WORLD_AIRLINES_URL: "world-airlines.dat",
    }
    for url, name in files.items():
        text = load_fixture(f"aviation/{name}")
        site.pages[url] = lambda _request, text=text: httpx.Response(200, text=text)
    site.robots = "User-agent: *\nDisallow:\n"
    return site


async def records(api, base: str, kind: str, **params: object) -> dict:
    response = await api.get(f"{base}/records", params={"kind": kind, **params})
    assert response.status_code == 200, response.text
    return response.json()


async def codes(api, base: str, kind: str, **params: object) -> list[str]:
    return [item["code"] for item in (await records(api, base, kind, **params))["items"]]


async def test_vna_sync_stores_all_four_kinds_with_three_requests(api, sources):
    assert (await api.get(f"{VNA}/summary")).json() == {"counts": EMPTY, "last_sync": None}

    sync = (await api.post(f"{VNA}/sync")).json()

    assert (sync["status"], sync["error"]) == ("completed", None)
    assert sync["counts"] == {"airport": 4, "airline": 2, "city": 3, "country": 2}
    assert sources.requests_to("vietnamairlines.com") == 4  # robots.txt + ba file dữ liệu
    summary = (await api.get(f"{VNA}/summary")).json()
    assert summary["counts"] == sync["counts"]
    assert summary["last_sync"]["id"] == sync["id"]

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
    sync = (await api.post(f"{WORLD}/sync")).json()

    assert (sync["status"], sync["error"]) == ("completed", None)
    assert sync["counts"] == {"airport": 5, "airline": 2, "city": 3, "country": 3}
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
    await api.post(f"{VNA}/sync")
    await api.post(f"{WORLD}/sync")

    # Cùng mã HAN ở hai nguồn là hai bản ghi khác nhau, mỗi nguồn một tên.
    assert (await records(api, VNA, "airport", search="HAN"))["items"][0]["name"] == "Hanoi"
    world = (await records(api, WORLD, "airport", search="HAN"))["items"]
    assert [item["name"] for item in world] == [
        "Noi Bai International Airport",
        "Tokyo Haneda International Airport",  # khớp chữ "han" trong "Haneda"
    ]
    assert (await api.get(f"{VNA}/summary")).json()["counts"]["country"] == 2
    assert (await api.get(f"{WORLD}/summary")).json()["counts"]["country"] == 3
    assert (await api.get(f"{VNA}/syncs")).json()["total"] == 1
    assert (await api.get(f"{WORLD}/syncs")).json()["total"] == 1
    assert (await api.get("/api/aviation/mars/summary")).status_code == 422


async def test_syncing_again_updates_in_place_without_duplicates(api, sources):
    await api.post(f"{VNA}/sync")
    await api.post(f"{VNA}/sync")

    assert (await records(api, VNA, "airport"))["total"] == 4
    history = (await api.get(f"{VNA}/syncs")).json()
    assert [sync["status"] for sync in history["items"]] == ["completed", "completed"]


async def test_search_ignores_accents_and_matches_city_and_country(api, sources):
    await api.post(f"{VNA}/sync")

    assert await codes(api, VNA, "airport", search="da nang") == ["DAD"]
    assert await codes(api, VNA, "airport", search="japan") == ["HND", "NRT"]
    assert await codes(api, VNA, "city", search="hà nội") == ["HAN"]
    paged = await records(api, VNA, "airport", page=2, page_size=3)
    assert (paged["total"], [r["code"] for r in paged["items"]]) == (4, ["NRT"])
    assert (await api.get(f"{VNA}/records", params={"kind": "plane"})).status_code == 422


async def test_changed_source_structure_fails_the_sync_and_keeps_existing_data(api, sources):
    await api.post(f"{WORLD}/sync")
    sources.pages[aviation.WORLD_AIRPORTS_URL] = lambda _request: httpx.Response(
        200, text="id,ten\n1,Noi Bai\n"
    )

    sync = (await api.post(f"{WORLD}/sync")).json()

    assert sync["status"] == "failed"
    assert "không còn khớp cấu trúc" in sync["error"]
    assert sync["counts"] == {}
    assert (await records(api, WORLD, "airport"))["total"] == 5  # dữ liệu cũ còn nguyên
    history = (await api.get(f"{WORLD}/syncs")).json()
    assert [item["status"] for item in history["items"]] == ["failed", "completed"]


async def test_robots_disallow_stops_the_sync_before_any_data_request(api, sources):
    sources.robots = "User-agent: *\nDisallow: /bin/\n"

    sync = (await api.post(f"{VNA}/sync")).json()

    assert sync["status"] == "failed"
    assert "robots.txt" in sync["error"]
    assert sources.requests_to("/bin/") == 0
    assert (await api.get(f"{VNA}/summary")).json()["counts"] == EMPTY


async def test_export_downloads_every_record_of_a_kind_as_json(api, sources):
    await api.post(f"{VNA}/sync")

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
