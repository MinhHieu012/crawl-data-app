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

## Vận hành

| Việc | Lệnh (chạy trong thư mục `crawl-data-app`) |
|---|---|
| Xem log | `docker compose logs -f` (log crawler dạng JSON ở `/srv/state/logs/crawler.log` trong container) |
| Khởi động lại | `docker compose restart` |
| Cập nhật bản mới | `git pull && docker compose up -d --build` |
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
