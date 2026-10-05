"""Migration Alembic: tạo đúng schema của ORM, chạy lại được, và ràng buộc thật sự có hiệu lực."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.exc import IntegrityError

from crawl_data_app.database.models import Base, Chapter, Novel, Source
from crawl_data_app.database.session import create_db_engine, init_db


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
