"""crawl_runs.chapters_total

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-05 20:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the number of chapters a run has to fetch, so progress can be shown while it runs."""
    with op.batch_alter_table('crawl_runs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('chapters_total', sa.Integer(), nullable=False, server_default='0'))

    # Runs recorded before this column existed: treat everything they processed as their total.
    op.execute('UPDATE crawl_runs SET chapters_total = chapters_ok + chapters_failed')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('crawl_runs', schema=None) as batch_op:
        batch_op.drop_column('chapters_total')
