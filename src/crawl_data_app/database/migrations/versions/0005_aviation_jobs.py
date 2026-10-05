"""crawl_runs.crawler, crawl_runs.result; aviation syncs become runs

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-06 00:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Trang gốc của từng nguồn hàng không — giống `aviation.HOMES` tại thời điểm viết migration này.
HOMES = {
    'world': 'https://davidmegginson.github.io/ourairports-data',
    'vna': 'https://www.vietnamairlines.com',
}
FILES_PER_SYNC = 3

syncs = sa.table(
    'aviation_syncs',
    sa.column('id', sa.Integer),
    sa.column('source', sa.String),
    sa.column('status', sa.String),
    sa.column('counts', sa.JSON),
    sa.column('error', sa.Text),
    sa.column('started_at', sa.DateTime),
    sa.column('finished_at', sa.DateTime),
)
runs = sa.table(
    'crawl_runs',
    sa.column('url', sa.String),
    sa.column('crawler', sa.String),
    sa.column('with_chapters', sa.Boolean),
    sa.column('status', sa.String),
    sa.column('chapters_total', sa.Integer),
    sa.column('chapters_ok', sa.Integer),
    sa.column('chapters_failed', sa.Integer),
    sa.column('chapters_skipped', sa.Integer),
    sa.column('result', sa.JSON),
    sa.column('error', sa.Text),
    sa.column('started_at', sa.DateTime),
    sa.column('finished_at', sa.DateTime),
)


def upgrade() -> None:
    """Aviation syncs now run as ordinary jobs: runs say which crawler they belong to and can carry a
    result summary; the separate sync history is folded into crawl_runs.
    """
    with op.batch_alter_table('crawl_runs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('crawler', sa.String(length=50), nullable=False, server_default='novel'))
        batch_op.add_column(sa.Column('result', sa.JSON(), nullable=True))
    with op.batch_alter_table('crawl_runs', schema=None) as batch_op:
        batch_op.alter_column('crawler', server_default=None)

    connection = op.get_bind()
    for sync in connection.execute(sa.select(syncs).order_by(syncs.c.id)).mappings():
        completed = sync['status'] == 'completed'
        connection.execute(
            runs.insert().values(
                url=HOMES.get(sync['source'], sync['source']),
                crawler=f"aviation:{sync['source']}",
                with_chapters=False,
                status=sync['status'],
                chapters_total=FILES_PER_SYNC,
                chapters_ok=FILES_PER_SYNC if completed else 0,
                chapters_failed=0,
                chapters_skipped=0,
                result=sync['counts'] if completed else None,
                error=sync['error'],
                started_at=sync['started_at'],
                finished_at=sync['finished_at'],
            )
        )
    op.drop_table('aviation_syncs')


def downgrade() -> None:
    """Split aviation runs back out into their own history table."""
    op.create_table('aviation_syncs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('counts', sa.JSON(), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(), nullable=False),
    sa.Column('finished_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_aviation_syncs'))
    )
    op.execute(
        "INSERT INTO aviation_syncs (source, status, counts, error, started_at, finished_at)"
        " SELECT substr(crawler, 10), CASE status WHEN 'completed' THEN 'completed' ELSE 'failed' END,"
        " coalesce(result, '{}'), error, started_at, coalesce(finished_at, started_at)"
        " FROM crawl_runs WHERE crawler LIKE 'aviation:%'"
    )
    op.execute("DELETE FROM crawl_runs WHERE crawler LIKE 'aviation:%'")
    with op.batch_alter_table('crawl_runs', schema=None) as batch_op:
        batch_op.drop_column('result')
        batch_op.drop_column('crawler')
