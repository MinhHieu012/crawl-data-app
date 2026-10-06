# Triển khai lên VPS bằng Docker + Tailscale

Cách này không cần tên miền và **không mở cổng web nào ra internet**. Ứng dụng chạy trong Docker, cổng
8000 chỉ được publish trên địa chỉ Tailscale của VPS (`100.x.y.z`), nên chỉ máy nào đã cài Tailscale và
nằm trong mạng riêng (tailnet) của bạn mới truy cập được. Người lạ quét IP công khai của VPS sẽ không
thấy gì.

> Vì API **không có đăng nhập**, ai vào được tailnet là điều khiển được crawler. Chỉ mời người bạn tin.

Trên VPS chỉ cần **Docker và Tailscale** — không cần cài Python hay Node. Giả định Ubuntu 24.04, có `sudo`.

## 1. Cài Tailscale

Tạo tài khoản miễn phí tại <https://login.tailscale.com>, rồi:

**Trên VPS**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4        # ví dụ 100.101.102.103
```

Lệnh `up` in ra một đường dẫn, mở nó trên trình duyệt để đăng nhập.

**Trên máy của bạn** (Windows/macOS/điện thoại): cài ứng dụng từ <https://tailscale.com/download>,
đăng nhập **cùng tài khoản**.

## 2. Cài Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # đăng xuất rồi đăng nhập lại để có hiệu lực
```

Cho Docker khởi động sau Tailscale, nếu không sau khi reboot container có thể không bind được vào
địa chỉ Tailscale:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
printf '[Unit]\nAfter=tailscaled.service\nWants=tailscaled.service\n' | \
  sudo tee /etc/systemd/system/docker.service.d/tailscale.conf
sudo systemctl daemon-reload
```

## 3. Chạy ứng dụng

```bash
git clone https://github.com/MinhHieu012/crawl-data-app.git
cd crawl-data-app
echo "TAILSCALE_IP=$(tailscale ip -4)" > .env      # file này của Docker Compose, không phải cấu hình app
docker compose up -d --build
```

Lần đầu build mất vài phút. Xong thì mở `http://100.101.102.103:8000` (thay bằng địa chỉ ở bước 1)
từ máy có Tailscale. Bật **MagicDNS** trong trang quản trị Tailscale thì dùng được tên máy thay cho số,
ví dụ `http://ten-vps:8000`.

Mọi cấu hình (timeout, User-Agent, nguồn đang bật...) chỉnh ở trang **Cài đặt** của giao diện. Dữ liệu,
log và cấu hình nằm trong volume `state` nên không mất khi cập nhật hay tạo lại container.

## 4. Khoá thêm cho chắc

Docker bỏ qua `ufw` với cổng nó publish, vì vậy việc chỉ-cho-Tailscale-vào dựa vào dòng `ports` trong
`compose.yaml` (bind đúng IP Tailscale). **Đừng sửa thành `8000:8000`.** Vẫn nên bật tường lửa cho các
cổng còn lại:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

Kiểm tra từ một máy **không** có Tailscale (ví dụ mạng 4G): `http://<IP công khai của VPS>:8000`
phải không vào được.

## Cho người khác dùng

- **Cùng làm việc**: mời họ vào tailnet (Tailscale admin → Users → Invite), hoặc dùng *Share node* để
  chỉ chia sẻ riêng VPS này mà không lộ các máy khác của bạn.
- **Công khai cho bất kỳ ai có link**: không khuyên, vì app không có đăng nhập. Nếu thật sự cần, hãy
  thêm lớp đăng nhập trước (ví dụ Caddy `basic_auth`) rồi mới dùng `tailscale funnel`.

## Triển khai tự động (CI/CD)

Sau khi cài xong các bước trên, không cần build trên VPS nữa. GitHub Actions
([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) làm toàn bộ:

```text
test (ruff, pytest, eslint, tsc, vitest)
  → build image → chạy thử image (phải healthy)
  → push ghcr.io/<chủ>/crawl-data-app:<12 ký tự commit>
  → SSH vào VPS: chép compose.yaml + deploy.sh, chạy `sh deploy.sh <image>`
      → pull → sao lưu database → tạo lại container → chờ health check
      → không healthy: chạy lại image cũ + database cũ, job báo đỏ
```

Bước nào lỗi thì dừng ở đó; trước bước tạo lại container, bản đang chạy không bị đụng tới. Mỗi push/PR
đều chạy test + build + chạy thử, nhưng **chỉ deploy khi đẩy tag `v*` hoặc bấm tay** — vì tạo lại
container làm job crawl đang chạy bị ghi `interrupted` (bấm **Tiếp tục** trên giao diện sau khi deploy).
Thời gian gián đoạn mỗi lần deploy khoảng 5–10 giây.

### Cấu hình một lần

**1. Khoá SSH riêng cho việc deploy** (chạy trên máy của bạn, không đặt passphrase):

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"
ssh-copy-id -i deploy_key.pub <user>@<IP công khai của VPS>
ssh-keyscan -t ed25519 <IP công khai của VPS>      # kết quả dùng cho VPS_KNOWN_HOSTS
```

Nạp xong vào GitHub thì xoá file `deploy_key` khỏi máy. Tài khoản `<user>` phải thuộc nhóm `docker`
(bước 2 ở trên).

**2. GitHub** → repo → *Settings → Environments → New environment* tên `production`, thêm secret:

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | IP công khai của VPS |
| `VPS_USER` | tài khoản SSH |
| `VPS_SSH_KEY` | toàn bộ nội dung file `deploy_key` (khoá riêng) |
| `VPS_KNOWN_HOSTS` | dòng `ssh-keyscan` in ra — để workflow chỉ nối đúng VPS của bạn |

Tuỳ chọn, ở tab *Variables* của environment: `VPS_PORT` (mặc định `22`), `VPS_PATH` (thư mục trên VPS,
mặc định `crawl-data-app` trong thư mục home). Không cần secret cho registry: workflow dùng
`GITHUB_TOKEN` có sẵn. Muốn phải duyệt tay trước mỗi lần deploy thì bật *Required reviewers* cho
environment.

**3. Cho VPS kéo được image.** Lần chạy workflow đầu tiên sẽ tạo package `crawl-data-app` (mặc định
riêng tư). Repo này công khai nên cách gọn nhất là đặt package thành công khai: trang GitHub của bạn →
*Packages → crawl-data-app → Package settings → Change visibility → Public*; VPS không phải giữ token nào.
Muốn giữ riêng tư thì tạo token (classic) chỉ có quyền `read:packages` và chạy một lần trên VPS:
`docker login ghcr.io -u <tên GitHub>` (dán token khi được hỏi).

**4. Thư mục trên VPS.** Dùng lại thư mục đã `git clone` ở bước 3 là được. Máy mới thì chỉ cần:

```bash
mkdir -p ~/crawl-data-app && echo "TAILSCALE_IP=$(tailscale ip -4)" > ~/crawl-data-app/.env
```

Dữ liệu cũ được giữ nguyên: volume luôn tên `crawl-data-app_state`. Riêng lần deploy tự động đầu tiên
chưa có "bản trước" nên nếu hỏng sẽ không tự rollback được.

### Deploy, rollback, kiểm tra

Trên máy của bạn (cần [GitHub CLI](https://cli.github.com), hoặc bấm *Run workflow* ở tab Actions):

```bash
gh workflow run deploy.yml --ref main                      # deploy commit mới nhất của main
git tag v0.2.0 && git push origin v0.2.0                   # hoặc: deploy theo tag phiên bản
gh run watch                                               # theo dõi
gh workflow run deploy.yml --ref main -f rollback=true     # quay về image chạy ngay trước đó
```

Trên VPS, trong thư mục `crawl-data-app`:

| Việc | Lệnh |
|---|---|
| Bản nào đang chạy | `docker compose ps` (cột IMAGE, tag = 12 ký tự đầu của commit) hoặc `grep APP_IMAGE .env` |
| Commit đầy đủ của bản đang chạy | `docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' $(docker compose ps -q app)` |
| Bản trước đó | `cat .previous-image` |
| Rollback tay | `sh deploy.sh rollback` |
| Chạy một bản bất kỳ đã từng push | `sh deploy.sh ghcr.io/<chủ>/crawl-data-app:<commit>` |
| Vì sao không healthy | `docker inspect -f '{{json .State.Health}}' $(docker compose ps -q app)` |
| Log lúc khởi động | `docker compose logs --tail 100 app` |
| Dọn image cũ | `docker image prune -a` (giữ lại image đang chạy; rollback sau đó sẽ kéo lại từ registry) |

Khi workflow đỏ: job `test`/`build` đỏ thì VPS chưa bị đụng tới — sửa code rồi chạy lại. Job `deploy` đỏ
ở bước SSH (`Permission denied`, `Host key verification failed`) là sai secret. Đỏ sau dòng `ROLLBACK`
nghĩa là bản mới hỏng và VPS đã chạy lại bản cũ; log của bản hỏng nằm ngay trong output của job.

Về database: trước khi đổi bản, `deploy.sh` chép SQLite ra `data/pre-deploy.db` trong volume và tự khôi
phục nếu phải rollback **ngay lúc deploy**. Rollback tay về sau thì không khôi phục (để không mất dữ liệu
mới crawl); nếu bản mới có đổi schema, bản cũ có thể không khởi động được — khi đó hoặc deploy bản sửa
lỗi, hoặc chấp nhận quay về dữ liệu lúc trước deploy bằng cách chép `pre-deploy.db` đè lên
`crawl-data-app.db`. Dùng PostgreSQL thì phải tự `pg_dump` trước khi deploy.

## Vận hành

| Việc | Lệnh (chạy trong thư mục `crawl-data-app`) |
|---|---|
| Xem log | `docker compose logs -f` (log crawler dạng JSON ở `/srv/state/logs/crawler.log` trong container) |
| Khởi động lại | `docker compose restart` |
| Cập nhật bản mới | xem [Triển khai tự động](#triển-khai-tự-động-cicd) (hoặc build tại chỗ: `git pull && docker compose up -d --build`) |
| Chạy lệnh CLI | `docker compose exec app crawl-data-app status` |
| Sao lưu | `docker compose cp app:/srv/state ./backup` |

`docker compose up -d --build` tạo lại container nên job đang chạy được ghi là `interrupted`; mở giao
diện và bấm **Tiếp tục**. Schema database tự được nâng cấp mỗi lần container khởi động.

## Khi không vào được

- `docker compose up` báo thiếu `TAILSCALE_IP`: chưa tạo file `.env` ở bước 3.
- Báo `cannot assign requested address`: Tailscale chưa lên. Kiểm tra `tailscale status`, rồi
  `docker compose up -d`.
- Trình duyệt treo: máy bạn chưa bật Tailscale, hoặc đăng nhập khác tài khoản.
- Địa chỉ Tailscale của VPS đổi (hiếm, khi xoá và thêm lại máy): sửa `TAILSCALE_IP` trong `.env` rồi
  `docker compose up -d`.
