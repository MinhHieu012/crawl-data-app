"""Danh mục 34 tỉnh, thành phố của Việt Nam sau đợt sáp nhập năm 2025, kèm phường/xã trực thuộc.

Nguồn: bộ dữ liệu mở `thanglequoc/vietnamese-provinces-database` trên GitHub (giấy phép MIT) — một
file JSON gồm mọi tỉnh thành, mỗi tỉnh kèm danh sách phường/xã. Một lần đồng bộ là một request.
"""

import json
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from crawl_data_app.aviation import Fetch, SyncResult, fold, run_sync
from crawl_data_app.core.exceptions import ParseError
from crawl_data_app.core.models import CrawlRequest
from crawl_data_app.database.models import Province, Ward, utcnow
from crawl_data_app.repository import NovelRepository

CRAWLER = "provinces"  # tên crawler trong lịch sử crawl (`crawl_runs.crawler`)
HOME = "https://github.com/thanglequoc/vietnamese-provinces-database"  # URL của job đồng bộ
DATA_URL = (
    "https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master"
    "/json/full_json_generated_data_vn_units.json"
)


class ProvinceRecord(NamedTuple):
    """Một tỉnh thành đọc từ nguồn; tên trường trùng tên cột của bảng `vn_provinces`."""

    code: str  # mã đơn vị hành chính, ví dụ "01"
    name: str  # "Hà Nội"
    name_en: str
    full_name: str  # "Thành phố Hà Nội"
    full_name_en: str
    code_name: str  # "ha_noi"
    unit: str  # "Thành phố" hoặc "Tỉnh"
    postal_code_prefix: str | None  # "10, 11, 12, 13, 14"
    ward_count: int


class WardRecord(NamedTuple):
    """Một phường/xã/đặc khu đọc từ nguồn; tên trường trùng tên cột của bảng `vn_wards`."""

    code: str  # "00004"
    province_code: str
    name: str  # "Ba Đình"
    name_en: str
    full_name: str  # "Phường Ba Đình"
    full_name_en: str
    code_name: str  # "ba_dinh"
    unit: str  # "Phường", "Xã" hoặc "Đặc khu"
    postal_code: str | None


class WardOut(NamedTuple):
    ward: Ward
    province_name: str | None


def _text(item: dict, key: str) -> str:
    value = item[key]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"trường {key} trống")
    return value.strip()


def _names(item: dict) -> dict[str, str]:
    """Các trường tỉnh thành và phường/xã có chung."""
    return {
        "code": _text(item, "Code"),
        "name": _text(item, "Name"),
        "name_en": _text(item, "NameEn"),
        "full_name": _text(item, "FullName"),
        "full_name_en": _text(item, "FullNameEn"),
        "code_name": _text(item, "CodeName"),
        "unit": _text(item, "AdministrativeUnitShortName"),
    }


def parse_units(text: str, url: str) -> tuple[list[ProvinceRecord], list[WardRecord]]:
    """File JSON của nguồn: mảng tỉnh thành, mỗi tỉnh kèm mảng `Wards` → (tỉnh thành, phường/xã)."""
    provinces: list[ProvinceRecord] = []
    wards: list[WardRecord] = []
    try:
        for item in json.loads(text):
            province = ProvinceRecord(
                **_names(item),
                postal_code_prefix=(item.get("PostalCodePrefix") or "").strip() or None,
                ward_count=len(item["Wards"]),
            )
            provinces.append(province)
            wards += [
                WardRecord(
                    **_names(ward),
                    province_code=province.code,
                    postal_code=(ward.get("PostalCode") or "").strip() or None,
                )
                for ward in item["Wards"]
            ]
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise ParseError(
            f"Dữ liệu không còn khớp cấu trúc mong đợi tại {url} ({type(exc).__name__}: {exc})"
        ) from exc
    if not provinces:
        raise ParseError(f"Không có tỉnh thành nào tại {url}")
    return provinces, wards


def _matches(needle: str, row: Province | Ward) -> bool:
    return any(
        needle in fold(text) for text in (row.code, row.full_name, row.full_name_en, row.code_name)
    )


class ProvinceRepository:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def save(self, provinces: list[ProvinceRecord], wards: list[WardRecord]) -> dict[str, int]:
        """Thêm/cập nhật theo mã trong một transaction; trả về số bản ghi theo loại (thành `result`
        của job).

        Đơn vị không còn trong nguồn được giữ lại (cột `crawled_at` cho biết lần cuối còn thấy).
        """
        now = utcnow()
        with self._session_factory.begin() as session:
            for model, records in ((Province, provinces), (Ward, wards)):
                existing = {row.code: row for row in session.scalars(select(model))}
                for record in records:
                    row = existing.get(record.code)
                    if row is None:
                        row = existing[record.code] = model(code=record.code)
                        session.add(row)
                    for field, value in record._asdict().items():
                        setattr(row, field, value)
                    row.crawled_at = now
        return {"province": len(provinces), "ward": len(wards)}

    def counts(self) -> dict[str, int]:
        """Số bản ghi đang có, cùng khoá với `result` của job."""
        with self._session_factory() as session:
            return {
                kind: session.scalar(select(func.count()).select_from(model)) or 0
                for kind, model in (("province", Province), ("ward", Ward))
            }

    def page(self, *, search: str = "", limit: int, offset: int = 0) -> tuple[list[Province], int]:
        """Một trang tỉnh thành (xếp theo mã) và tổng số dòng khớp; tìm không dấu theo mã hoặc tên."""
        # ponytail: lọc và phân trang trong bộ nhớ vì cả bảng chỉ vài chục dòng.
        with self._session_factory() as session:
            rows = list(session.scalars(select(Province).order_by(Province.code)))
        if needle := fold(search):
            rows = [row for row in rows if _matches(needle, row)]
        return rows[offset : offset + limit], len(rows)

    def wards_page(
        self, *, province_code: str = "", search: str = "", limit: int, offset: int = 0
    ) -> tuple[list[WardOut], int]:
        """Một trang phường/xã (xếp theo mã) kèm tên tỉnh thành; lọc theo tỉnh, tìm không dấu theo
        mã hoặc tên.
        """
        # ponytail: nạp các phường/xã cần xem (nhiều nhất ~3.300 dòng) rồi tìm và phân trang trong
        # bộ nhớ, như `AviationRepository.records_page`; chuyển sang cột tìm kiếm + SQL khi chậm.
        query = select(Ward).order_by(Ward.code)
        if province_code:
            query = query.where(Ward.province_code == province_code)
        with self._session_factory() as session:
            rows = list(session.scalars(query))
            names = dict(session.execute(select(Province.code, Province.full_name)).all())
        if needle := fold(search):
            rows = [row for row in rows if _matches(needle, row)]
        page = rows[offset : offset + limit]
        return [WardOut(row, names.get(row.province_code)) for row in page], len(rows)


def start_sync_run(runs: NovelRepository) -> int:
    """Ghi nhận một lần đồng bộ sắp chạy vào lịch sử crawl và trả về ID của nó."""
    return runs.start_run(CrawlRequest(url=HOME), crawler=CRAWLER, total=1)


async def sync(
    get: Fetch, runs: NovelRepository, store: ProvinceRepository, *, run_id: int | None = None
) -> SyncResult:
    """Tải file của nguồn rồi lưu trong một transaction; lỗi hay dừng giữa chừng không đụng tới dữ
    liệu đã có. Cùng quy ước với `aviation.sync` (kết quả ghi vào lịch sử crawl, lỗi "có chủ đích"
    trả về trong kết quả).
    """
    if run_id is None:
        run_id = start_sync_run(runs)

    async def work(fetch: Fetch) -> dict[str, int]:
        return store.save(*parse_units((await fetch(DATA_URL)).text, DATA_URL))

    return SyncResult(
        CRAWLER, run_id, *await run_sync(run_id, get, runs, work, label="tỉnh thành Việt Nam")
    )
