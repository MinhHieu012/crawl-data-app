"""Parser danh mục tỉnh thành Việt Nam, chạy trên fixture tự viết theo đúng cấu trúc của nguồn."""

import pytest

from crawl_data_app.core.exceptions import ParseError
from crawl_data_app.provinces import ProvinceRecord, WardRecord, parse_units

URL = "https://nguon.test/du-lieu"


def test_provinces_are_read_with_unit_postal_prefix_and_ward_count(load_fixture):
    provinces, _ = parse_units(load_fixture("provinces/vn-units.json"), URL)

    assert provinces[0] == ProvinceRecord(
        code="01",
        name="Hà Nội",
        name_en="Hanoi",
        full_name="Thành phố Hà Nội",
        full_name_en="Hanoi City",
        code_name="ha_noi",
        unit="Thành phố",
        postal_code_prefix="10, 11, 12, 13, 14",
        ward_count=2,
    )
    assert [(r.code, r.unit, r.postal_code_prefix, r.ward_count) for r in provinces[1:]] == [
        ("04", "Tỉnh", None, 1),  # nguồn để trống đầu mã bưu chính
        ("48", "Thành phố", "50", 1),
    ]


def test_wards_are_read_under_their_province(load_fixture):
    _, wards = parse_units(load_fixture("provinces/vn-units.json"), URL)

    assert wards[0] == WardRecord(
        code="00004",
        province_code="01",
        name="Ba Đình",
        name_en="Ba Dinh",
        full_name="Phường Ba Đình",
        full_name_en="Ba Dinh Ward",
        code_name="ba_dinh",
        unit="Phường",
        postal_code="11120",
    )
    assert [(w.code, w.province_code, w.unit, w.postal_code) for w in wards[1:]] == [
        ("00070", "01", "Phường", None),  # nguồn để trống mã bưu chính
        ("01279", "04", "Xã", "21300"),
        ("20333", "48", "Đặc khu", "50900"),
    ]


@pytest.mark.parametrize(
    "text",
    [
        "không phải JSON",
        "[]",
        '{"Code": "01"}',  # không còn là mảng tỉnh thành
        '[{"Code": "01", "Name": "Hà Nội"}]',  # thiếu trường
        '[{"Code": "", "Name": "Hà Nội"}]',  # mã trống
        # Tỉnh đủ trường nhưng phường/xã thiếu tên.
        '[{"Code": "01", "Name": "Hà Nội", "NameEn": "Hanoi", "FullName": "Thành phố Hà Nội",'
        ' "FullNameEn": "Hanoi City", "CodeName": "ha_noi",'
        ' "AdministrativeUnitShortName": "Thành phố", "Wards": [{"Code": "00004"}]}]',
    ],
)
def test_changed_structure_is_a_readable_parse_error(text):
    with pytest.raises(ParseError, match="nguon.test"):
        parse_units(text, URL)
