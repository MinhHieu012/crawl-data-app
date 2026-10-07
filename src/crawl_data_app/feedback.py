"""Góp ý của người dùng: báo lỗi và gợi ý crawler mới.

Không có tài khoản người dùng, nên "người gửi" là một mã ngẫu nhiên do trình duyệt tự sinh và giữ
(`reporter_key`); database chỉ lưu SHA-256 của mã đó. Ai giữ mã gốc mới xem lại được góp ý của mình.
Xem và quản lý mọi góp ý là việc của quản trị viên — kiểm tra quyền nằm ở `web/app.py`.
"""

import hashlib
from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from crawl_data_app.aviation import fold
from crawl_data_app.database.models import Feedback, FeedbackStatus, utcnow

# Số góp ý gần nhất trả về cho người gửi ở "Góp ý đã gửi" — đủ cho một người, không cần phân trang.
MINE_LIMIT = 50


def reporter_hash(reporter_key: str) -> str:
    return hashlib.sha256(reporter_key.encode()).hexdigest()


def _matches(needle: str, row: Feedback) -> bool:
    texts = (row.title, row.description, row.contact or "", *row.details.values())
    return any(needle in fold(text) for text in texts)


class FeedbackRepository:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def create(
        self,
        *,
        type: str,
        title: str,
        description: str,
        details: dict[str, str],
        contact: str | None,
        reporter_key: str | None,
    ) -> Feedback:
        with self._session_factory.begin() as session:
            row = Feedback(
                type=type,
                title=title,
                description=description,
                details=details,
                contact=contact,
                reporter_hash=reporter_hash(reporter_key) if reporter_key else None,
                status=FeedbackStatus.OPEN.value,
            )
            session.add(row)
            session.flush()
        return row

    def mine(self, reporter_key: str) -> Sequence[Feedback]:
        """Góp ý gần nhất của người giữ mã `reporter_key`, mới nhất trước."""
        query = (
            select(Feedback)
            .where(Feedback.reporter_hash == reporter_hash(reporter_key))
            .order_by(Feedback.id.desc())
            .limit(MINE_LIMIT)
        )
        with self._session_factory() as session:
            return session.scalars(query).all()

    def page(
        self, *, type: str = "", status: str = "", search: str = "", limit: int, offset: int = 0
    ) -> tuple[list[Feedback], int]:
        """Một trang góp ý (mới nhất trước) và tổng số dòng khớp bộ lọc; tìm không dấu theo tiêu
        đề, mô tả, liên hệ và các trường riêng (URL nguồn, chức năng...).
        """
        query = select(Feedback).order_by(Feedback.id.desc())
        if type:
            query = query.where(Feedback.type == type)
        if status:
            query = query.where(Feedback.status == status)
        with self._session_factory() as session:
            rows = list(session.scalars(query))
        # ponytail: tìm kiếm và phân trang trong bộ nhớ để tìm được cả không dấu trên SQLite (như
        # `ProvinceRepository`); chuyển sang cột tìm kiếm + SQL khi số góp ý lên tới hàng chục nghìn.
        if needle := fold(search):
            rows = [row for row in rows if _matches(needle, row)]
        return rows[offset : offset + limit], len(rows)

    def get(self, feedback_id: int) -> Feedback | None:
        with self._session_factory() as session:
            return session.get(Feedback, feedback_id)

    def update(self, feedback_id: int, **values: object) -> Feedback | None:
        """Ghi các trường được đổi (trạng thái, phản hồi); None nếu không có góp ý này."""
        with self._session_factory.begin() as session:
            row = session.get(Feedback, feedback_id)
            if row is None:
                return None
            for field, value in values.items():
                setattr(row, field, value)
            row.updated_at = utcnow()
        return row

    def delete(self, feedback_id: int) -> bool:
        with self._session_factory.begin() as session:
            return session.execute(delete(Feedback).where(Feedback.id == feedback_id)).rowcount > 0
