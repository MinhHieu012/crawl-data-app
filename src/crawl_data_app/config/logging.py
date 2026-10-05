"""Logging có cấu trúc: console đọc bằng mắt (Rich), file JSON Lines để grep/phân tích lại."""

import json
import logging
from contextvars import ContextVar
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

from rich.console import Console
from rich.logging import RichHandler

from crawl_data_app.config.settings import LogSettings

LOG_FILE = "crawler.log"
# Thuộc tính có sẵn của LogRecord; mọi thứ ngoài danh sách này là dữ liệu truyền qua `extra=`.
_RESERVED = frozenset(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}

# ID lần crawl đang chạy trong task hiện tại (CrawlService đặt): mọi dòng log trong file — kể cả
# log của tầng HTTP — đều kèm `run_id`, nhờ đó lọc được log theo từng lần crawl.
current_run: ContextVar[int | None] = ContextVar("current_run", default=None)


class JsonFormatter(logging.Formatter):
    """Mỗi dòng log là một object JSON, giữ nguyên các trường `extra` (url, chương, ...)."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if (run_id := current_run.get()) is not None:
            entry["run_id"] = run_id
        entry.update({k: v for k, v in record.__dict__.items() if k not in _RESERVED})
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def setup_logging(settings: LogSettings, console: Console) -> None:
    log_dir = Path(settings.dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        log_dir / LOG_FILE, maxBytes=5_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(JsonFormatter())
    logging.basicConfig(
        level=settings.level,
        format="%(message)s",
        datefmt="%H:%M:%S",
        handlers=[RichHandler(console=console, show_path=False, markup=False), file_handler],
        force=True,
    )
    for noisy in ("httpx", "httpcore", "alembic", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def read_logs(
    log_dir: str | Path,
    *,
    level: str = "",
    kind: str = "",
    run_id: int | None = None,
    search: str = "",
    limit: int = 200,
) -> list[dict[str, object]]:
    """Các dòng log khớp bộ lọc, mới nhất trước. `search` tìm trong cả dòng (thông báo, URL, logger...)."""
    # ponytail: mỗi lần gọi đọc lại cả file hiện tại (tối đa 5 MB do xoay vòng) và không xem các file đã
    # xoay; đọc ngược theo khối hoặc đưa log vào database nếu cần lịch sử dài hay gọi dày hơn vài giây/lần.
    try:
        text = (Path(log_dir) / LOG_FILE).read_text(encoding="utf-8", errors="replace")
    except OSError:  # chưa có file, hoặc file đang được xoay vòng
        return []
    needle = search.casefold()
    entries: list[dict[str, object]] = []
    for line in reversed(text.splitlines()):
        if needle and needle not in line.casefold():
            continue
        try:
            entry = json.loads(line)
            # "+0700" → "+07:00": dạng ISO 8601 mà trình duyệt nào cũng đọc được.
            entry["time"] = datetime.fromisoformat(entry["time"]).isoformat()
        except (ValueError, KeyError, TypeError):
            continue  # dòng đang ghi dở hoặc không phải JSON của crawler
        if (
            (level and entry.get("level") != level)
            or (kind and entry.get("kind") != kind)
            or (run_id is not None and entry.get("run_id") != run_id)
        ):
            continue
        entries.append(entry)
        if len(entries) == limit:
            break
    return entries
