"""Parser danh mục hàng không, chạy trên fixture tự viết theo đúng cấu trúc của từng nguồn."""

import pytest

from crawl_data_app.aviation import (
    Record,
    city_code,
    parse_vna_airlines,
    parse_vna_routes,
    parse_world_airlines,
    parse_world_airports,
    parse_world_countries,
)
from crawl_data_app.core.exceptions import ParseError

URL = "https://nguon.test/du-lieu"


def of_kind(records: list[Record], kind: str) -> list[Record]:
    return [record for record in records if record.kind == kind]


# --- Vietnam Airlines ------------------------------------------------------------------------------


def test_vna_routes_become_countries_cities_and_airports(load_fixture):
    records = parse_vna_routes(load_fixture("aviation/vna-routes.en.json"), URL)

    assert of_kind(records, "country") == [
        Record("country", "VN", "Vietnam", region="VIETNAM"),
        Record("country", "JP", "Japan", region="NORTH EAST ASIA"),
    ]
    assert Record("city", "TYO", "Tokyo", country_code="JP", region="NORTH EAST ASIA") in records
    # Tên sân bay bỏ phần "(MÃ)"; một thành phố có thể có nhiều sân bay.
    assert [(r.code, r.name, r.city_code, r.country_code) for r in of_kind(records, "airport")] == [
        ("HAN", "Hanoi", "HAN", "VN"),
        ("DAD", "Da Nang", "DAD", "VN"),
        ("NRT", "Tokyo Narita", "TYO", "JP"),
        ("HND", "Tokyo Haneda", "TYO", "JP"),
    ]
    # Fixture lặp lại Japan → Tokyo → NRT ở hai nhánh, như nguồn thật: mỗi mã chỉ còn một bản ghi.
    keys = [(r.kind, r.code) for r in records]
    assert len(keys) == len(set(keys))


def test_vna_airlines_are_read_from_the_frequent_flyer_list(load_fixture):
    assert parse_vna_airlines(load_fixture("aviation/vna-airlines.json"), URL) == [
        Record("airline", "AF", "Air France"),
        Record("airline", "KE", "Korean Air"),
    ]


@pytest.mark.parametrize(
    "text",
    [
        "<html>trang bảo trì</html>",  # không phải JSON
        '{"routes": []}',  # đổi tên khoá
        '{"departures": []}',  # không có bản ghi nào
        '{"departures": [{"title": "A", "countries": [{"tagName": "", "title": "X", "cities": []}]}]}',
    ],
)
def test_unexpected_vna_structure_is_a_parse_error_not_empty_data(text):
    with pytest.raises(ParseError, match="nguon.test"):
        parse_vna_routes(text, URL)


# --- Toàn thế giới ---------------------------------------------------------------------------------


def test_world_countries_carry_their_continent(load_fixture):
    assert parse_world_countries(load_fixture("aviation/world-countries.csv"), URL) == [
        Record("country", "VN", "Vietnam", region="Asia"),
        Record("country", "JP", "Japan", region="Asia"),
        Record("country", "FR", "France", region="Europe"),
    ]


def test_world_airports_keep_only_open_ones_with_an_iata_code(load_fixture):
    records = parse_world_airports(load_fixture("aviation/world-airports.csv"), URL)

    # Bỏ bãi đáp không có mã IATA và sân bay đã đóng cửa.
    assert [
        (r.code, r.name, r.city_code, r.country_code, r.region) for r in of_kind(records, "airport")
    ] == [
        ("HAN", "Noi Bai International Airport", "VN-hanoi", "VN", "Asia"),
        ("DAD", "Da Nang International Airport", "VN-da-nang", "VN", "Asia"),
        ("NRT", "Narita International Airport", "JP-tokyo", "JP", "Asia"),
        ("HND", "Tokyo Haneda International Airport", "JP-tokyo", "JP", "Asia"),
        ("YYY", "Airfield Without City", None, "FR", "Europe"),
    ]


def test_world_cities_are_derived_from_airports_one_per_country_and_name(load_fixture):
    records = parse_world_airports(load_fixture("aviation/world-airports.csv"), URL)

    # Hai sân bay của Tokyo chung một thành phố; sân bay không ghi thành phố thì không sinh ra dòng nào.
    assert of_kind(records, "city") == [
        Record("city", "VN-hanoi", "Hanoi", country_code="VN", region="Asia"),
        Record("city", "VN-da-nang", "Đà Nẵng", country_code="VN", region="Asia"),
        Record("city", "JP-tokyo", "Tokyo", country_code="JP", region="Asia"),
    ]


def test_city_code_is_ascii_stable_and_fits_the_column():
    assert city_code("VN", "Hồ Chí Minh City") == "VN-ho-chi-minh-city"
    assert city_code("VN", "Hanoi (Soc Son)") == "VN-hanoi-soc-son"
    assert city_code("JP", "東京") is None  # không còn chữ Latin nào để làm mã
    assert len(city_code("US", "a" * 200)) == 64


def test_world_airlines_keep_active_ones_with_an_iata_code_once(load_fixture):
    # Bỏ hãng đã ngừng bay, hãng không có mã IATA và dòng "Unknown"; mã trùng thì lấy dòng đầu.
    assert parse_world_airlines(load_fixture("aviation/world-airlines.dat"), URL) == [
        Record("airline", "AF", "Air France"),
        Record("airline", "VN", "Vietnam Airlines"),
    ]


@pytest.mark.parametrize(
    ("parse", "text"),
    [
        (parse_world_countries, "id,ma,ten\n1,VN,Vietnam\n"),  # đổi tên cột
        (parse_world_airports, "<html>404</html>"),
        (
            parse_world_airports,
            '"type","name","continent","iso_country","municipality","iata_code"\n',
        ),
        (parse_world_airlines, "1,Chỉ có ba cột,AF\n"),
    ],
)
def test_unexpected_world_structure_is_a_parse_error_not_empty_data(parse, text):
    with pytest.raises(ParseError, match="nguon.test"):
        parse(text, URL)
