"""Migration Alembic: tạo đúng schema của ORM, chạy lại được, và ràng buộc thật sự có hiệu lực."""

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from crawl_data_app.database.models import Base, Chapter, CrawlRun, Novel, Source
from crawl_data_app.database.session import (
    MIGRATIONS_DIR,
    create_db_engine,
    init_db,
    make_session_factory,
)


@pytest.fixture
def engine(tmp_path):
    # Thư mục cha chưa tồn tại: create_db_engine phải tự tạo (như `data/` ở lần chạy đầu tiên).
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'chua' / 'co' / 'm.db').as_posix()}")
    yield engine
    engine.dispose()


def add_novel(session) -> Novel:
    source = Source(name="nguon")
    session.add(source)
    session.flush()
    novel = Novel(source_id=source.id, slug="truyen-a", url="https://x.test/truyen-a/", title="A")
    session.add(novel)
    session.flush()
    return novel


def test_migrations_produce_exactly_the_orm_schema(engine):
    init_db(engine)

    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)

    # Sửa model mà quên `alembic revision --autogenerate` thì test này đỏ.
    assert differences == []


def test_init_db_is_idempotent(engine):
    init_db(engine)
    init_db(engine)

    tables = set(inspect(engine).get_table_names())
    assert {"sources", "novels", "chapters", "crawl_runs", "alembic_version"} <= tables


def db_session(engine):
    return make_session_factory(engine)()


def test_upgrade_carries_synced_vietnam_airlines_rows_into_the_aviation_tables(engine):
    """Database đang ở 0003 (đã đồng bộ Vietnam Airlines) lên bản mới nhất không mất gì."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR).replace("%", "%%"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0003")
        connection.execute(
            text(
                "INSERT INTO vna_records (kind, code, name, name_vi, city_code, country_code,"
                " region, crawled_at) VALUES ('airport', 'HAN', 'Hanoi', 'Hà Nội', 'HAN', 'VN',"
                " 'VIETNAM', '2026-10-05 15:13:33')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO vna_syncs (id, status, counts, error, started_at, finished_at)"
                " VALUES (7, 'completed', '{\"airport\": 1}', NULL, '2026-10-05 15:13:26',"
                " '2026-10-05 15:13:33'), (8, 'failed', '{}', 'HTTP 503', '2026-10-05 16:00:00',"
                " '2026-10-05 16:00:02')"
            )
        )
        # Một lần crawl truyện có sẵn: sau migration phải mang crawler "novel".
        connection.execute(
            text(
                "INSERT INTO crawl_runs (url, with_chapters, status, chapters_total, chapters_ok,"
                " chapters_failed, chapters_skipped, started_at) VALUES ('https://x.test/a/', 1,"
                " 'completed', 5, 5, 0, 0, '2026-10-05 10:00:00')"
            )
        )

    init_db(engine)

    with db_session(engine) as session:
        records = session.execute(
            text("SELECT source, kind, code, name_vi, country_code FROM aviation_records")
        ).all()
        runs = session.scalars(select(CrawlRun).order_by(CrawlRun.id)).all()
    assert records == [("vna", "airport", "HAN", "Hà Nội", "VN")]
    # Lịch sử đồng bộ thành job: lần thành công mang số bản ghi, lần thất bại mang lý do.
    assert [(run.crawler, run.status, run.chapters_ok, run.result, run.error) for run in runs] == [
        ("novel", "completed", 5, None, None),
        ("aviation:vna", "completed", 3, {"airport": 1}, None),
        ("aviation:vna", "failed", 0, None, "HTTP 503"),
    ]
    assert runs[1].url == "https://www.vietnamairlines.com"
    assert {"vna_records", "vna_syncs", "aviation_syncs"}.isdisjoint(
        inspect(engine).get_table_names()
    )


def test_duplicate_novel_is_rejected_by_the_database(db):
    with db.begin() as session:
        source_id = add_novel(session).source_id

    with pytest.raises(IntegrityError), db.begin() as session:
        session.add(
            Novel(source_id=source_id, slug="truyen-a", url="https://y.test/", title="Bản sao")
        )


def test_duplicate_chapter_is_rejected_by_the_database(db):
    with db.begin() as session:
        novel_id = add_novel(session).id
        session.add(Chapter(novel_id=novel_id, slug="chuong-1", number=1, title="1", url="u"))

    with pytest.raises(IntegrityError), db.begin() as session:
        session.add(Chapter(novel_id=novel_id, slug="chuong-1", number=2, title="trùng", url="u"))


def test_foreign_keys_are_enforced_on_sqlite(db):
    with pytest.raises(IntegrityError), db.begin() as session:
        session.add(Chapter(novel_id=999, slug="chuong-1", number=1, title="mồ côi", url="u"))


def test_deleting_a_novel_removes_its_chapters(db):
    with db.begin() as session:
        novel_id = add_novel(session).id
        session.add(Chapter(novel_id=novel_id, slug="chuong-1", number=1, title="1", url="u"))

    with db.begin() as session:
        session.execute(delete(Novel).where(Novel.id == novel_id))

    with db() as session:
        assert session.scalar(select(func.count()).select_from(Chapter)) == 0
