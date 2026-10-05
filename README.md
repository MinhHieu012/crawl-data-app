# crawl-data-app

Crawl truyện chữ từ các website đọc truyện (hiện có **TruyenFull**) vào SQLite/PostgreSQL:
thông tin truyện, mục lục và nội dung từng chương đã làm sạch. Thiết kế để chạy lâu dài một cách
"lịch sự": giãn cách request, tuân thủ `robots.txt`, tự chạy tiếp sau khi bị gián đoạn và không tải lại
những gì đã có. Dùng qua dòng lệnh, hoặc qua [web UI](#web-ui) chạy trên chính máy bạn.

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
| `export` | Xuất các chương đã tải ra `exports/<slug>.txt`, mỗi truyện một file (UTF-8). `--format epub` để xuất EPUB 3 có mục lục, `--format json` để xuất thông tin truyện kèm từng chương dạng danh sách đoạn văn, `--novel-id ID` để chọn truyện (ID xem ở `status`), `--out DIR` để đổi thư mục. |
| `sources` | Các website được hỗ trợ. |
| `init-db` | Tạo database / nâng schema lên bản mới nhất. |
| `serve` | Chạy [web UI](#web-ui) và API tại `http://127.0.0.1:8000`. `--port N` đổi cổng, `--ui-dir DIR` trỏ tới bản build giao diện ở chỗ khác, `--host` đổi địa chỉ lắng nghe (đọc phần bảo mật trước). |

Mã thoát: `0` mọi thứ hoàn tất · `1` có truyện/chương lỗi · `2` sai tham số hoặc cấu hình · `130` bị ngắt (Ctrl+C).

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
> crawler và sửa được cấu hình — chỉ dùng trong mạng bạn tin tưởng.

### Các màn hình

| Màn hình | Đường dẫn | Nội dung |
|---|---|---|
| Tổng quan | `/` | Số truyện, số chương, số job theo trạng thái; các job gần đây kèm thanh tiến độ. |
| Crawl truyện | `/crawl` | Tạo job: URL truyện, nguồn, phạm vi (toàn bộ / khoảng chương / chỉ thông tin), bỏ qua chương đã tải, thử lại chương lỗi. Tạo xong chuyển thẳng sang trang theo dõi job. |
| Job crawl | `/jobs`, `/jobs/:id` | Danh sách có lọc theo trạng thái và phân trang. Chi tiết: tiến độ, số chương thành công / lỗi / còn lại, chương vừa tải, nút tạm dừng / huỷ / tiếp tục / thử lại, log của riêng job đó. |
| Truyện | `/novels`, `/novels/:id` | Tìm theo tên hoặc tác giả (gõ không dấu cũng ra tên truyện), lọc theo nguồn và tình trạng, sắp xếp, phân trang. Chi tiết: thông tin truyện, danh sách chương theo trạng thái, tải chương còn thiếu / theo khoảng / tải lại một chương, lịch sử crawl. |
| Đọc chương | `/novels/:id/chapters/:n` | Nội dung chương, chuyển chương trước / sau; chương chưa có thì tải ngay từ đây. |
| Nguồn | `/sources` | Bật / tắt từng nguồn, kiểm tra kết nối, xem thông tin crawler và cấu hình HTTP đang áp dụng. |
| Log | `/logs` | Lọc theo mức (INFO / WARNING / ERROR), loại lỗi (request / parser), job, từ khoá; có chế độ tự làm mới. |
| Cài đặt | `/settings` | Timeout, số lần thử lại, khoảng nghỉ, số request đồng thời, User-Agent, định dạng nội dung, mức log. Database và thư mục log chỉ xem (mật khẩu trong URL database được che). |

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
| `POST /api/crawl/jobs` | Tạo job: `url`, `source`, `with_chapters`, `from_chapter`, `to_chapter`, `force`, `retry_failed`. |
| `GET /api/crawl/jobs` | Danh sách job: `status`, `novel_id`, `page`, `page_size`. |
| `GET /api/crawl/jobs/{id}` | Một job kèm tiến độ và chương vừa tải. |
| `POST /api/crawl/jobs/{id}/pause` | Tạm dừng job đang chạy. |
| `POST /api/crawl/jobs/{id}/cancel` | Huỷ job đang chạy hoặc đang tạm dừng. |
| `POST /api/crawl/jobs/{id}/resume` · `/retry` | Chạy lại đúng phạm vi cũ thành một job mới (hai tên, một việc). |
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
├── App.tsx            bảng định tuyến — mỗi màn hình một route
├── theme.ts           theme Mantine: màu chữ đủ tương phản, mặc định của Badge / Switch / ô số
├── api/
│   ├── client.ts      một cửa gọi backend: ghép URL, timeout, đổi mọi lỗi thành ApiError đọc được
│   ├── types.ts       kiểu dữ liệu, phản chiếu src/crawl_data_app/web/schemas.py
│   └── queries.ts     mỗi endpoint một hook: cache, hỏi lại định kỳ, làm mới dữ liệu liên quan
├── layouts/           AppLayout: thanh trên, menu trái, nút sáng/tối, số job đang chạy
├── pages/<màn hình>/  dashboard · crawl · jobs · novels · sources · logs · settings
├── components/        QueryState (đang tải / lỗi / trống) · PageHeader (breadcrumb) · JobsTable ·
│                      JobProgress · NovelProgress · LogList · StatusBadge · ListControls · Cover
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
  truyền cho trang con (chi tiết truyện, chương, job).
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
4. **Định tuyến:** thêm một `<Route>` trong `web/src/App.tsx` và một dòng trong `NAVIGATION` của
   `web/src/layouts/AppLayout.tsx` nếu trang cần hiện trên menu.
5. **Test:** viết `<Ten>Page.test.tsx` cạnh trang, dùng `mockApi` và `renderPage` trong
   `web/src/test/utils.tsx`.

## Cấu hình (`.env`)

Mọi cấu hình đọc từ biến môi trường hoặc file `.env`; xem [.env.example](.env.example).

| Nhóm | Biến | Mặc định | Ghi chú |
|---|---|---|---|
| Database | `DATABASE_URL` | `sqlite:///data/novels.db` | PostgreSQL: `postgresql+psycopg://user:pass@host/db` |
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
config/                     settings (pydantic-settings, đọc/ghi .env) · logging (JSON Lines, đọc lại log)

web/ (thư mục gốc)          frontend React — xem "Kiến trúc frontend"; chỉ nói chuyện với backend qua /api
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
| `argparse` thay vì Typer/Click | Thư viện chuẩn đủ cho 5 lệnh; bớt một cây phụ thuộc. |
| `service.py`, `repository.py`, `cli.py` là module đơn | Mỗi thứ hiện chỉ có một file; không tạo `pipelines/`, `utils/`, `scripts/` rỗng. Tách thành package khi thật sự cần. |
| Test bằng `httpx.MockTransport` + plugin `anyio` | Đều đi kèm `httpx`, không cần `respx`/`pytest-asyncio`. |
| FastAPI + uvicorn cho web UI | `CrawlService` vốn là async nên mỗi job chạy thành một task trong cùng event loop với API — không cần hàng đợi hay worker riêng. Pydantic (đã dùng sẵn) lo kiểm tra dữ liệu và sinh tài liệu `/docs`. |
| Tiến độ job ghi vào `crawl_runs`, không giữ trong bộ nhớ | API chỉ việc đọc database: tải lại trang, mở nhiều tab hay gõ `status` đều thấy cùng một con số. Giá phải trả là một lần ghi nhỏ sau mỗi chương. |
| Hỏi lại định kỳ (polling) thay vì WebSocket/SSE | Crawler tải tối đa một trang mỗi `HTTP_REQUEST_DELAY` giây (tối thiểu 0.5, mặc định 2) nên đẩy tức thời không cho thấy gì hơn hỏi lại mỗi 2 giây. Polling chỉ bật khi có job đang chạy và không phải xử lý kết nối lại. |
| Mọi job trên web dùng chung một `HttpClient` | Nhịp giãn cách request nằm trong client; dùng chung thì chạy bao nhiêu job tốc độ gửi tới website vẫn không đổi. |
| React + TypeScript + Vite, Mantine, TanStack Query | Project chưa có frontend. Mantine có sẵn layout, bảng, form, thông báo, hộp thoại xác nhận, chế độ tối; TanStack Query lo cache, polling và làm mới dữ liệu nên không cần thư viện store. |
| Cấu hình sửa trên web ghi vào `.env` | Một nguồn cấu hình duy nhất cho cả dòng lệnh lẫn web; không thêm bảng cấu hình trong database. |

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
pytest                      # 151 test, ~15 giây, không có request mạng thật nào
ruff check . && ruff format --check .

cd web                      # frontend
npm test                    # 28 test, ~12 giây, backend được giả lập
npm run lint && npm run typecheck && npm run format:check
```

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

## Tuân thủ và giới hạn

**Crawler làm gì để không gây hại**

- Kiểm tra `robots.txt` của từng host trước mọi request, kể cả host đích của chuyển hướng; tôn trọng
  `Crawl-delay`. Không đọc được `robots.txt` (trừ 404) thì không crawl.
- Một nhịp request chung (mặc định 2 giây/request), tối đa 8 kết nối; thử lại có backoff và tôn trọng
  `Retry-After`; dừng khi bị từ chối hoặc lỗi liên tiếp.
- User-Agent mặc định tự nhận là bot (`crawl-data-app/<version>`), không giả trình duyệt.
- Không giải CAPTCHA, không đăng nhập, không gọi API/AJAX nội bộ, không lưu cookie hay dữ liệu cá nhân.

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

- **Không có đăng nhập hay phân quyền** — thiết kế cho một người dùng trên máy của chính họ.
- Job chạy trong bộ nhớ của tiến trình `serve`: tắt server là job dừng (ghi `interrupted`, bấm Tiếp tục
  để chạy lại), và `serve` chỉ chạy được một tiến trình (không có tuỳ chọn nhiều worker).
- "Tiếp tục" tạo một job mới chứ không nối tiếp job cũ, nên thanh tiến độ của job mới chỉ tính phần còn lại.
- Cấu hình HTTP mới chỉ áp dụng khi không còn job nào đang chạy.
- Trang Log chỉ đọc file `crawler.log` hiện tại (tối đa 5 MB), không đọc các file đã xoay vòng; job quá
  cũ có thể không còn log.
- "Kiểm tra kết nối" chỉ tải trang chủ của nguồn: xác nhận website truy cập được và `robots.txt` cho
  phép, **không** xác nhận parser còn khớp cấu trúc trang.
- Tìm không dấu chỉ áp dụng cho tên truyện (dựa trên slug), chưa áp dụng cho tên tác giả.
- Chưa có xoá truyện và xuất file từ giao diện (vẫn dùng lệnh `export`).
- Bản build gồm một file JavaScript khoảng 630 kB (194 kB khi nén gzip), chưa tách theo từng trang.
- Giao diện chỉ có tiếng Việt.
