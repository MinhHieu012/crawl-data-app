"""vna_records, vna_syncs

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-05 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the Vietnam Airlines reference data (airports, airlines, cities, countries) and its sync history."""
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


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('vna_syncs')
    op.drop_table('vna_records')
