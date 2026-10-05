"""Môi trường Alembic. URL database lấy từ cấu hình ứng dụng (DATABASE_URL), không ghi trong alembic.ini."""

from alembic import context
from sqlalchemy import Connection

from novel_crawler.config.settings import get_settings
from novel_crawler.database.models import Base
from novel_crawler.database.session import create_db_engine


def run_migrations(connection: Connection) -> None:
    # render_as_batch: SQLite không ALTER được phần lớn ràng buộc; Alembic sẽ tạo bảng mới rồi chép dữ liệu.
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if (shared := context.config.attributes.get("connection")) is not None:
    run_migrations(shared)  # gọi từ init_db() hoặc test: dùng lại kết nối đang mở
else:  # gọi từ dòng lệnh `alembic ...`
    with create_db_engine(get_settings().database.url).connect() as connection:
        run_migrations(connection)
