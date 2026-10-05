"""aviation_records, aviation_syncs (replace vna_*)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-05 23:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RECORD_COLUMNS = 'kind, code, name, name_vi, city_code, country_code, region, crawled_at'
SYNC_COLUMNS = 'status, counts, error, started_at, finished_at'


def upgrade() -> None:
    """Aviation data now comes from several sources: add a `source` column and room for longer codes.

    New tables instead of ALTER so the constraint names follow the new table names; rows already
    synced from Vietnam Airlines are carried over as source 'vna'.
    """
    op.create_table('aviation_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('code', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('name_vi', sa.String(length=255), nullable=True),
    sa.Column('city_code', sa.String(length=64), nullable=True),
    sa.Column('country_code', sa.String(length=10), nullable=True),
    sa.Column('region', sa.String(length=100), nullable=True),
    sa.Column('crawled_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_aviation_records')),
    sa.UniqueConstraint('source', 'kind', 'code', name='uq_aviation_records_source_kind_code')
    )
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
        f"INSERT INTO aviation_records (source, {RECORD_COLUMNS}) SELECT 'vna', {RECORD_COLUMNS} FROM vna_records"
    )
    op.execute(
        f"INSERT INTO aviation_syncs (id, source, {SYNC_COLUMNS}) SELECT id, 'vna', {SYNC_COLUMNS} FROM vna_syncs"
    )
    op.drop_table('vna_syncs')
    op.drop_table('vna_records')


def downgrade() -> None:
    """Back to the Vietnam-Airlines-only tables; rows from other sources are dropped."""
    op.create_table('vna_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('code', sa.String(length=10), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('name_vi', sa.String(length=255), nullable=True),
    sa.Column('city_code', sa.String(length=10), nullable=True),
    sa.Column('country_code', sa.String(length=10), nullable=True),
    sa.Column('region', sa.String(length=100), nullable=True),
    sa.Column('crawled_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_vna_records')),
    sa.UniqueConstraint('kind', 'code', name='uq_vna_records_kind_code')
    )
    op.create_table('vna_syncs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('counts', sa.JSON(), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(), nullable=False),
    sa.Column('finished_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_vna_syncs'))
    )
    op.execute(
        f"INSERT INTO vna_records ({RECORD_COLUMNS}) SELECT {RECORD_COLUMNS} FROM aviation_records WHERE source = 'vna'"
    )
    op.execute(
        f"INSERT INTO vna_syncs (id, {SYNC_COLUMNS}) SELECT id, {SYNC_COLUMNS} FROM aviation_syncs WHERE source = 'vna'"
    )
    op.drop_table('aviation_syncs')
    op.drop_table('aviation_records')
