"""Danh mục ngân hàng Việt Nam: tên, tên viết tắt, mã BIN (đầu số thẻ/tài khoản Napas), mã SWIFT.

Nguồn: API công khai của VietQR (`api.vietqr.io/v2/banks`, không cần khoá) — một file JSON gồm mọi
ngân hàng. Một lần đồng bộ là một request.
"""

import json
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from crawl_data_app.aviation import Fetch, SyncResult, fold, run_sync
from crawl_data_app.core.exceptions import ParseError
from crawl_data_app.core.models import CrawlRequest
from crawl_data_app.database.models import Bank, utcnow
from crawl_data_app.repository import NovelRepository

CRAWLER = "banks"  # tên crawler trong lịch sử crawl (`crawl_runs.crawler`)
HOME = "https://www.vietqr.io/danh-sach-api/api-danh-sach-ma-ngan-hang"  # URL của job đồng bộ
DATA_URL = "https://api.vietqr.io/v2/banks"


class BankRecord(NamedTuple):
    """Một ngân hàng đọc từ nguồn; tên trường trùng tên cột của bảng `vn_banks`."""

    bin: str  # "970415"
    code: str  # mã ngắn của nguồn: "ICB"
    name: str  # "Ngân hàng TMCP Công thương Việt Nam"
    short_name: str  # "VietinBank"
    swift_code: str | None  # "ICBVVNVX"
    logo: str | None  # URL ảnh logo trên CDN của nguồn
    transfer_supported: bool  # nhận chuyển khoản nhanh qua mã QR
    lookup_supported: bool  # tra được tên chủ tài khoản


def _text(item: dict, key: str) -> str:
    value = item[key]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"trường {key} trống")
    return value.strip()


def _optional(item: dict, key: str) -> str | None:
    return (item.get(key) or "").strip() or None


def parse_banks(text: str, url: str) -> list[BankRecord]:
    """Câu trả lời của nguồn: `{"code": "00", "data": [ngân hàng, …]}` → danh sách ngân hàng."""
    try:
        banks = [
            BankRecord(
                bin=_text(item, "bin"),
                code=_text(item, "code"),
                name=_text(item, "name"),
                short_name=_text(item, "shortName"),
                swift_code=_optional(item, "swift_code"),
                logo=_optional(item, "logo"),
                transfer_supported=bool(item.get("transferSupported")),
                lookup_supported=bool(item.get("lookupSupported")),
            )
            for item in json.loads(text)["data"]
        ]
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise ParseError(
            f"Dữ liệu không còn khớp cấu trúc mong đợi tại {url} ({type(exc).__name__}: {exc})"
        ) from exc
    if not banks:
        raise ParseError(f"Không có ngân hàng nào tại {url}")
    return banks


class BankRepository:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def save(self, banks: list[BankRecord]) -> dict[str, int]:
        """Thêm/cập nhật theo mã BIN trong một transaction; trả về số bản ghi (thành `result` của
        job).

        Ngân hàng không còn trong nguồn được giữ lại (cột `crawled_at` cho biết lần cuối còn thấy).
        """
        now = utcnow()
        with self._session_factory.begin() as session:
            existing = {row.bin: row for row in session.scalars(select(Bank))}
            for record in banks:
                row = existing.get(record.bin)
                if row is None:
                    row = existing[record.bin] = Bank(bin=record.bin)
                    session.add(row)
                for field, value in record._asdict().items():
                    setattr(row, field, value)
                row.crawled_at = now
        return {"bank": len(banks)}

    def count(self) -> int:
        with self._session_factory() as session:
            return session.scalar(select(func.count()).select_from(Bank)) or 0

    def page(self, *, search: str = "", limit: int, offset: int = 0) -> tuple[list[Bank], int]:
        """Một trang ngân hàng (xếp theo tên viết tắt) và tổng số dòng khớp; tìm không dấu theo mã
        BIN, mã, tên hoặc mã SWIFT.
        """
        # ponytail: lọc và phân trang trong bộ nhớ vì cả bảng chỉ vài chục dòng.
        with self._session_factory() as session:
            rows = list(session.scalars(select(Bank).order_by(func.lower(Bank.short_name))))
        if needle := fold(search):
            rows = [
                row
                for row in rows
                if any(
                    needle in fold(text)
                    for text in (row.bin, row.code, row.name, row.short_name, row.swift_code or "")
                )
            ]
        return rows[offset : offset + limit], len(rows)


def start_sync_run(runs: NovelRepository) -> int:
    """Ghi nhận một lần đồng bộ sắp chạy vào lịch sử crawl và trả về ID của nó."""
    return runs.start_run(CrawlRequest(url=HOME), crawler=CRAWLER, total=1)


async def sync(
    get: Fetch, runs: NovelRepository, store: BankRepository, *, run_id: int | None = None
) -> SyncResult:
    """Tải file của nguồn rồi lưu trong một transaction; lỗi hay dừng giữa chừng không đụng tới dữ
    liệu đã có. Cùng quy ước với `aviation.sync` (kết quả ghi vào lịch sử crawl, lỗi "có chủ đích"
    trả về trong kết quả).
    """
    if run_id is None:
        run_id = start_sync_run(runs)

    async def work(fetch: Fetch) -> dict[str, int]:
        return store.save(parse_banks((await fetch(DATA_URL)).text, DATA_URL))

    return SyncResult(
        CRAWLER, run_id, *await run_sync(run_id, get, runs, work, label="ngân hàng Việt Nam")
    )
