"""Parser danh mục ngân hàng Việt Nam, chạy trên fixture tự viết theo đúng cấu trúc của nguồn."""

import pytest

from crawl_data_app.banks import BankRecord, parse_banks
from crawl_data_app.core.exceptions import ParseError

URL = "https://nguon.test/du-lieu"


def test_banks_are_read_with_bin_swift_and_supported_features(load_fixture):
    banks = parse_banks(load_fixture("banks/vn-banks.json"), URL)

    assert banks[0] == BankRecord(
        bin="970415",
        code="ICB",
        name="Ngân hàng TMCP Công thương Việt Nam",
        short_name="VietinBank",
        swift_code="ICBVVNVX",
        logo="https://cdn.nguon.test/img/ICB.png",
        transfer_supported=True,
        lookup_supported=True,
    )
    assert [(b.bin, b.swift_code, b.logo, b.lookup_supported) for b in banks[1:]] == [
        ("970436", "BFTVVNVX", "https://cdn.nguon.test/img/VCB.png", True),
        ("546034", None, None, False),  # nguồn để trống mã SWIFT và logo
    ]


@pytest.mark.parametrize(
    "text",
    [
        "không phải JSON",
        "[]",  # không còn bọc trong `data`
        '{"code": "00", "data": []}',
        '{"code": "00", "data": [{"bin": "970415", "code": "ICB"}]}',  # thiếu trường
        '{"data": [{"bin": "", "code": "ICB", "name": "Mẫu", "shortName": "Mẫu"}]}',  # BIN trống
        '{"data": [{"bin": 970415, "code": "ICB", "name": "Mẫu", "shortName": "Mẫu"}]}',  # BIN là số
    ],
)
def test_changed_structure_is_a_readable_parse_error(text):
    with pytest.raises(ParseError, match="nguon.test"):
        parse_banks(text, URL)
