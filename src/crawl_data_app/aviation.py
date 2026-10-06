"""Danh mục hàng không: sân bay, hãng bay, thành phố, quốc gia — từ hai nguồn độc lập.

- `world`: dữ liệu mở toàn thế giới. Sân bay và quốc gia lấy từ OurAirports (phạm vi công cộng), hãng
  bay lấy từ OpenFlights (giấy phép ODbL — dùng lại phải ghi nguồn).
- `vna`: những gì website vietnamairlines.com công bố cho ô chọn điểm đi/đến và ô chọn chương trình
  khách hàng thường xuyên. Điều khoản của website chỉ cho phép dùng cá nhân, phi thương mại.

Mỗi nguồn đồng bộ riêng và chỉ tốn ba request; bản ghi của hai nguồn không trộn vào nhau.
"""

import asyncio
import csv
import io
import json
import logging
import re
import unicodedata
from collections import Counter
from collections.abc import Awaitable, Callable, Iterable
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from crawl_data_app.core.exceptions import CrawlerError, ParseError
from crawl_data_app.core.http_client import Page
from crawl_data_app.core.models import CrawlRequest
from crawl_data_app.database.models import AviationRecord, RunStatus, utcnow
from crawl_data_app.repository import NovelRepository

log = logging.getLogger(__name__)

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


def fold(text: str) -> str:
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
    slug = re.sub(r"[^a-z0-9]+", "-", fold(municipality)).strip("-")
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
# Trang gốc của từng nguồn: ghi vào lịch sử crawl làm URL của job đồng bộ.
HOMES = {"world": OURAIRPORTS, "vna": VNA}
FILES_PER_SYNC = 3  # mỗi hàm tải ở trên gọi `fetch` đúng ba lần — dùng làm mốc tiến độ của job


def crawler_name(source: str) -> str:
    """Tên crawler trong lịch sử crawl (`crawl_runs.crawler`) của một nguồn hàng không."""
    return f"aviation:{source}"


class SyncResult(NamedTuple):
    source: str  # nguồn hàng không; với crawler đồng bộ khác là tên crawler đó
    run_id: int
    status: RunStatus
    counts: dict[str, int]  # số bản ghi theo loại; rỗng nếu không hoàn tất
    error: str | None


def start_sync_run(runs: NovelRepository, source: str) -> int:
    """Ghi nhận một lần đồng bộ sắp chạy vào lịch sử crawl và trả về ID của nó."""
    return runs.start_run(
        CrawlRequest(url=HOMES[source]), crawler=crawler_name(source), total=FILES_PER_SYNC
    )


async def sync(
    source: str,
    get: Fetch,
    runs: NovelRepository,
    store: "AviationRepository",
    *,
    run_id: int | None = None,
) -> SyncResult:
    """Đồng bộ một nguồn: tải ba file (ghi tiến độ sau mỗi file) rồi lưu tất cả trong một
    transaction — dừng hay lỗi giữa chừng thì dữ liệu đã có không bị đụng tới. Kết quả được ghi vào
    lịch sử crawl; lỗi "có chủ đích" (mạng, robots.txt, nguồn đổi cấu trúc) trả về trong kết quả chứ
    không ném ra.

    `get`: hàm tải của HTTP client (tuân thủ robots.txt và nhịp giãn cách). `run_id`: lần chạy đã
    tạo sẵn bằng `start_sync_run` — web UI cần ID trước khi việc tải bắt đầu.
    """
    if run_id is None:
        run_id = start_sync_run(runs, source)

    async def work(fetch: Fetch) -> dict[str, int]:
        return store.save(source, await SOURCES[source](fetch))

    outcome = await run_sync(run_id, get, runs, work, label=f"hàng không ({source})")
    return SyncResult(source, run_id, *outcome)


async def run_sync(
    run_id: int,
    get: Fetch,
    runs: NovelRepository,
    work: Callable[[Fetch], Awaitable[dict[str, int]]],
    *,
    label: str,
) -> tuple[RunStatus, dict[str, int], str | None]:
    """Chạy một lần đồng bộ danh mục đã có dòng lịch sử `run_id`; dùng chung cho mọi crawler kiểu
    "tải vài file rồi ghi đè" (hàng không, tỉnh thành).

    `work` tải các file qua `fetch` nhận được (tiến độ ghi sau mỗi file), lưu tất cả rồi trả về số
    bản ghi theo loại. `label`: tên việc đang làm, để ghi log. Trả về (trạng thái, số bản ghi, lỗi).
    """
    extra = {"run_id": run_id}
    done = 0

    async def fetch(url: str) -> Page:
        nonlocal done
        page = await get(url)
        done += 1
        runs.update_run(run_id, chapters_ok=done)
        log.info("Đã tải %s", url, extra=extra | {"url": url})
        return page

    def finish(status: RunStatus, **values: object) -> None:
        runs.update_run(run_id, status=status, finished_at=utcnow(), **values)

    try:
        counts = await work(fetch)
    except asyncio.CancelledError:
        finish(RunStatus.INTERRUPTED)  # Ctrl+C, tạm dừng/huỷ trên web UI, hoặc tắt server
        raise
    except CrawlerError as exc:
        kind = "parse" if isinstance(exc, ParseError) else "request"
        log.error("Dừng đồng bộ %s: %s", label, exc, extra=extra | {"kind": kind})
        finish(RunStatus.FAILED, error=str(exc))
        return RunStatus.FAILED, {}, str(exc)
    except Exception as exc:
        finish(RunStatus.FAILED, error=f"Lỗi ngoài dự kiến: {type(exc).__name__}: {exc}")
        raise
    finish(RunStatus.COMPLETED, result=counts)
    log.info("Đồng bộ %s xong: %s", label, counts, extra=extra)
    return RunStatus.COMPLETED, counts, None


# --- Lưu trữ ---------------------------------------------------------------------------------------


class AviationRepository:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def save(self, source: str, records: Fetched) -> dict[str, int]:
        """Thêm/cập nhật các bản ghi của một nguồn trong một transaction; trả về số bản ghi theo loại.

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
        return dict(Counter(record.kind for record, _ in records))

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
        if needle := fold(search):
            matched = [
                item
                for item in matched
                if any(
                    needle in fold(text or "")
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
