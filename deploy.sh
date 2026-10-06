#!/bin/sh
# Chạy TRÊN VPS, trong thư mục có compose.yaml và .env (workflow CI/CD chép file này lên rồi gọi qua SSH).
#
#   sh deploy.sh ghcr.io/<chủ>/crawl-data-app:<commit>   triển khai một image
#   sh deploy.sh rollback                                 quay về image chạy ngay trước đó
#
# Image mới không healthy thì tự chạy lại image cũ (kèm database lúc trước khi deploy) và thoát với mã 1.
set -eu
cd "$(dirname "$0")"

# ponytail: chỉ sao lưu SQLite ở đường dẫn mặc định; đổi DATABASE_URL (PostgreSQL...) thì tự dump trước khi deploy.
DB=data/crawl-data-app.db
BACKUP=data/pre-deploy.db

target=${1:?Thiếu tham số: tên image đầy đủ, hoặc "rollback"}
current=$(sed -n 's/^APP_IMAGE=//p' .env)
new=$target
if [ "$target" = rollback ]; then
    new=$(cat .previous-image)
fi

use() { # ghi image sẽ chạy vào .env, giữ nguyên các dòng khác (TAILSCALE_IP)
    { grep -v '^APP_IMAGE=' .env || true; echo "APP_IMAGE=$1"; } > .env.new
    mv .env.new .env
}
up() { docker compose up -d --no-build --wait --wait-timeout 180; }
in_state() { APP_IMAGE=$new docker compose run --rm --no-deps -T app "$@"; } # lệnh một lần trên volume state

echo "==> Đang chạy: ${current:-chưa có}  ->  sẽ chạy: $new"
docker pull "$new" # lỗi ở đây thì dừng, bản đang chạy chưa bị đụng tới

if [ "$target" != rollback ]; then
    # Image mới có thể nâng schema lúc khởi động mà image cũ không đọc được → giữ một bản để rollback.
    echo "==> Sao lưu database"
    in_state python -c '
import os, sqlite3, sys
db, backup = sys.argv[1:]
if os.path.exists(backup):
    os.remove(backup)
if os.path.exists(db):
    sqlite3.connect(db).backup(sqlite3.connect(backup))
' "$DB" "$BACKUP"
fi

use "$new"
if up; then
    if [ -n "$current" ] && [ "$current" != "$new" ]; then
        echo "$current" > .previous-image
    fi
    echo "==> THÀNH CÔNG: đang chạy $new"
    exit 0
fi

echo "==> LỖI: $new không healthy. 50 dòng log cuối:" >&2
docker compose logs --tail 50 app >&2 || true
if [ -z "$current" ]; then
    echo "==> Không có bản trước để rollback." >&2
    exit 1
fi

echo "==> ROLLBACK về $current" >&2
docker compose stop app
if [ "$target" != rollback ]; then
    in_state sh -c "[ ! -f $BACKUP ] || { cp $BACKUP $DB && rm -f $DB-wal $DB-shm; }"
fi
use "$current"
if up; then
    echo "==> Đã khôi phục $current (deploy vẫn tính là THẤT BẠI)." >&2
else
    echo "==> ROLLBACK CŨNG LỖI — cần xử lý tay: docker compose ps; docker compose logs app" >&2
fi
exit 1
