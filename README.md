# crawl-data-app

Crawl truyện chữ từ các website đọc truyện (hiện có **TruyenFull**) vào SQLite/PostgreSQL:
thông tin truyện, mục lục và nội dung từng chương đã làm sạch. Thiết kế để chạy lâu dài một cách
"lịch sự": giãn cách request, tuân thủ `robots.txt`, tự chạy tiếp sau khi bị gián đoạn và không tải lại
những gì đã có. Kèm theo là danh mục hàng không (sân bay, hãng bay, thành phố, quốc gia) đồng bộ từ
dữ liệu mở và vietnamairlines.com. Dùng qua dòng lệnh, hoặc qua [web UI](#web-ui) chạy trên chính máy
bạn hay trên một VPS bằng Docker ([Triển khai lên VPS](#triển-khai-lên-vps)).

> **Trách nhiệm sử dụng.** Công cụ chỉ đọc các trang công khai mà `robots.txt` cho phép và không vượt
> bất kỳ cơ chế kiểm soát truy cập nào. Nội dung truyện thuộc bản quyền của tác giả/dịch giả; bạn tự
> chịu trách nhiệm về việc được phép crawl, lưu trữ và sử dụng dữ liệu theo điều khoản của từng
> website và pháp luật hiện hành. Xem thêm mục [Tuân thủ và giới hạn](#tuân-thủ-và-giới-hạn).

## Bắt đầu nhanh

Yêu cầu: **Python ≥ 3.12** (đã kiểm thử trên Python 3.14, Windows 11).

```bash
python -m venv .venv
.venv\Scripts\activate            # Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"           # thêm ",postgres" nếu dùng PostgreSQL
copy .env.example .env            # tuỳ chọn — không có .env thì dùng giá trị mặc định

crawl-data-app init-db
crawl-data-app crawl --url "https://truyenfull.live/ten-truyen/" --from-chapter 1 --to-chapter 3
crawl-data-app status
```

`crawl-data-app ...` và `python -m crawl_data_app ...` là một. Chạy lệnh từ thư mục gốc của project
(đường dẫn mặc định `data/`, `logs/`, `.env`, `web/dist` tính theo thư mục hiện tại).

Muốn thao tác bằng giao diện thay cho dòng lệnh: `cd web && npm install && npm run build`, rồi
`crawl-data-app serve` và mở <http://127.0.0.1:8000> — chi tiết ở mục [Web UI](#web-ui).

## Các lệnh

| Lệnh | Việc làm |
|---|---|
| `crawl --url URL` | Chỉ lấy thông tin truyện (1 request, cộng `robots.txt`). |
| `crawl --url URL --all-chapters` | Thông tin + mục lục + nội dung mọi chương. |
| `crawl --url URL --from-chapter 1 --to-chapter 100` | Chỉ các chương 1–100 theo số thứ tự trong mục lục (bỏ một đầu = tới đầu/cuối truyện). |
| `crawl --url A --url B` / `--url-file urls.txt` | Nhiều truyện; file mỗi dòng một URL, dòng `#` là chú thích. |
| `crawl ... --force` | Tải lại cả chương đã có; chỉ ghi đè chương có nội dung thay đổi. |
| `resume` | Lặp lại lần crawl gần nhất của **mọi** truyện mà lần đó chưa hoàn tất (trừ những lần đã bị huỷ trên web UI). |
| `resume --url URL` | Lặp lại lần crawl gần nhất của truyện đó (cùng khoảng chương). |
| `status` | Truyện đã lưu, số chương đã tải/lỗi, 10 lần crawl gần nhất. |
| `status --errors` | Thêm danh sách chương đang lỗi kèm URL và nguyên nhân. |
| `export` | Xuất các chương đã tải ra `exports/<slug>.txt`, mỗi truyện một file (UTF-8). `--format epub` để xuất EPUB 3 có mục lục, `--format json` để xuất thông tin truyện kèm từng chương dạng danh sách đoạn văn, `--novel-id ID` để chọn truyện (ID xem ở `status`), `--out DIR` để đổi thư mục. Mặc định xuất toàn bộ chương đã tải; `--from-chapter N` / `--to-chapter M` chỉ xuất khoảng chương đó (tính cả hai đầu, bỏ một đầu = không giới hạn đầu đó), file mang tên `<slug>-c<đầu>-<cuối>.<định dạng>` theo chương thật sự có trong file. |
| `aviation` | Đồng bộ danh mục hàng không (sân bay, hãng bay, thành phố, quốc gia) của mọi nguồn, lần lượt từng nguồn; in bảng số bản ghi theo loại. Mỗi nguồn là một job trong lịch sử, xem lại được ở trang Job của web UI. |
| `aviation --source world` / `--source vna` | Chỉ một nguồn: `world` là dữ liệu mở toàn thế giới, `vna` là vietnamairlines.com (chỉ dùng cá nhân, phi thương mại). Lặp lại `--source` để chọn nhiều nguồn. |
| `sources` | Các website truyện được hỗ trợ. |
| `init-db` | Tạo database / nâng schema lên bản mới nhất. |
| `serve` | Chạy [web UI](#web-ui) và API tại `http://127.0.0.1:8000`. `--port N` đổi cổng, `--ui-dir DIR` trỏ tới bản build giao diện ở chỗ khác, `--host` đổi địa chỉ lắng nghe (đọc phần bảo mật trước). |

Mã thoát: `0` mọi thứ hoàn tất · `1` có truyện/chương lỗi hoặc có nguồn hàng không đồng bộ không xong · `2` sai tham số hoặc cấu hình · `130` bị ngắt (Ctrl+C).

`resume` và `status` chỉ nói về truyện: job đồng bộ hàng không không nằm trong hai lệnh này. Đồng bộ
hàng không bị lỗi hay bị ngắt thì chỉ cần chạy lại `aviation` — dữ liệu đã có không bị thay đổi cho
tới khi một lần đồng bộ tải và đọc xong cả ba file.

### Hành vi cần biết

- **Chạy lại luôn an toàn.** `crawl` và `resume` chỉ tải chương chưa xong (`pending`/`failed`). Chạy
  lại cùng lệnh sau một tuần sẽ chỉ tải các chương website mới ra thêm.
- **Bị gián đoạn** (Ctrl+C, mất mạng, tắt máy): mỗi chương được commit riêng nên không mất gì;
  `crawl-data-app resume` tải tiếp đúng phần còn thiếu.
- **Không trùng lặp.** Truyện được định danh theo `(nguồn, slug)`, chương theo `(truyện, slug)` — không
  theo URL — nên website đổi tên miền (TruyenFull đổi thường xuyên) cũng không sinh bản ghi trùng.
- **URL nào của truyện cũng được**: URL chương hay trang mục lục đều được quy về trang gốc của truyện.
- **Phát hiện thay đổi.** Thông tin truyện được so sánh và cập nhật mỗi lần crawl; chương bị website
  đổi tiêu đề sẽ tự được tải lại; muốn rà toàn bộ nội dung thì dùng `--force` (so sánh bằng SHA-256).
- **Bị website từ chối** (HTTP 401/403, Cloudflare challenge): dừng ngay cả loạt URL, các chương
  chưa tải giữ trạng thái chờ. Hãy đợi rồi `resume`, cân nhắc tăng `HTTP_REQUEST_DELAY`.
- **5 chương lỗi liên tiếp**: dừng lần crawl đó để không dội request vào website đang gặp sự cố.
- **Tiến độ được ghi vào database sau mỗi chương**, nên `status` (hoặc web UI) ở một cửa sổ khác thấy
  được lần crawl đang chạy tới đâu.

## Web UI

Giao diện quản trị chạy trên chính máy bạn, làm được mọi việc của dòng lệnh mà không cần gõ lệnh: tạo
job crawl, theo dõi tiến độ, tạm dừng / tiếp tục / huỷ, tìm và duyệt truyện, đọc chương, xem log,
bật-tắt nguồn và chỉnh cấu hình. Backend là FastAPI bọc lại đúng `CrawlService` và `NovelRepository`
mà dòng lệnh đang dùng; frontend là React + TypeScript trong thư mục `web/`.

### Chạy

Yêu cầu thêm: **Node.js ≥ 22.13** để build giao diện (đã kiểm thử với Node 22.20, npm 10.9).

```bash
# 1. Build giao diện — một lần, và mỗi khi sửa code trong web/
cd web
npm install
npm run build          # type-check rồi build ra web/dist
cd ..

# 2. Chạy backend: phục vụ cả API lẫn giao diện vừa build
crawl-data-app serve
```

| Địa chỉ | Nội dung |
|---|---|
| <http://127.0.0.1:8000/> | Giao diện |
| `http://127.0.0.1:8000/api/...` | API JSON |
| <http://127.0.0.1:8000/docs> | Tài liệu API tự sinh (Swagger UI) |

Chưa build giao diện thì `serve` vẫn chạy và chỉ phục vụ API. Dừng server bằng Ctrl+C: job đang chạy
được ghi là `interrupted`, lần sau mở lại bấm **Tiếp tục**.

> **Bảo mật.** API **không có đăng nhập**. Mặc định server chỉ nghe trên `127.0.0.1`, chỉ trả lời
> request gọi đúng tên `127.0.0.1`/`localhost` (chặn DNS rebinding) và từ chối request ghi do website
> khác gửi tới (chặn CSRF). `--host 0.0.0.0` mở server ra mạng: ai truy cập được đều điều khiển được
> crawler và sửa được cấu hình — chỉ dùng trong mạng bạn tin tưởng. Muốn chạy trên VPS hoặc cho người
> khác dùng: xem [Triển khai lên VPS](#triển-khai-lên-vps).

### Các màn hình

| Màn hình | Đường dẫn | Nội dung |
|---|---|---|
Giao diện đi theo ba tầng **crawler → loại dữ liệu → tab**. Mỗi crawler (Truyện chữ, Vietnam
Airlines…) là một module độc lập; module nhiều loại dữ liệu có trang tổng quan riêng, module một loại
thì vào thẳng khu vực quản lý. Job, log và cài đặt là trang chung của cả hệ thống.

| Màn hình | Đường dẫn | Nội dung |
|---|---|---|
| Tổng quan | `/` | Số crawler, số job theo trạng thái; các job gần đây kèm thanh tiến độ. |
| Tất cả crawler | `/crawlers` | Mỗi crawler một thẻ: loại dữ liệu, số liệu thật, trạng thái "Sẵn sàng" / "Chưa triển khai"; tìm theo tên (gõ không dấu cũng được). |
| Một crawler | `/crawlers/:crawler` | Mỗi loại dữ liệu một thẻ. Crawler chỉ có một loại thì chuyển thẳng vào loại đó. |
| Một loại dữ liệu | `/crawlers/:crawler/:loại/:tab` | Khu vực quản lý, mỗi tab một đường dẫn. Loại chưa có crawler ở backend chỉ hiện thông báo "chưa triển khai". |
| Job | `/jobs`, `/jobs/:id` | Job của mọi crawler (crawl truyện, đồng bộ hàng không); nút **Crawl** xổ danh sách crawler để tạo job mới. Danh sách có lọc theo trạng thái và phân trang. Chi tiết: tiến độ, số chương thành công / lỗi / còn lại, chương vừa tải, nút tạm dừng / huỷ / tiếp tục / thử lại, log của riêng job đó. |
| Log | `/logs` | Lọc theo mức (INFO / WARNING / ERROR), loại lỗi (request / parser), job, từ khoá; có chế độ tự làm mới. |
| Cài đặt | `/settings` | Timeout, số lần thử lại, khoảng nghỉ, số request đồng thời, User-Agent, định dạng nội dung, mức log. Database và thư mục log chỉ xem (mật khẩu trong URL database được che). |

Các tab của crawler **Truyện chữ** (`/crawlers/novel/stories/…`):

| Tab | Đường dẫn | Nội dung |
|---|---|---|
| Tổng quan | `overview` | Số truyện, số chương đã tải / chờ tải / lỗi; các job gần đây. |
| Crawl | `crawl` | Tạo job: URL truyện, nguồn, phạm vi (toàn bộ / khoảng chương / chỉ thông tin), bỏ qua chương đã tải, thử lại chương lỗi. Tạo xong chuyển thẳng sang trang theo dõi job. |
| Truyện | `novels`, `novels/:id` | Tìm theo tên hoặc tác giả (gõ không dấu cũng ra tên truyện), lọc theo nguồn và tình trạng, sắp xếp, phân trang. Chi tiết: thông tin truyện, danh sách chương theo trạng thái, tải chương còn thiếu / theo khoảng, xuất JSON (toàn bộ chương hoặc một khoảng chương) / tải lại một chương, lịch sử crawl. |
| Đọc chương | `novels/:id/chapters/:n` | Nội dung chương, chuyển chương trước / sau; chương chưa có thì tải ngay từ đây. |
| Job | `jobs` | Cùng danh sách với trang Job chung (job của mọi crawler). |
| Nguồn | `sources` | Bật / tắt từng website nguồn, kiểm tra kết nối, xem thông tin crawler và cấu hình HTTP đang áp dụng. |
| Log | `logs` | Cùng nội dung với trang Log chung. |

Crawler **Hàng không** (`/crawlers/aviation`) có hai nguồn dữ liệu độc lập, mỗi nguồn là một mục
trên menu:

| Nguồn | Đường dẫn | Dữ liệu |
|---|---|---|
| Toàn thế giới | `/crawlers/aviation/world/…` | Dữ liệu mở: sân bay còn hoạt động có mã IATA và quốc gia từ OurAirports, hãng bay đang hoạt động có mã IATA từ OpenFlights; thành phố suy ra từ sân bay. |
| Vietnam Airlines | `/crawlers/aviation/vietnam-airlines/…` | Điểm đến và hãng bay đối tác công bố trên vietnamairlines.com, có tên tiếng Việt. Chỉ dùng cho mục đích cá nhân, phi thương mại. |

Mỗi nguồn có cùng năm tab:

| Tab | Đường dẫn | Nội dung |
|---|---|---|
| Sân bay · Hãng bay · Thành phố · Quốc gia | `airport` · `airline` · `city` · `country` | Bảng bản ghi (mã, tên, thành phố, quốc gia, vùng hoặc châu lục), tìm theo mã hoặc tên (gõ không dấu cũng được), phân trang; nút **Đồng bộ** và **Xuất JSON** (tải mọi bản ghi của loại đó, không theo ô tìm kiếm). |
| Lịch sử | `history` | Các job đồng bộ của nguồn: trạng thái, tiến độ, số bản ghi theo loại hoặc lý do thất bại; bấm vào là tới trang chi tiết job. |

**Mỗi lần đồng bộ là một job** như job crawl truyện: chạy nền, hiện ở trang Job và huy hiệu "job đang
chạy", có tiến độ theo số file đã tải (3 file mỗi nguồn), log riêng, tạm dừng / huỷ / chạy lại được,
và một nguồn không chạy hai job cùng lúc. Một job tải lại cả bốn loại của nguồn đó; dữ liệu chỉ được
ghi khi đã tải và đọc xong cả ba file, nên job thất bại hay bị dừng giữa chừng không làm mất dữ liệu
đã có. Hai nguồn không ghi đè lên nhau. Phạm vi và giấy phép của từng nguồn: xem "Tuân thủ và giới
hạn".

Trang nào cũng có trạng thái đang tải (skeleton), lỗi (kèm nút thử lại) và trống; thao tác phá huỷ (huỷ
job, tắt nguồn, tải đè một chương) đều hỏi lại; kết quả thao tác báo bằng thông báo góc màn hình. Có
chế độ sáng / tối và menu thu gọn trên màn hình hẹp. Bộ lọc và số trang nằm trên URL nên tải lại trang
hay gửi link đều giữ nguyên.

Giao diện dùng được từ 360px: ở màn hẹp các bảng (job, truyện, chương, log) tự gọn lại — trạng thái,
tiến độ, ngày giờ dồn xuống dưới tên — nên không trang nào phải cuộn ngang. Chữ ở cả hai chế độ sáng,
tối đều đạt tương phản 4.5:1 (WCAG AA).

### Job trên web UI — cần biết

- **Một job là một dòng lịch sử crawl** (`crawl_runs`) — đúng thứ mà lệnh `status` hiển thị. Lần crawl
  chạy từ dòng lệnh cũng hiện trên web, nhưng chỉ job tạo từ web mới tạm dừng / huỷ được từ web.
- **Tạm dừng** → trạng thái `interrupted`, phần đã tải được giữ nguyên. **Tiếp tục** và **Thử lại** là
  cùng một việc với lệnh `resume`: tạo một job *mới* chạy lại đúng phạm vi cũ, bỏ qua chương đã xong,
  tải chương chưa tải hoặc đang lỗi. **Huỷ** → `cancelled`: lệnh `resume` không tự chạy lại job đã huỷ.
- **Mỗi truyện chỉ có một job chạy tại một thời điểm**; tạo trùng sẽ được dẫn tới job đang chạy. Nhiều
  truyện chạy cùng lúc được, nhưng mọi job dùng chung một nhịp request, nên tổng tốc độ gửi tới website
  vẫn là 1 request mỗi `HTTP_REQUEST_DELAY` giây dù có bao nhiêu job.
- **Tiến độ** lấy bằng cách hỏi lại API mỗi 2 giây, và *chỉ khi có job đang chạy*. Khi một job kết
  thúc, danh sách truyện, thống kê, log tự được làm mới.
- **Cài đặt** được ghi vào file `.env` (dòng lệnh dùng chung file này) và áp dụng cho job bắt đầu sau
  khi mọi job đang chạy đã kết thúc. Biến môi trường của hệ điều hành, nếu có, vẫn được ưu tiên hơn `.env`.
- **Đừng chạy `crawl-data-app crawl` / `resume` trong lúc server đang có job chạy** (và ngược lại): lúc
  khởi động, mỗi bên coi mọi lần crawl còn ghi `running` là của tiến trình đã chết và đánh dấu
  `interrupted`. Dữ liệu không mất, nhưng trạng thái hiển thị sẽ sai cho tới khi job kia chạy xong.

### API

| Endpoint | Việc làm |
|---|---|
| `GET /api/stats` | Số truyện; số chương và số job theo trạng thái. |
| `GET /api/sources` | Các nguồn, trạng thái bật/tắt, số truyện và số chương đã tải. |
| `PUT /api/sources/{name}` | Bật/tắt nguồn: `{"enabled": false}`. |
| `POST /api/sources/{name}/test` | Tải thử trang chủ của nguồn (một request, vẫn theo `robots.txt` và nhịp giãn cách). |
| `GET /api/novels` | Danh sách truyện: `search`, `source`, `status`, `sort`, `order`, `page`, `page_size`. |
| `GET /api/novels/{id}` | Một truyện kèm số chương theo trạng thái. |
| `GET /api/novels/{id}/chapters` | Mục lục đã lưu: `status`, `page`, `page_size`. |
| `GET /api/novels/{id}/chapters/{number}` | Nội dung một chương, dạng danh sách đoạn văn. |
| `GET /api/novels/{id}/export` | Thông tin truyện kèm các chương đã tải thành file JSON tải về (cùng cấu trúc với `export --format json`). Không tham số = toàn bộ chương (`<slug>.json`); `from_chapter` / `to_chapter` = một khoảng chương, tính cả hai đầu (`<slug>-c<đầu>-<cuối>.json`). Không có chương đã tải nào khớp thì 404 `not_found`. |
| `POST /api/crawl/jobs` | Tạo job: `url`, `source`, `with_chapters`, `from_chapter`, `to_chapter`, `force`, `retry_failed`. |
| `GET /api/crawl/jobs` | Danh sách job của mọi crawler: `status`, `novel_id`, `crawler` (`novel`, `aviation:world`, `aviation:vna`), `page`, `page_size`. Mỗi job có `crawler`, và `result` (số bản ghi theo loại) với job hàng không đã xong; các trường `chapters_*` đếm chương với job truyện và file với job hàng không. |
| `GET /api/crawl/jobs/{id}` | Một job kèm tiến độ và chương vừa tải. |
| `POST /api/crawl/jobs/{id}/pause` | Tạm dừng job đang chạy. |
| `POST /api/crawl/jobs/{id}/cancel` | Huỷ job đang chạy hoặc đang tạm dừng. |
| `POST /api/crawl/jobs/{id}/resume` · `/retry` | Chạy lại đúng phạm vi cũ thành một job mới (hai tên, một việc). |
| `GET /api/aviation/{source}/summary` | Danh mục hàng không của một nguồn (`source` là `world` hoặc `vna`): số bản ghi theo loại và lần đồng bộ gần nhất. |
| `GET /api/aviation/{source}/records` | Bản ghi của một loại: `kind` (`airport` / `airline` / `city` / `country`), `search`, `page`, `page_size`. |
| `GET /api/aviation/{source}/export` | Toàn bộ bản ghi của một loại (`kind`) thành file JSON tải về (`aviation-<source>-<kind>.json`), cùng các trường với `/records`. |
| `POST /api/aviation/{source}/sync` | Tạo job đồng bộ lại toàn bộ danh mục của nguồn và trả về job ngay (201); nguồn đang được đồng bộ thì 409 kèm `job_id`. Theo dõi và điều khiển qua các endpoint `/api/crawl/jobs/…`; lịch sử của nguồn là `GET /api/crawl/jobs?crawler=aviation:<source>`. |
| `GET /api/logs` | Các dòng log mới nhất: `level`, `kind`, `job_id`, `search`, `limit`. |
| `GET /api/settings` · `PUT /api/settings` | Đọc / lưu cấu hình. |

Danh sách có phân trang trả về `{"items": [...], "total": N}`. Thời gian là UTC kèm múi giờ (`...Z`),
giao diện tự đổi sang giờ máy. Lỗi luôn có dạng `{"code": "...", "detail": "câu thông báo tiếng Việt"}`:

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `invalid_url`, `unsupported_source` | URL không phải URL truyện / website chưa có crawler. |
| 403 | `cross_origin` | Request ghi do một trang web khác gửi tới. |
| 404 | `not_found` | Không có truyện, chương, job hay nguồn đó. |
| 409 | `duplicate_job` (kèm `job_id`), `source_disabled`, `job_not_running`, `job_running` | Truyện đang được crawl / nguồn đang tắt / thao tác không hợp với trạng thái job. |
| 422 | — | Dữ liệu sai kiểu hoặc ngoài giới hạn; `detail` là danh sách `{loc, msg}` theo từng trường (định dạng của FastAPI). |

### Phát triển giao diện

Chạy hai tiến trình: backend và dev server của Vite (tự nạp lại khi sửa code).

```bash
crawl-data-app serve          # terminal 1 — API ở cổng 8000
cd web && npm run dev        # terminal 2 — giao diện ở http://localhost:5173
```

Vite chuyển tiếp mọi request `/api` sang backend, nên trình duyệt chỉ thấy một origin — giống hệt lúc
backend tự phục vụ bản build, và không cần cấu hình CORS.

| Lệnh (chạy trong `web/`) | Việc làm |
|---|---|
| `npm run dev` | Dev server có hot reload. |
| `npm run build` | `tsc --noEmit` rồi build production ra `web/dist`. |
| `npm test` | Vitest + Testing Library; backend được giả lập nên không cần chạy server. |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript ở chế độ `strict`. |
| `npm run format` · `npm run format:check` | Prettier. |

Biến môi trường của giao diện — chép `web/.env.example` thành `web/.env.local` nếu cần đổi:

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Đường dẫn gốc của API; được đóng cứng vào bản build. |
| `VITE_DEV_PROXY_TARGET` | `http://127.0.0.1:8000` | Chỉ cho `npm run dev`: backend mà Vite chuyển tiếp tới. |
| `VITE_POLL_INTERVAL_MS` | `2000` | Chu kỳ hỏi lại tiến độ khi có job đang chạy. |

Phiên bản thư viện được chọn để chạy được trên Node 22.20: React Router 7 (bản 8 cần Node ≥ 22.22),
jsdom 29, TypeScript 6.0 (typescript-eslint chưa hỗ trợ bản 7), Mantine 8.

### Kiến trúc frontend

```text
web/src/
├── main.tsx           các provider: Mantine (giao diện), TanStack Query (dữ liệu), router
├── App.tsx            bảng định tuyến — route của khu vực Crawler sinh từ crawlers/registry.tsx
├── theme.ts           theme Mantine: màu chữ đủ tương phản, mặc định của Badge / Switch / ô số
├── api/
│   ├── client.ts      một cửa gọi backend: ghép URL, timeout, đổi mọi lỗi thành ApiError đọc được
│   ├── types.ts       kiểu dữ liệu, phản chiếu src/crawl_data_app/web/schemas.py
│   └── queries.ts     mỗi endpoint một hook: cache, hỏi lại định kỳ, làm mới dữ liệu liên quan
├── crawlers/
│   ├── registry.tsx   danh mục crawler: module → loại dữ liệu → tab; menu, thẻ và route sinh từ đây
│   └── paths.ts       đường dẫn của khu vực Crawler, dùng chung cho registry và các trang
├── layouts/           AppLayout: thanh trên, menu trái, nút sáng/tối, số job đang chạy ·
│                      CategoryLayout: tiêu đề, breadcrumb và các tab của một loại dữ liệu
├── pages/<màn hình>/  dashboard · crawlers · crawl · jobs · novels · sources · aviation · logs · settings
├── components/        QueryState (đang tải / lỗi / trống) · PageHeader (breadcrumb) · JobsTable ·
│                      JobProgress · NovelProgress · LogList · StatusBadge · ListControls · Cover ·
│                      StatCard · RecentJobs
├── hooks/             useUrlState (bộ lọc nằm trên URL) · useStartCrawl (tạo job từ một nút bấm)
├── utils/             format (ngày giờ, số, phạm vi job) · notify (thông báo)
└── test/              cấu hình Vitest và backend giả dùng chung cho các test
```

Ba loại state được tách riêng, không có thư viện store nào:

- **Dữ liệu của server** — chỉ nằm trong cache của TanStack Query (`api/queries.ts`), không chép sang
  state của component. Thao tác ghi xong thì hook tự làm mới các truy vấn liên quan; `useJobActivity`
  ở layout phát hiện job vừa kết thúc và làm mới truyện, thống kê, log dù đang ở trang nào.
- **State của giao diện** — bộ lọc và số trang nằm trên URL (`useUrlState`); sáng/tối do Mantine lưu ở
  `localStorage`; còn lại (hộp thoại đang mở, công tắc "tự làm mới") là `useState` tại chỗ.
- **State của form** — `@mantine/form` (form crawl, cài đặt, khoảng chương). Lỗi theo trường mà
  backend trả về (HTTP 422) được gắn lại đúng ô nhập.

Không có logic crawl nào ở frontend: nhận diện website, chuẩn hoá URL, chống trùng job, giới hạn tốc
độ đều do backend quyết định; giao diện chỉ kiểm tra sớm để báo lỗi nhanh.

### Quy ước giao diện

- **Màu và cỡ chữ lấy từ theme**, không viết mã màu hay số bo góc trong trang. `theme.ts` tính lại màu
  chữ của Mantine để đạt 4.5:1 (`theme.test.ts` kiểm tra); đổi màu thương hiệu thì sửa `primaryColor`.
- **Bảng không cuộn ngang.** Bảng nhiều cột dùng `useMatches` để bỏ cột phụ ở màn hẹp và đưa thông tin
  đó xuống dưới tên (xem `JobsTable`); `layout="fixed"` để tên dài bị cắt chứ không đẩy bảng rộng ra.
- **Mỗi trang một `h1`** (do `PageHeader` dựng), tiêu đề từng khối là `h2` cỡ `h4`. Breadcrumb chỉ
  truyền cho trang con (crawler, chi tiết truyện, chương, job). Trang nằm trong tab của một crawler
  vẫn gọi `PageHeader` như thường: ở đó `h1` và breadcrumb do `CategoryLayout` dựng, `PageHeader` tự
  thu lại còn mô tả và nút hành động — nên cùng một trang dùng được cả trong lẫn ngoài tab.
- **Không dựng màn hình cho dữ liệu chưa có.** Loại dữ liệu chưa có crawler ở backend thì không khai
  báo `sections`; giao diện tự hiện "Chưa triển khai" thay vì bảng trống hay số liệu giả.
- **Trạng thái đi qua `QueryState`**: tải lần đầu là skeleton, đổi trang / bộ lọc thì dữ liệu cũ mờ đi,
  lỗi có nút thử lại. Form sai thì con trỏ nhảy tới ô sai đầu tiên.
- **Nút chỉ có icon phải có `aria-label`**; thanh tiến độ đặt nhãn ở `Progress.Section`.
- **Lỗi và mô tả của ô nhập nằm dưới ô** (đặt một lần trong `theme.ts`), nên các ô đứng cạnh nhau thẳng
  hàng dù mô tả dài ngắn khác nhau. Lưới form chỉ chia hai cột từ `md`, khi nhãn còn nằm gọn một dòng.

### Thêm một màn hình mới

1. **Backend (nếu thiếu dữ liệu):** thêm truy vấn vào `NovelRepository`, kiểu trả về vào
   `src/crawl_data_app/web/schemas.py`, endpoint vào `src/crawl_data_app/web/app.py`, và test trong
   `tests/integration/test_web_api.py`.
2. **Kiểu và hook:** khai báo kiểu ở `web/src/api/types.ts`, thêm hook `useXxx` ở
   `web/src/api/queries.ts` (thao tác ghi thì nhớ `invalidateQueries` những gì bị ảnh hưởng).
3. **Trang:** tạo `web/src/pages/<ten>/<Ten>Page.tsx`, mở đầu bằng `PageHeader` và bọc phần dữ liệu
   trong `QueryState` để có sẵn trạng thái đang tải / lỗi / trống.
4. **Định tuyến:** trang của một crawler thì thêm một dòng vào `sections` (tab) hoặc `pages` (trang
   con) của loại dữ liệu tương ứng trong `web/src/crawlers/registry.tsx`. Trang chung của hệ thống thì
   thêm một `<Route>` trong `web/src/App.tsx` và một dòng trong `NAVIGATION` của
   `web/src/layouts/AppLayout.tsx`.
5. **Test:** viết `<Ten>Page.test.tsx` cạnh trang, dùng `mockApi` và `renderPage` trong
   `web/src/test/utils.tsx`.

### Thêm một crawler vào giao diện

Thêm một phần tử vào `CRAWLER_MODULES` trong `web/src/crawlers/registry.tsx`; không phải sửa layout,
menu hay bảng định tuyến:

```tsx
{
  id: 'booking',                    // thành đường dẫn /crawlers/booking
  name: 'Booking',
  description: 'Dữ liệu khách sạn và chuyến bay.',
  icon: IconBed,
  categories: [
    {
      id: 'hotel',                  // /crawlers/booking/hotel
      name: 'Khách sạn',
      description: 'Danh mục khách sạn.',
      icon: IconBed,
      Summary: HotelSummary,        // tuỳ chọn: một dòng số liệu thật trên thẻ
      sections: [                   // mỗi tab một trang; bỏ trống khi backend chưa có crawler
        { path: 'data', label: 'Dữ liệu', element: <HotelsPage /> },
      ],
      pages: [{ path: 'data/:id', element: <HotelDetailPage /> }],
    },
  ],
}
```

Trang trong `sections` viết như mọi trang khác (`PageHeader` + `QueryState`). Trang trong `pages` tự
truyền breadcrumb. Phần backend của crawler mới làm theo mục "Thêm crawler cho một website mới".

## Triển khai lên VPS

Hướng dẫn từng bước (cài đặt, secret, vận hành, gỡ lỗi): [docs/deploy-vps-tailscale.md](docs/deploy-vps-tailscale.md).
Phần này chỉ tóm tắt cách các mảnh ghép với nhau.

```text
push / merge vào main  (hoặc bấm tay: gh workflow run deploy.yml)
        ▼
GitHub Actions (.github/workflows/deploy.yml)
  test (ruff, pytest, eslint, tsc, prettier, vitest)
  → build image → chạy thử image (phải healthy)
  → push ghcr.io/<chủ>/crawl-data-app:<12 ký tự commit>
  → SSH vào VPS: chép compose.yaml + deploy.sh, chạy `sh deploy.sh <image>`
        ▼
VPS (deploy.sh): pull → sao lưu SQLite → tạo lại container → chờ health check
                 không healthy → chạy lại image cũ + database cũ, job báo đỏ
```

| File | Vai trò |
|---|---|
| `Dockerfile` | Build giao diện (Node) rồi đóng gói vào image Python; `HEALTHCHECK` gọi `GET /api/stats` (API trả lời + đọc được database). |
| `compose.yaml` | Dịch vụ `app` (cổng 8000 chỉ bind vào IP Tailscale của VPS, volume `state` giữ `.env`, `data/`, `logs/`) và dịch vụ tuỳ chọn `public` (cửa công khai). |
| `deploy.sh` | Chạy trên VPS: triển khai một image hoặc `rollback`; tự quay về bản trước khi bản mới không healthy. |
| `.github/workflows/deploy.yml` | Chỉ chạy khi code vào `main` (push hoặc merge PR; bỏ qua commit chỉ đổi `*.md` / `docs/`) hoặc bấm tay: test → build → chạy thử → **deploy**. |

```bash
gh workflow run deploy.yml --ref main                      # deploy commit mới nhất của main
gh run watch                                               # theo dõi
gh workflow run deploy.yml --ref main -f rollback=true     # quay về image chạy ngay trước đó
```

Cần biết:

- **Image gắn tag theo commit**, không dùng `latest`: trên VPS `docker compose ps` cho biết chính xác
  bản đang chạy; `.previous-image` ghi bản trước đó.
- **Mỗi lần deploy gián đoạn 5–10 giây** và job đang chạy bị ghi `interrupted` (bấm **Tiếp tục**) —
  vì vậy push thường không tự deploy.
- **Hai file `.env` khác nhau**: file cạnh `compose.yaml` trên VPS là của Docker Compose (`TAILSCALE_IP`,
  `APP_IMAGE`, `COMPOSE_PROFILES`); cấu hình của ứng dụng nằm trong volume `state` và sửa ở trang Cài đặt.
- **Secret chỉ nằm ở GitHub** (environment `production`: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
  `VPS_KNOWN_HOSTS`); registry dùng `GITHUB_TOKEN` có sẵn. Không build/push/SSH từ máy cá nhân.

**Ai truy cập được**

| Lối vào | Ai | Quyền |
|---|---|---|
| `http://<IP Tailscale>:8000` | máy trong tailnet của bạn (hoặc được *Share node*) | toàn quyền |
| `https://<tên-vps>.<tailnet>.ts.net` — cửa công khai, mặc định **tắt** | bất kỳ ai, không cần tài khoản | mọi thứ trừ lưu Cài đặt và bật/tắt nguồn |

Cửa công khai là một proxy Caddy (bật bằng `COMPOSE_PROFILES=public`, đưa ra internet bằng
`tailscale funnel`) chặn `PUT /api/settings` và `PUT /api/sources/{name}` với lỗi 403
`{"code": "owner_only", ...}`. Khách vẫn tạo/huỷ được job và xem được Cài đặt, Log — đọc mục
[Tuân thủ và giới hạn](#tuân-thủ-và-giới-hạn) trước khi bật.

## Cấu hình (`.env`)

Mọi cấu hình đọc từ biến môi trường hoặc file `.env`; xem [.env.example](.env.example).

| Nhóm | Biến | Mặc định | Ghi chú |
|---|---|---|---|
| Database | `DATABASE_URL` | `sqlite:///data/crawl-data-app.db` | PostgreSQL: `postgresql+psycopg://user:pass@host/db` |
| HTTP | `HTTP_USER_AGENT` | `crawl-data-app/<version>` | Tự nhận là bot; nên thêm thông tin liên hệ |
| HTTP | `HTTP_REQUEST_TIMEOUT` | `20` | giây |
| HTTP | `HTTP_MAX_RETRIES` | `3` | backoff 1s → 2s → 4s (có jitter), tôn trọng `Retry-After` |
| HTTP | `HTTP_CONCURRENCY` | `2` | 1–8 request đồng thời |
| HTTP | `HTTP_REQUEST_DELAY` | `2.0` | giây giữa hai request, tối thiểu `0.5` |
| Crawler | `CRAWLER_CONTENT_FORMAT` | `html` | `html` hoặc `markdown` |
| Crawler | `CRAWLER_DISABLED_SOURCES` | `[]` | Các nguồn tạm ngừng crawl, dạng JSON: `["truyenfull"]`. Web UI ghi biến này khi bật/tắt nguồn. |
| Logging | `LOG_LEVEL` | `INFO` | `DEBUG` để xem từng request |
| Logging | `LOG_DIR` | `logs` | chứa `crawler.log` |

Trần 8 kết nối và sàn 0.5 giây là có chủ đích: tốc độ tối đa của crawler là 1 request mỗi
`HTTP_REQUEST_DELAY` giây bất kể `HTTP_CONCURRENCY` (số kết nối chỉ có tác dụng khi website trả lời
chậm hơn khoảng nghỉ).

Các biến HTTP, `CRAWLER_*` và `LOG_LEVEL` cũng sửa được ở trang **Cài đặt** của web UI — giao diện ghi
thẳng vào file `.env` này (giữ nguyên chú thích và những dòng khác) và áp dụng cùng các giới hạn trên.

## Database và migration

Schema do **Alembic** quản lý; `init-db` (và mọi lệnh có dùng database) tự chạy `upgrade head`, nên
không có bước thủ công nào khi cài mới hay khi cập nhật code.

| Bảng | Nội dung | Ràng buộc chống trùng |
|---|---|---|
| `sources` | Website nguồn | `name` duy nhất |
| `novels` | Tên, tác giả, thể loại (JSON), mô tả, ảnh bìa, tình trạng, tổng số chương, URL gốc, các mốc thời gian | `(source_id, slug)` |
| `chapters` | Số thứ tự, tiêu đề, URL, `status` (`pending`/`done`/`failed`), nội dung, định dạng, hash, lỗi gần nhất | `(novel_id, slug)` |
| `crawl_runs` | Lịch sử, cũng là "job" trên web UI: URL yêu cầu, khoảng chương, `status` (`running`/`completed`/`partial`/`failed`/`interrupted`/`cancelled`), số chương cần tải/đã tải/lỗi/bỏ qua (ghi dần trong lúc chạy), lỗi, thời gian | — |

Thời gian lưu theo **UTC** (không kèm múi giờ); lệnh `status` hiển thị theo giờ máy.

Truy vấn lại dữ liệu bằng bất kỳ công cụ SQLite nào (DB Browser for SQLite, DBeaver, `sqlite3`...):

```sql
SELECT c.number, c.title, c.content
FROM chapters c JOIN novels n ON n.id = c.novel_id
WHERE n.slug = 'ten-truyen' AND c.status = 'done'
ORDER BY c.number;
```

Khi sửa `database/models.py`:

```bash
alembic revision --autogenerate -m "mo ta thay doi"   # sinh file trong database/migrations/versions/
crawl-data-app init-db                                  # hoặc: alembic upgrade head
```

Test `test_migrations_produce_exactly_the_orm_schema` sẽ đỏ nếu sửa model mà quên tạo migration.
Giữ `alembic.ini` thuần ASCII — Alembic đọc file này bằng encoding của hệ điều hành.

## Kiến trúc

```text
cli.py                      argparse + Rich: tham số, thanh tiến độ, bảng kết quả, lệnh serve
web/                        FastAPI: app.py (endpoint) · jobs.py (JobManager: job chạy nền, tạm
  │                         dừng/huỷ, một HttpClient dùng chung) · schemas.py (JSON vào/ra)
  ▼
service.py                  CrawlService: điều phối một lần crawl, đếm kết quả, quyết định dừng
  ├─ crawlers/<site>/       crawler.py (luồng tải) + parser.py (HTML → model, hàm thuần)
  │    └─ core/             http_client (giãn cách, retry, robots.txt) · base_crawler · models
  │                         (Pydantic) · content (làm sạch HTML) · exceptions
  └─ repository.py          NovelRepository: transaction ngắn, chống trùng, lịch sử crawl, truy vấn
       └─ database/         có lọc/phân trang · ORM SQLAlchemy 2 · session · migrations (Alembic)
aviation.py                 danh mục hàng không theo nguồn (world, vna): parser JSON/CSV (hàm thuần) ·
                            SOURCES (mỗi nguồn một hàm tải, 3 request qua HttpClient dùng chung) ·
                            AviationRepository (ghi đè theo nguồn + mã). Việc đồng bộ chạy thành job
                            trong web/jobs.py (JobManager.start_aviation), lịch sử nằm ở crawl_runs
config/                     settings (pydantic-settings, đọc/ghi .env) · logging (JSON Lines, đọc lại log)

web/ (thư mục gốc)          frontend React — xem "Kiến trúc frontend"; chỉ nói chuyện với backend qua /api
Dockerfile · compose.yaml   đóng gói và chạy trên VPS; deploy.sh + .github/workflows/deploy.yml lo
                            CI/CD — xem "Triển khai lên VPS"
```

Chiều phụ thuộc đi một hướng: `(cli, web) → service → (crawlers, repository) → (core, database)`. Dòng
lệnh và web UI là hai lớp vỏ của cùng một service: không có logic crawl nào nằm riêng ở một bên. Parser
không biết gì về mạng hay database; repository không biết gì về HTML.

### Quyết định kỹ thuật và lý do

| Lựa chọn | Lý do |
|---|---|
| `httpx` (async) + `BeautifulSoup4`, **không** Scrapy/Playwright | TruyenFull trả HTML render sẵn phía server, không cần JavaScript. Scrapy mang theo scheduler/pipeline riêng chồng lên kiến trúc service–repository; Playwright thêm cả một trình duyệt. Website cần JS về sau có thể override riêng các hàm `fetch_*` của crawler đó. |
| `protego` để đọc `robots.txt` | `urllib.robotparser` của thư viện chuẩn không hiểu wildcard (`Disallow: /*?sort=`) nên có thể vô tình vi phạm. |
| Định danh theo `slug`, không theo URL | Website đổi tên miền liên tục; URL chỉ là thuộc tính được cập nhật. |
| SQLite mặc định, PostgreSQL qua `DATABASE_URL` | Một file, không cần cài đặt; code chỉ dùng ORM chuẩn nên đổi được database. |
| Alembic là nguồn sự thật duy nhất của schema | Dữ liệu crawl tích luỹ lâu dài nên phải nâng cấp được schema mà không mất dữ liệu. |
| Gọi database đồng bộ trong vòng lặp async | Với nhịp ~1 request/giây, vài ms ghi SQLite không đáng kể; đổi lại code đơn giản hơn nhiều. |
| `argparse` thay vì Typer/Click | Thư viện chuẩn đủ cho 8 lệnh; bớt một cây phụ thuộc. |
| `service.py`, `repository.py`, `cli.py` là module đơn | Mỗi thứ hiện chỉ có một file; không tạo `pipelines/`, `utils/`, `scripts/` rỗng. Tách thành package khi thật sự cần. |
| Test bằng `httpx.MockTransport` + plugin `anyio` | Đều đi kèm `httpx`, không cần `respx`/`pytest-asyncio`. |
| FastAPI + uvicorn cho web UI | `CrawlService` vốn là async nên mỗi job chạy thành một task trong cùng event loop với API — không cần hàng đợi hay worker riêng. Pydantic (đã dùng sẵn) lo kiểm tra dữ liệu và sinh tài liệu `/docs`. |
| Tiến độ job ghi vào `crawl_runs`, không giữ trong bộ nhớ | API chỉ việc đọc database: tải lại trang, mở nhiều tab hay gõ `status` đều thấy cùng một con số. Giá phải trả là một lần ghi nhỏ sau mỗi chương. |
| Hỏi lại định kỳ (polling) thay vì WebSocket/SSE | Crawler tải tối đa một trang mỗi `HTTP_REQUEST_DELAY` giây (tối thiểu 0.5, mặc định 2) nên đẩy tức thời không cho thấy gì hơn hỏi lại mỗi 2 giây. Polling chỉ bật khi có job đang chạy và không phải xử lý kết nối lại. |
| Mọi job trên web dùng chung một `HttpClient` | Nhịp giãn cách request nằm trong client; dùng chung thì chạy bao nhiêu job tốc độ gửi tới website vẫn không đổi. |
| React + TypeScript + Vite, Mantine, TanStack Query | Project chưa có frontend. Mantine có sẵn layout, bảng, form, thông báo, hộp thoại xác nhận, chế độ tối; TanStack Query lo cache, polling và làm mới dữ liệu nên không cần thư viện store. |
| Cấu hình sửa trên web ghi vào `.env` | Một nguồn cấu hình duy nhất cho cả dòng lệnh lẫn web; không thêm bảng cấu hình trong database. |
| Deploy bằng GitHub Actions + GHCR, image gắn tag theo commit | Repo đã ở GitHub; khoá SSH và quyền push chỉ nằm trong GitHub Secrets. Tag theo commit thì biết chính xác bản đang chạy và rollback được về đúng bản cũ. |
| Tạo lại container, **không** blue-green | SQLite là một file và job nằm trong bộ nhớ tiến trình nên không chạy song song hai bản được. Đổi lại gián đoạn chỉ vài giây. |
| Tự deploy mỗi lần code vào `main`, PR/nhánh khác không chạy gì | `main` luôn khớp với bản đang chạy, không phải nhớ gắn tag hay bấm tay. Giá phải trả: mỗi lần deploy ngắt job crawl đang chạy (bấm **Tiếp tục**), nên commit chỉ đổi tài liệu được bỏ qua. |
| Health check dùng lại `GET /api/stats` | Endpoint có sẵn, đã chạm tới database; không thêm endpoint chỉ để kiểm tra. |
| Tailscale thay vì mở cổng ra internet | API không có đăng nhập. Cổng 8000 chỉ bind vào IP Tailscale nên không cần tên miền, chứng chỉ hay tường lửa riêng cho app. |
| Cửa công khai là một proxy Caddy chặn theo đường dẫn, không phải đăng nhập trong app | Phân biệt "chủ máy" và "khách" bằng lối vào (cổng Tailscale / Funnel) nên không phải thêm tài khoản, mật khẩu, phiên đăng nhập vào code. Giá phải trả: thêm endpoint ghi cấu hình thì phải thêm vào danh sách chặn trong `compose.yaml`. |

Những chỗ đơn giản hoá có chủ đích được đánh dấu `# ponytail:` trong code, kèm giới hạn và hướng nâng cấp.

## Thêm crawler cho một website mới

1. **Khảo sát trước:** đọc `robots.txt` và điều khoản của website; xem trang truyện, cách phân trang
   mục lục, trang chương. Chỉ dùng những đường dẫn được phép.
2. **Parser** — `src/crawl_data_app/crawlers/<site>/parser.py`, kế thừa `BaseParser`, ba hàm thuần:

   ```python
   class MySiteParser(BaseParser):
       def parse_novel(self, html: str, url: str) -> NovelInfo: ...
       def parse_chapter_list(self, html: str, url: str) -> ChapterListPage: ...  # + next_url
       def parse_chapter(self, html: str, url: str) -> ChapterContent: ...
   ```

   Thiếu dữ liệu bắt buộc thì `raise ParseError(...)`; trường tuỳ chọn không có thì để `None`.
   Dùng `core.content.extract_paragraphs(node, drop="css selector quảng cáo")` để làm sạch nội dung.
3. **Crawler** — `crawlers/<site>/crawler.py`:

   ```python
   class MySiteCrawler(BaseCrawler):
       name = "mysite"
       domains = ("mysite.com",)
       parser = MySiteParser()
   ```

   Luồng mặc định (tải trang truyện → đi theo `next_url` của mục lục → tải chương) dùng được cho đa số
   website render HTML sẵn. Override `novel_url` nếu từ URL chương suy ra được URL truyện (để người
   dùng dán URL nào cũng được), và chỉ override `fetch_novel` / `fetch_chapter_list` /
   `fetch_chapter` khi website có cơ chế riêng.
4. **Đăng ký** vào `CRAWLERS` trong `crawlers/__init__.py`.
5. **Test:** lưu HTML mẫu vào `tests/fixtures/<site>/` (tự viết theo khung markup, đừng chép nội dung
   truyện thật) và viết test parser như `tests/unit/test_truyenfull_parser.py`.
   `test_crawler_contract.py` tự kiểm tra crawler mới có tuân thủ giao diện chung.

Service, repository, CLI không phải sửa gì.

## Test, debug và lỗi thường gặp

```bash
pytest                      # 186 test, ~18 giây, không có request mạng thật nào
ruff check . && ruff format --check .

cd web                      # frontend
npm test                    # 39 test, ~12 giây, backend được giả lập
npm run lint && npm run typecheck && npm run format:check
```

GitHub Actions chạy lại đúng các lệnh trên với Python 3.12 trên **Linux** ở mỗi push/PR, rồi build và
chạy thử image. Test phải qua trên cả Windows lẫn Linux (cẩn thận khi so sánh đường dẫn).

- `tests/unit/` — parser trên HTML fixture, bộ làm sạch nội dung, HTTP client (retry, backoff, mã lỗi,
  robots.txt, giãn cách), cấu hình, giao diện crawler.
- `tests/integration/` — luồng đầu-cuối trên website giả + SQLite thật: thứ tự chương, chống trùng,
  crawl tăng dần, lỗi/timeout, bị chặn, ngắt giữa chừng rồi chạy tiếp, CLI, migration.
- `tests/integration/test_web_api.py` — API thật (FastAPI + JobManager + SQLite) trên website giả: job
  chạy nền và báo tiến độ, tạm dừng / tiếp tục / huỷ / thử lại, chống trùng job, URL sai, tìm kiếm – lọc –
  sắp xếp – phân trang, đọc chương, bật-tắt nguồn, kiểm tra kết nối, lưu cấu hình vào `.env`, lọc log,
  chặn request từ website khác.
- `web/src/**/*.test.ts(x)` — lớp gọi API (mất mạng, quá hạn, 4xx, 422, 5xx), form tạo job (kiểm tra
  dữ liệu, nội dung gửi đi, lỗi trùng job / website chưa hỗ trợ), trang job (tiến độ tự cập nhật, tạm
  dừng, huỷ có xác nhận, thử lại), danh sách truyện (tìm kiếm, lọc, phân trang, trống, lỗi).

Debug: đặt `LOG_LEVEL=DEBUG` để thấy từng request. `logs/crawler.log` là JSON Lines (mỗi dòng một sự
kiện, có trường `url` ở các dòng lỗi) nên lọc được bằng `jq`/`findstr`. `crawl-data-app status --errors`
liệt kê chương lỗi kèm URL.

| Thông báo | Nguyên nhân và cách xử lý |
|---|---|
| `Website từ chối truy cập (HTTP 403)` | Cloudflare/website chặn hoặc thách thức client. Crawler dừng, không vượt. Đợi một lúc, tăng `HTTP_REQUEST_DELAY`, rồi `resume`. |
| `robots.txt của website không cho phép truy cập` | URL nằm trong vùng cấm của website. Không có cách "tắt" kiểm tra này. |
| `Không tìm thấy tên truyện (h3.title)` / `... (#chapter-c)` | URL không phải trang truyện, hoặc website đã đổi giao diện → cập nhật selector trong parser và fixture. |
| `Thất bại sau N lần thử (ConnectError/ReadTimeout...)` | Mạng hoặc website chập chờn. Chạy `resume`; có thể tăng `HTTP_MAX_RETRIES`, `HTTP_REQUEST_TIMEOUT`. |
| `Nội dung chương rỗng (có thể là chương ảnh)` | Chương chỉ có ảnh — crawler chỉ lưu text. |
| `Chưa hỗ trợ website của URL` | Chưa có crawler cho tên miền đó (`crawl-data-app sources`). |
| `Nguồn ... đang bị tắt` | Nguồn đã bị tắt ở trang Nguồn của web UI (biến `CRAWLER_DISABLED_SOURCES`). Bật lại ở đó hoặc xoá tên nguồn khỏi biến. |
| Web UI báo `Không kết nối được tới máy chủ` | Backend chưa chạy hoặc đã tắt: chạy `crawl-data-app serve`. Khi dùng `npm run dev`, kiểm tra `VITE_DEV_PROXY_TARGET`. |
| `serve` báo `Chưa có bản build giao diện` | Chưa chạy `npm run build` trong `web/`, hoặc đang chạy `serve` từ thư mục khác (dùng `--ui-dir`). |
| `UnicodeDecodeError` khi chạy `alembic` | `alembic.ini` có ký tự ngoài ASCII. |
| Máy khác clone về thiếu file, CI báo `Cannot find module` | File bị `.gitignore` nuốt. Các mẫu `/data/`, `/logs/`, `/exports/` phải neo vào gốc repo; kiểm tra bằng `git status --ignored`. |
| Workflow đỏ ở job `deploy` | Xem mục "Khi workflow đỏ" trong [hướng dẫn triển khai](docs/deploy-vps-tailscale.md#deploy-rollback-kiểm-tra). Đỏ sau dòng `ROLLBACK` nghĩa là VPS đã tự chạy lại bản cũ. |
| Cửa công khai báo `Chỉ chủ máy chủ mới đổi được cấu hình` | Đúng thiết kế: lưu Cài đặt và bật/tắt nguồn chỉ làm được qua địa chỉ Tailscale `:8000`. |

## Tuân thủ và giới hạn

**Crawler làm gì để không gây hại**

- Kiểm tra `robots.txt` của từng host trước mọi request, kể cả host đích của chuyển hướng; tôn trọng
  `Crawl-delay`. Không đọc được `robots.txt` (trừ 404) thì không crawl.
- Một nhịp request chung (mặc định 2 giây/request), tối đa 8 kết nối; thử lại có backoff và tôn trọng
  `Retry-After`; dừng khi bị từ chối hoặc lỗi liên tiếp.
- User-Agent mặc định tự nhận là bot (`crawl-data-app/<version>`), không giả trình duyệt.
- Không giải CAPTCHA, không đăng nhập, không lưu cookie hay dữ liệu cá nhân. Crawler truyện không gọi
  API/AJAX nội bộ; crawler Vietnam Airlines thì đọc đúng các file JSON công khai mà trang của hãng tự
  tải (xem khảo sát bên dưới).

**Khảo sát TruyenFull (ngày 05/10/2026, từ một mạng tại Việt Nam)**

- `truyenfull.vn` chỉ còn chuyển hướng sang `truyenfull.vision`, rồi sang `truyenfull.today` hoặc
  `truyenfull.live`. Kết nối TLS tới `.vision`/`.today` thường xuyên thất bại; **`truyenfull.live`
  ổn định nhất — nên dùng URL của tên miền này**. Crawler nhận mọi tên miền `truyenfull.<tld>`.
- `robots.txt` cấm `/ajax`, `/api`, `/tim-kiem/` → mục lục được lấy qua phân trang HTML
  (`/<truyen>/trang-N/`, 50 chương/trang), không dùng endpoint AJAX.
- Website đứng sau Cloudflare. Trong lúc khảo sát đã có một request bị trả `403` kèm
  `cf-mitigated: challenge` (chưa rõ điều kiện kích hoạt); các lần crawl thử sau đó (khoảng 40
  request, 2 giây/request) không bị chặn. Không có gì đảm bảo điều này giữ nguyên.
- Trang chương có lớp phủ JavaScript mời người đọc bấm quảng cáo trước khi xem (từ chương 2), nhưng
  HTML server trả về đã chứa toàn bộ nội dung. Crawler chỉ đọc HTML đó: không chạy JS, không giả lập
  thao tác bấm, không gọi thêm endpoint nào. Lưu ý rằng như vậy là đọc nội dung mà không tạo doanh thu
  quảng cáo cho website — việc này có phù hợp với mục đích của bạn hay không là quyết định của bạn.
- Website không có trang điều khoản sử dụng riêng (footer ghi giấy phép CC BY 4.0 cho website); điều
  đó không thay đổi bản quyền của từng tác phẩm.

**Khảo sát Vietnam Airlines (ngày 05/10/2026)**

- `robots.txt` của `www.vietnamairlines.com` không cấm đường dẫn nào (`Disallow:` rỗng).
- **Điều khoản sử dụng website chỉ cho phép dùng vào mục đích cá nhân, phi thương mại**, và cấm dùng
  công cụ tự động trích xuất dữ liệu cho mục đích thương mại. Crawler này chỉ được dùng trong phạm vi
  đó; muốn dùng dữ liệu cho sản phẩm có thu tiền thì phải xin phép hãng hoặc đổi sang nguồn dữ liệu mở.
- Dữ liệu không nằm trong HTML mà trong các file JSON trang của hãng tự tải, không cần đăng nhập:
  `/bin/vna/sky/route/flight-route.<ngôn ngữ>-vn.json` (vùng → quốc gia → thành phố → sân bay, dùng cho
  ô chọn điểm đi/đến; bản tiếng Anh và tiếng Việt) và `/graphql/execute.json/vna/freqflyerprogramList`
  (hãng bay có chương trình khách hàng thường xuyên liên kết). Đây là endpoint nội bộ của website,
  không phải API được công bố: hãng có thể đổi hoặc gỡ bất cứ lúc nào, khi đó lần đồng bộ báo lỗi
  parser và dữ liệu cũ được giữ nguyên.
- Một lần đồng bộ là 4 request (`robots.txt` + 3 file, mỗi file bản điểm đi/đến khoảng 4 MB), theo
  nhịp giãn cách chung; lần chạy thử mất 8 giây và cho 469 sân bay, 464 thành phố, 64 quốc gia, 18
  hãng bay. Danh mục hiếm khi đổi — không cần đồng bộ thường xuyên.
- "Hãng bay" chỉ là danh sách hãng trong ô chọn chương trình khách hàng thường xuyên, không phải toàn
  bộ hãng bay. Tên sân bay là tên hiển thị của hãng (ví dụ "Tokyo Narita"), không phải tên chính thức;
  nguồn không có toạ độ, múi giờ hay mã ICAO.
- Mã `PNH` có trong phần điểm đến của file nhưng không kèm tên, thành phố hay quốc gia nên không được
  lưu. Chỉ bản dành cho thị trường Việt Nam (`-vn`) được đọc; bản của thị trường khác chưa được so.

**Nguồn hàng không toàn thế giới (khảo sát ngày 05/10/2026)**

- **OurAirports** (`davidmegginson.github.io/ourairports-data`): `countries.csv` và `airports.csv`,
  dữ liệu thuộc phạm vi công cộng. Host không có `robots.txt` (404, tức không hạn chế). File sân bay
  khoảng 13 MB với hơn 86.000 dòng; crawler chỉ giữ sân bay **còn hoạt động có mã IATA** (9.051), bỏ
  bãi đáp nhỏ, sân bay trực thăng không mã và sân bay đã đóng.
- **OpenFlights** (`raw.githubusercontent.com/jpatokal/openflights`): `airlines.dat`, giấy phép
  **ODbL — dùng lại hay phân phối lại phải ghi nguồn và giữ nguyên giấy phép**. Crawler giữ hãng đang
  hoạt động có mã IATA (983); mã trùng thì lấy dòng đầu. Dự án này ít được cập nhật trong vài năm
  gần đây, nên có thể thiếu hãng mới và còn hãng đã ngừng bay.
- **Thành phố là dữ liệu suy ra**, không phải danh mục chuẩn: lấy từ cột "municipality" của từng sân
  bay, gộp theo (quốc gia, tên) và tự đặt mã dạng `VN-ho-chi-minh-city` vì dữ liệu mở không có mã
  thành phố. Cột này do cộng đồng nhập nên có chỗ lộn xộn (ví dụ "Hanoi (Soc Son)" hay tên viết sai),
  và cùng một thành phố có thể thành nhiều dòng nếu các sân bay ghi tên khác nhau.
- Một lần đồng bộ là 3 request (cộng `robots.txt` của mỗi host); lần chạy thử mất 11 giây và cho
  9.051 sân bay, 8.161 thành phố, 249 quốc gia, 983 hãng bay. Không có tên tiếng Việt.
- Tìm kiếm và phân trang đang lọc trong bộ nhớ; với nguồn này một lần tìm mất khoảng 0,3 giây.

**Giới hạn hiện tại**

- Chỉ lưu **text**: mất định dạng in đậm/nghiêng và ảnh minh hoạ; chương toàn ảnh bị báo lỗi.
- `source_updated_at` (thời điểm cập nhật do nguồn công bố) luôn `NULL` với TruyenFull vì trang truyện
  không có thông tin này. Thay vào đó có `published_at` (ngày đăng truyện) và `updated_at` (lần gần
  nhất crawler phát hiện thông tin đổi hoặc có chương mới).
- Tổng số chương được đếm từ mục lục nên chỉ có sau khi crawl chương (`0/?` nếu mới lấy thông tin).
- Mỗi lần crawl chương đều duyệt lại toàn bộ mục lục (1 request cho mỗi 50 chương).
- Nội dung chương bị sửa âm thầm (không đổi tiêu đề) chỉ được phát hiện khi chạy `--force`.
- File EPUB xuất ra là bản tối giản: không có ảnh bìa, không có `toc.ncx` cho máy đọc EPUB 2 đời cũ.
- Mỗi database nên chỉ có một tiến trình crawl chạy cùng lúc — hoặc dòng lệnh, hoặc server web UI.
- PostgreSQL: code không dùng tính năng riêng của SQLite nhưng **chưa được chạy thử** trên PostgreSQL.

**Giới hạn của web UI**

- **Không có đăng nhập hay phân quyền trong ứng dụng** — thiết kế cho một người dùng trên máy của chính
  họ. Trên VPS, quyền được quyết định bởi lối vào: ai tới được cổng 8000 (qua Tailscale) có toàn quyền;
  khách qua cửa công khai chỉ bị chặn đổi cấu hình, vẫn tạo/huỷ được job và xem được Cài đặt, Log.
  Nút Lưu và công tắc bật/tắt nguồn vẫn hiện với khách, bấm vào mới báo lỗi.
- **Chạy công khai là phát lại dữ liệu cho mọi người**, khác với dùng riêng: nội dung truyện có bản
  quyền, dữ liệu `vna` chỉ được dùng cá nhân, phi thương mại, dữ liệu OpenFlights (ODbL) phải ghi nguồn.
  Người bật cửa công khai tự chịu trách nhiệm về việc đó; khách crawl bằng VPS và địa chỉ IP của chủ máy.
- Job chạy trong bộ nhớ của tiến trình `serve`: tắt server là job dừng (ghi `interrupted`, bấm Tiếp tục
  để chạy lại), và `serve` chỉ chạy được một tiến trình (không có tuỳ chọn nhiều worker).
- "Tiếp tục" tạo một job mới chứ không nối tiếp job cũ, nên thanh tiến độ của job mới chỉ tính phần còn lại.
- Cấu hình HTTP mới chỉ áp dụng khi không còn job nào đang chạy.
- Trang Log chỉ đọc file `crawler.log` hiện tại (tối đa 5 MB), không đọc các file đã xoay vòng; job quá
  cũ có thể không còn log.
- "Kiểm tra kết nối" chỉ tải trang chủ của nguồn: xác nhận website truy cập được và `robots.txt` cho
  phép, **không** xác nhận parser còn khớp cấu trúc trang.
- Tìm không dấu chỉ áp dụng cho tên truyện (dựa trên slug), chưa áp dụng cho tên tác giả.
- Chưa có xoá truyện từ giao diện. Giao diện chỉ xuất JSON; muốn `.txt` / `.epub` thì dùng lệnh `export`.
- Bản build gồm một file JavaScript khoảng 630 kB (194 kB khi nén gzip), chưa tách theo từng trang.
- Giao diện chỉ có tiếng Việt.
