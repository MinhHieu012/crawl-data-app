"""Parser danh mục tỉnh thành Việt Nam, chạy trên fixture tự viết theo đúng cấu trúc của nguồn."""

import pytest

from crawl_data_app.core.exceptions import ParseError
from crawl_data_app.provinces import ProvinceRecord, parse_provinces

URL = "https://nguon.test/du-lieu"


def test_provinces_are_read_with_unit_postal_prefix_and_ward_count(load_fixture):
    records = parse_provinces(load_fixture("provinces/vn-units.json"), URL)

    assert records[0] == ProvinceRecord(
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
    assert [(r.code, r.unit, r.postal_code_prefix, r.ward_count) for r in records[1:]] == [
        ("04", "Tỉnh", None, 1),  # nguồn để trống đầu mã bưu chính
        ("48", "Thành phố", "50", 1),
    ]


@pytest.mark.parametrize(
    "text",
    [
        "không phải JSON",
        "[]",
        '{"Code": "01"}',  # không còn là mảng tỉnh thành
        '[{"Code": "01", "Name": "Hà Nội"}]',  # thiếu trường
        '[{"Code": "", "Name": "Hà Nội"}]',  # mã trống
    ],
)
def test_changed_structure_is_a_readable_parse_error(text):
    with pytest.raises(ParseError, match="nguon.test"):
        parse_provinces(text, URL)
