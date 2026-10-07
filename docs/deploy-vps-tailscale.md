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
- **Công khai cho bất kỳ ai có link**: xem mục dưới.

### Cửa công khai (không cần Tailscale, không cần tài khoản)

`compose.yaml` có sẵn dịch vụ `public` (Caddy), mặc định tắt. Bật lên thì có hai lối vào:

| Lối vào | Ai | Quyền |
|---|---|---|
| `https://<tên-vps>.<tailnet>.ts.net` (Tailscale Funnel → `127.0.0.1:8080` → Caddy) | bất kỳ ai | mọi thứ **trừ** lưu trang Cài đặt và bật/tắt nguồn (trả 403 `owner_only`) |
| `http://<IP Tailscale>:8000` | chỉ máy trong tailnet | toàn quyền |

Bật (một lần, trên VPS):

```bash
echo "COMPOSE_PROFILES=public" >> ~/crawl-data-app/.env
echo "PUBLIC_BIND=127.0.0.1" >> ~/crawl-data-app/.env   # nhường cổng 443 cho Funnel, không thì container không lên
cd ~/crawl-data-app && docker compose up -d --no-build
tailscale funnel --bg 8080        # lần đầu sẽ in đường dẫn để bật Funnel/HTTPS cho tailnet
tailscale funnel status           # xem địa chỉ công khai
```

Tắt: `tailscale funnel --https=443 off`, xoá dòng `COMPOSE_PROFILES` khỏi `.env`, rồi
`docker compose up -d --no-build --remove-orphans`.

#### Dùng tên miền riêng thay cho Funnel

Funnel chỉ phục vụ tên `*.ts.net`. Có tên miền riêng thì để Caddy nhận thẳng (tự xin chứng chỉ Let's Encrypt):

1. Tạo bản ghi DNS `A` của tên miền trỏ về IP công khai của VPS; mở cổng 80 và 443 ở firewall của nhà cung cấp VPS.
2. Trên VPS (sau khi DNS đã trỏ đúng — `nslookup <tên miền>` ra IP của VPS). Tắt Funnel **trước**: Funnel và
   Caddy không cùng giữ được cổng 443 (`address already in use`, deploy sẽ rollback).

```bash
tailscale funnel --https=443 off                                # bỏ lối vào ts.net, trả cổng 443
sed -i '/^PUBLIC_BIND=/d' ~/crawl-data-app/.env                 # nếu trước đó đã đặt cho Funnel
echo "PUBLIC_SITE=crawl.example.com" >> ~/crawl-data-app/.env   # cần cả COMPOSE_PROFILES=public
cd ~/crawl-data-app && docker compose up -d --no-build --force-recreate public
```

Mỗi lần đổi `PUBLIC_SITE` phải có `--force-recreate public`: `docker compose up -d` thường không tạo lại container
Caddy khi chỉ giá trị này đổi, nên Caddy vẫn chạy cấu hình cũ (dịch vụ `app` không bị đụng tới, job đang chạy không
bị ngắt). Kiểm tra: `docker compose logs public | grep domains` phải liệt kê đủ các tên.

Nhiều tên (ví dụ thêm `www`): mỗi tên cần bản ghi DNS riêng trỏ về VPS, rồi ghi cách nhau bằng dấu phẩy và dấu cách —
`PUBLIC_SITE=crawl.example.com, www.crawl.example.com`. Caddy xin chứng chỉ riêng cho từng tên.

Quyền của khách qua tên miền giống hệt qua Funnel. Bỏ tên miền: xoá dòng `PUBLIC_SITE` rồi chạy lại lệnh
`docker compose up` ở trên.

> **Hiểu rõ trước khi bật.** Khách vẫn **chạy/huỷ được job crawl và đồng bộ** bằng VPS và IP của bạn, và
> xem được trang Cài đặt, Log. Công khai cũng là phát lại nội dung cho mọi người: truyện có bản quyền,
> nguồn `vna` chỉ được dùng cá nhân, phi thương mại (xem mục "Tuân thủ và giới hạn" trong README).
> Giới hạn tốc độ crawl (`HTTP_REQUEST_DELAY`) chỉ chủ máy đổi được nên khách không thể bắt crawler
> chạy nhanh hơn mức bạn đặt.

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

Bước nào lỗi thì dừng ở đó; trước bước tạo lại container, bản đang chạy không bị đụng tới. Workflow
**chỉ chạy khi code vào `main`** (push thẳng hoặc merge PR) và chạy trọn từ test tới deploy; PR và nhánh
khác không kích hoạt gì, commit chỉ đổi `*.md` / `docs/` cũng được bỏ qua. Mỗi lần deploy tạo lại
container nên job crawl đang chạy bị ghi `interrupted` (bấm **Tiếp tục** trên giao diện sau khi deploy).
Thời gian gián đoạn mỗi lần deploy khoảng 5–10 giây.

### Cấu hình một lần

**1. Khoá SSH riêng cho việc deploy** (chạy trên máy của bạn, không đặt passphrase):

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"
ssh-copy-id -i deploy_key.pub <user>@<IP công khai của VPS>
ssh-keyscan <IP công khai của VPS>                 # các dòng không bắt đầu bằng # dùng cho VPS_KNOWN_HOSTS
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
git push origin main                                       # code vào main là tự test → build → deploy
gh workflow run deploy.yml --ref main                      # deploy lại bằng tay commit mới nhất của main
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

### Bật quản trị góp ý (`ADMIN_TOKEN`)

Trang **Quản lý góp ý** (`/admin/feedback`) chỉ mở khi máy chủ có `ADMIN_TOKEN`. Trên VPS có **hai**
file `.env`, và biến này phải nằm ở file của app:

| File | Của ai | Chứa gì |
|---|---|---|
| `~/crawl-data-app/.env` (cạnh `compose.yaml`) | Docker Compose | `TAILSCALE_IP`, `APP_IMAGE`, `COMPOSE_PROFILES`, `PUBLIC_SITE`, `PUBLIC_BIND` |
| `/srv/state/.env` (trong volume `crawl-data-app_state`) | app | `ADMIN_TOKEN` và mọi biến ở trang Cài đặt |

Đặt `ADMIN_TOKEN` vào file cạnh `compose.yaml` thì **không có tác dụng** — Compose không chuyển biến
đó vào container, giao diện vẫn báo "Chưa bật quản trị".

```bash
# Tự tạo mã (43 ký tự), ghi vào /srv/state/.env và in ra MỘT lần — chép lại, giữ kín:
docker compose run --rm --no-deps app python -c "import secrets; from dotenv import set_key; t = secrets.token_urlsafe(32); set_key('.env', 'ADMIN_TOKEN', t); print(t)"
docker compose restart app   # app chỉ đọc mã lúc khởi động; job đang chạy sẽ thành `interrupted`
docker compose ps            # sau ~30 giây: STATUS của app phải là `Up ... (healthy)`
```

Kiểm tra mà không lộ mã: `docker compose exec app grep -c "^ADMIN_TOKEN=" /srv/state/.env` in ra `1`.

**Đổi mã**: chạy lại đúng hai lệnh trên — lệnh ghi sẽ thay mã cũ chứ không thêm dòng mới. Mã cũ còn
dùng được tới lúc khởi động lại; sau đó trình duyệt nào đang nhớ mã cũ phải nhập mã mới ở
`/admin/feedback`.

**Tắt quản trị**: gỡ dòng đó (hoặc để `ADMIN_TOKEN=` trống) rồi khởi động lại:

```bash
docker compose run --rm --no-deps app sed -i '/^ADMIN_TOKEN=/d' .env
docker compose restart app
```

**Container lặp `Restarting (2)`** sau khi đặt mã (`docker compose ps`): mã ngắn hơn 16 ký tự nên
app từ chối cấu hình. `docker compose logs --tail 15 app` ghi `Value should have at least 16 items`
(log này có thể in nguyên giá trị mã, che đi trước khi gửi cho ai). Các lệnh ở mục này dùng `run` chứ
không dùng `exec` nên vẫn chạy được lúc đó: ghi lại mã bằng lệnh đầu tiên, hoặc gỡ dòng đó, rồi khởi
động lại.

## Khi không vào được

- `docker compose up` báo thiếu `TAILSCALE_IP`: chưa tạo file `.env` ở bước 3.
- Báo `cannot assign requested address`: Tailscale chưa lên. Kiểm tra `tailscale status`, rồi
  `docker compose up -d`.
- Trình duyệt treo: máy bạn chưa bật Tailscale, hoặc đăng nhập khác tài khoản.
- Trang Quản lý góp ý báo "Chưa bật quản trị" dù đã đặt `ADMIN_TOKEN`: đặt nhầm vào `.env` cạnh
  `compose.yaml`, hoặc chưa khởi động lại — xem [Bật quản trị góp ý](#bật-quản-trị-góp-ý-admin_token).
- Địa chỉ Tailscale của VPS đổi (hiếm, khi xoá và thêm lại máy): sửa `TAILSCALE_IP` trong `.env` rồi
  `docker compose up -d`.
