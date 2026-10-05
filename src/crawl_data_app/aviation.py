"""Danh mục hàng không: sân bay, hãng bay, thành phố, quốc gia — từ hai nguồn độc lập.

- `world`: dữ liệu mở toàn thế giới. Sân bay và quốc gia lấy từ OurAirports (phạm vi công cộng), hãng
  bay lấy từ OpenFlights (giấy phép ODbL — dùng lại phải ghi nguồn).
- `vna`: những gì website vietnamairlines.com công bố cho ô chọn điểm đi/đến và ô chọn chương trình
  khách hàng thường xuyên. Điều khoản của website chỉ cho phép dùng cá nhân, phi thương mại.

Mỗi nguồn đồng bộ riêng và chỉ tốn ba request; bản ghi của hai nguồn không trộn vào nhau.
"""

import csv
import io
import json
import re
import unicodedata
from collections import Counter
from collections.abc import Awaitable, Callable, Iterable, Sequence
from datetime import datetime
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from crawl_data_app.core.exceptions import ParseError
from crawl_data_app.core.http_client import Page
from crawl_data_app.database.models import AviationRecord, AviationSync, utcnow

KINDS = ("airport", "airline", "city", "country")

VNA = "https://www.vietnamairlines.com"
VNA_ROUTES_URL = VNA + "/bin/vna/sky/route/flight-route.{lang}-vn.json"
VNA_AIRLINES_URL = VNA + "/graphql/execute.json/vna/freqflyerprogramList"

OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data"
WORLD_COUNTRIES_URL = OURAIRPORTS + "/countries.csv"
WORLD_AIRPORTS_URL = OURAIRPORTS + "/airports.csv"
WORLD_AIRLINES_URL = (
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat"
)

CONTINENTS = {
    "AF": "Africa",
    "AN": "Antarctica",
    "AS": "Asia",
    "EU": "Europe",
    "NA": "North America",
    "OC": "Oceania",
    "SA": "South America",
}

# Tên sân bay của Vietnam Airlines có dạng "Hanoi (HAN)": mã đã có cột riêng nên bỏ phần trong ngoặc.
_CODE_SUFFIX = re.compile(r"\s*\([A-Z0-9]{2,4}\)$")

Fetch = Callable[[str], Awaitable[Page]]


class Record(NamedTuple):
    kind: str
    code: str
    name: str
    city_code: str | None = None  # chỉ sân bay
    country_code: str | None = None  # sân bay và thành phố
    region: str | None = None  # vùng (Vietnam Airlines) hoặc châu lục (thế giới)


class RecordOut(NamedTuple):
    record: AviationRecord
    city_name: str | None
    country_name: str | None


Fetched = list[
    tuple[Record, str | None]
]  # (bản ghi với tên tiếng Anh, tên tiếng Việt nếu nguồn có)


def _fold(text: str) -> str:
    """Bỏ dấu và hoa thường để tìm "ha noi" vẫn ra "Hà Nội"."""
    plain = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return "".join(char for char in plain if not unicodedata.combining(char))


def _collect(url: str, build: Callable[[Callable[..., None]], None]) -> list[Record]:
    """Gom các bản ghi mà `build` đọc được ở `url`; dữ liệu sai cấu trúc thành `ParseError` đọc được."""
    records: dict[tuple[str, str], Record] = {}

    def add(kind: str, code: object, name: object, **fields: str | None) -> None:
        code, name = str(code or "").strip(), str(name or "").strip()
        if not code or not name:
            raise ParseError(f"Bản ghi {kind} thiếu mã hoặc tên tại {url}")
        # Nguồn có thể lặp lại một mã (quốc gia ở nhiều nhánh, hãng bay trùng mã): lấy lần gặp đầu.
        records.setdefault((kind, code), Record(kind, code, name, **fields))

    try:
        build(add)
    except (ValueError, KeyError, TypeError, AttributeError, IndexError, csv.Error) as exc:
        raise ParseError(
            f"Dữ liệu không còn khớp cấu trúc mong đợi tại {url} ({type(exc).__name__}: {exc})"
        ) from exc
    if not records:
        raise ParseError(f"Không có bản ghi nào tại {url}")
    return list(records.values())


# --- Vietnam Airlines ------------------------------------------------------------------------------


def parse_vna_routes(text: str, url: str) -> list[Record]:
    """File điểm đi/đến của Vietnam Airlines: vùng → quốc gia → thành phố → sân bay."""

    def build(add) -> None:
        for region in json.loads(text)["departures"]:
            for country in region["countries"]:
                add("country", country["tagName"], country["title"], region=region["title"])
                for city in country["cities"]:
                    place = {"country_code": country["tagName"], "region": region["title"]}
                    add("city", city["tagName"], city["title"], **place)
                    for airport in city["airports"]:
                        add(
                            "airport",
                            airport["tagName"],
                            _CODE_SUFFIX.sub("", str(airport["title"]).strip()),
                            city_code=city["tagName"],
                            **place,
                        )

    return _collect(url, build)


def parse_vna_airlines(text: str, url: str) -> list[Record]:
    """Danh sách hãng bay có chương trình khách hàng thường xuyên liên kết với Vietnam Airlines."""

    def build(add) -> None:
        for item in json.loads(text)["data"]["freqflyerprogramList"]["items"]:
            add("airline", item["code"], item["name"])

    return _collect(url, build)


async def fetch_vna(fetch: Fetch) -> Fetched:
    english_url, vietnamese_url = (VNA_ROUTES_URL.format(lang=lang) for lang in ("en", "vi"))
    english = parse_vna_routes((await fetch(english_url)).text, english_url)
    vietnamese = {
        (record.kind, record.code): record.name
        for record in parse_vna_routes((await fetch(vietnamese_url)).text, vietnamese_url)
    }
    airlines = parse_vna_airlines((await fetch(VNA_AIRLINES_URL)).text, VNA_AIRLINES_URL)
    return [(record, vietnamese.get((record.kind, record.code))) for record in english + airlines]


# --- Toàn thế giới ---------------------------------------------------------------------------------


def _csv_rows(text: str, columns: Iterable[str]) -> Iterable[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text))
    missing = set(columns) - set(reader.fieldnames or [])
    if missing:
        raise KeyError(f"thiếu cột {sorted(missing)}")
    return reader


def parse_world_countries(text: str, url: str) -> list[Record]:
    """`countries.csv` của OurAirports: mã ISO 3166-1 alpha-2, tên, châu lục."""

    def build(add) -> None:
        for row in _csv_rows(text, ["code", "name", "continent"]):
            add("country", row["code"], row["name"], region=CONTINENTS.get(row["continent"]))

    return _collect(url, build)


def city_code(country: str, municipality: str) -> str | None:
    """Mã thành phố tự đặt cho nguồn thế giới, ví dụ ("VN", "Đà Nẵng") → "VN-da-nang".

    Dữ liệu mở không có mã thành phố chuẩn; thành phố được suy ra từ cột "municipality" của sân bay.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", _fold(municipality)).strip("-")
    return f"{country}-{slug}"[:64] if slug else None


def parse_world_airports(text: str, url: str) -> list[Record]:
    """`airports.csv` của OurAirports → sân bay có mã IATA còn hoạt động, và thành phố của chúng.

    File gốc có hơn 80.000 dòng, phần lớn là bãi đáp nhỏ và sân bay trực thăng không có mã IATA.
    """

    def build(add) -> None:
        columns = ["type", "name", "continent", "iso_country", "municipality", "iata_code"]
        for row in _csv_rows(text, columns):
            if not row["iata_code"] or row["type"] == "closed":
                continue
            country, municipality = row["iso_country"], row["municipality"].strip()
            place = {"country_code": country, "region": CONTINENTS.get(row["continent"])}
            city = city_code(country, municipality)
            if city:
                add("city", city, municipality, **place)
            add("airport", row["iata_code"], row["name"], city_code=city, **place)

    return _collect(url, build)


def parse_world_airlines(text: str, url: str) -> list[Record]:
    """`airlines.dat` của OpenFlights (CSV không tiêu đề) → hãng đang hoạt động có mã IATA.

    Cột: id, tên, tên khác, IATA, ICAO, callsign, quốc gia, đang hoạt động (Y/N).
    """

    def build(add) -> None:
        for row in csv.reader(io.StringIO(text)):
            if len(row) < 8:
                raise ValueError(f"dòng chỉ có {len(row)} cột")
            if row[7] == "Y" and re.fullmatch(r"[A-Z0-9]{2}", row[3]):
                add("airline", row[3], row[1])

    return _collect(url, build)


async def fetch_world(fetch: Fetch) -> Fetched:
    countries = parse_world_countries((await fetch(WORLD_COUNTRIES_URL)).text, WORLD_COUNTRIES_URL)
    airports = parse_world_airports((await fetch(WORLD_AIRPORTS_URL)).text, WORLD_AIRPORTS_URL)
    airlines = parse_world_airlines((await fetch(WORLD_AIRLINES_URL)).text, WORLD_AIRLINES_URL)
    return [(record, None) for record in countries + airports + airlines]


# Tên nguồn (dùng trong API và database) → hàm tải toàn bộ danh mục của nguồn đó qua HTTP client dùng
# chung, tức vẫn tuân thủ robots.txt và nhịp giãn cách request.
SOURCES: dict[str, Callable[[Fetch], Awaitable[Fetched]]] = {"world": fetch_world, "vna": fetch_vna}


# --- Lưu trữ ---------------------------------------------------------------------------------------


class AviationRepository:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def record_sync(
        self,
        source: str,
        started_at: datetime,
        *,
        records: Fetched | tuple[()] = (),
        error: str | None = None,
    ) -> AviationSync:
        """Ghi kết quả một lần đồng bộ vào lịch sử; thành công thì thêm/cập nhật các bản ghi.

        Bản ghi không còn trong nguồn được giữ lại (cột `crawled_at` cho biết lần cuối còn thấy).
        """
        now = utcnow()
        with self._session_factory.begin() as session:
            stored = select(AviationRecord).where(AviationRecord.source == source)
            existing = {(row.kind, row.code): row for row in session.scalars(stored)}
            for record, name_vi in records:
                row = existing.get((record.kind, record.code))
                if row is None:
                    row = AviationRecord(source=source, kind=record.kind, code=record.code)
                    session.add(row)
                row.name, row.name_vi = record.name, name_vi
                row.city_code, row.country_code = record.city_code, record.country_code
                row.region, row.crawled_at = record.region, now
            sync = AviationSync(
                source=source,
                status="failed" if error else "completed",
                counts=dict(Counter(record.kind for record, _ in records)),
                error=error,
                started_at=started_at,
                finished_at=now,
            )
            session.add(sync)
            session.flush()
            session.expunge(sync)
            return sync

    def counts(self, source: str) -> dict[str, int]:
        with self._session_factory() as session:
            rows = session.execute(
                select(AviationRecord.kind, func.count())
                .where(AviationRecord.source == source)
                .group_by(AviationRecord.kind)
            )
            return {kind: 0 for kind in KINDS} | {kind: count for kind, count in rows}

    def records_page(
        self, source: str, kind: str, *, search: str = "", limit: int, offset: int = 0
    ) -> tuple[list[RecordOut], int]:
        """Một trang bản ghi của `kind` (xếp theo mã) kèm tên thành phố và quốc gia."""
        # ponytail: nạp cả loại đang xem (nhiều nhất ~9.000 sân bay) rồi lọc và phân trang trong bộ
        # nhớ, đổi lại tìm được không dấu trên mọi database; chuyển sang cột tìm kiếm + SQL khi dữ
        # liệu lớn hơn một bậc.
        with self._session_factory() as session:
            rows = session.scalars(
                select(AviationRecord)
                .where(
                    AviationRecord.source == source,
                    AviationRecord.kind.in_({kind, "city", "country"}),
                )
                .order_by(AviationRecord.code)
            ).all()
        names = {(row.kind, row.code): row.name for row in rows}
        matched = [
            RecordOut(
                row, names.get(("city", row.city_code)), names.get(("country", row.country_code))
            )
            for row in rows
            if row.kind == kind
        ]
        if needle := _fold(search):
            matched = [
                item
                for item in matched
                if any(
                    needle in _fold(text or "")
                    for text in (
                        item.record.code,
                        item.record.name,
                        item.record.name_vi,
                        item.city_name,
                        item.country_name,
                    )
                )
            ]
        return matched[offset : offset + limit], len(matched)

    def syncs_page(
        self, source: str, *, limit: int, offset: int = 0
    ) -> tuple[Sequence[AviationSync], int]:
        """Lịch sử đồng bộ của một nguồn, mới nhất trước."""
        with self._session_factory() as session:
            mine = AviationSync.source == source
            page = (
                select(AviationSync)
                .where(mine)
                .order_by(AviationSync.id.desc())
                .limit(limit)
                .offset(offset)
            )
            total = session.scalar(select(func.count()).select_from(AviationSync).where(mine)) or 0
            return session.scalars(page).all(), total
