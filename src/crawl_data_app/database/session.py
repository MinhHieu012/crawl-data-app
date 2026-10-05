"""Tạo engine/session và khởi tạo schema bằng Alembic."""

import json
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, event, make_url
from sqlalchemy.orm import Session, sessionmaker

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def create_db_engine(url: str) -> Engine:
    parsed = make_url(url)
    is_sqlite = parsed.get_backend_name() == "sqlite"
    if is_sqlite and parsed.database and parsed.database != ":memory:":
        Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False: cột JSON (thể loại) lưu tiếng Việt nguyên dạng, đọc và LIKE được bằng SQL.
    engine = create_engine(
        parsed, json_serializer=lambda value: json.dumps(value, ensure_ascii=False)
    )
    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record) -> None:
            # SQLite mặc định KHÔNG kiểm tra khoá ngoại; phải bật cho từng kết nối.
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

    return engine


def init_db(engine: Engine) -> None:
    """Đưa schema lên phiên bản migration mới nhất. Gọi nhiều lần cũng không sao."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR).replace("%", "%%"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)
