# CLAUDE.md

Context cho Claude Code. Chi tiết đầy đủ (API, màn hình, khảo sát từng website, bảng lỗi thường gặp) nằm trong
[README.md](README.md) — file này chỉ giữ phần ảnh hưởng trực tiếp tới việc sửa code. Làm việc, comment, README
và chữ trên UI bằng **tiếng Việt**.

## Project Overview

Crawler thu thập dữ liệu công khai vào SQLite (mặc định) / PostgreSQL, dùng được qua CLI hoặc web UI — chạy trên máy cá nhân,
hoặc trên một VPS bằng Docker (đang chạy thật; deploy qua GitHub Actions):

- **Truyện chữ**: thông tin truyện, mục lục, nội dung chương đã làm sạch (hiện có nguồn **TruyenFull**).
- **Danh mục hàng không**: sân bay, hãng bay, thành phố, quốc gia từ 2 nguồn — `world` (OurAirports + OpenFlights) và `vna` (vietnamairlines.com).
- **Tỉnh thành Việt Nam**: 34 tỉnh, thành phố sau sáp nhập 2025 kèm phường/xã trực thuộc, từ bộ dữ liệu mở `thanglequoc/vietnamese-provinces-database` (MIT).

Thiết kế để chạy lâu dài và "lịch sự": giãn cách request, tuân thủ `robots.txt`, chạy tiếp sau khi bị ngắt, không tải lại thứ đã có.

## Architecture

```text
User ─ CLI (cli.py, argparse + Rich) ─────────┐
     └ Web UI (React, web/) ─ /api ─ FastAPI ──┤   (hai lớp vỏ của cùng một service)
                                (web/app.py)   ▼
                          web/jobs.py (JobManager: job nền)
                                               ▼
                          service.py (CrawlService: điều phối một lần crawl)
                            ├─ crawlers/<site>/  crawler.py + parser.py (HTML → model)
                            │    └─ core/        http_client · base_crawler · models · content · exceptions
                            └─ repository.py     NovelRepository (transaction ngắn, chống trùng, lịch sử)
                                 └─ database/    ORM SQLAlchemy 2 · session · migrations (Alembic)
aviation.py: parser JSON/CSV (hàm thuần) + SOURCES + AviationRepository; chạy thành job qua JobManager.start_aviation
provinces.py: parser JSON (hàm thuần) + ProvinceRepository; dùng lại `aviation.run_sync`; job qua JobManager.start_provinces
```

Phụ thuộc đi một chiều: `(cli, web) → service → (crawlers, repository) → (core, database)`. Parser không biết mạng/DB;
repository không biết HTML; frontend không có logic crawl (nhận diện website, chuẩn hoá URL, chống trùng job đều ở backend).

## Technology Stack

- **Backend**: Python ≥ 3.12 (dev trên 3.14), `httpx` async, `beautifulsoup4`, `protego` (robots.txt), SQLAlchemy 2 + Alembic,
  Pydantic 2 / pydantic-settings, FastAPI + uvicorn, Rich, `argparse` (không Typer/Click). Build: hatchling.
- **Frontend** (`web/`): React 19 + TypeScript (strict) + Vite, Mantine 8, TanStack Query, React Router 7. Không có thư viện store.
- **Test/lint**: pytest (+ plugin `anyio`, `httpx.MockTransport`), ruff · Vitest + Testing Library, ESLint, Prettier.
- Docker + CI/CD: `Dockerfile`, `compose.yaml`, `deploy.sh` (chạy trên VPS), `.github/workflows/deploy.yml`. Không dùng Scrapy/Playwright (có chủ đích — xem README mục "Quyết định kỹ thuật").

## Project Structure

```text
src/crawl_data_app/
├── cli.py            lệnh: crawl · resume · status · export · aviation · sources · init-db · serve
├── service.py        CrawlService
├── repository.py     NovelRepository (mọi truy vấn truyện/chương/crawl_runs)
├── aviation.py       đồng bộ danh mục hàng không (+ `run_sync`: phần chạy job dùng chung cho mọi crawler kiểu danh mục)
├── provinces.py      đồng bộ danh mục 34 tỉnh thành Việt Nam kèm phường/xã (1 request)
├── export.py         xuất txt / epub / json
├── core/             http_client (giãn cách, retry, robots) · base_crawler (BaseParser/BaseCrawler) · models · content · exceptions
├── crawlers/         __init__.py (CRAWLERS + crawler_class_for) · truyenfull/{crawler,parser}.py
├── config/           settings (đọc/ghi .env) · logging (JSON Lines)
├── database/         models.py · session.py · migrations/versions/ (Alembic)
└── web/              app.py (endpoint, create_app) · jobs.py (JobManager) · schemas.py (JSON vào/ra)
tests/                unit/ · integration/ · fixtures/ (HTML/JSON/CSV mẫu tự viết)
web/src/              api/ (client, queries, types) · crawlers/registry.tsx · pages/ · components/ · layouts/ · hooks/ · theme.ts
Dockerfile            build web (Node) → image Python; HEALTHCHECK gọi GET /api/stats
compose.yaml          dịch vụ app (cổng 8000 chỉ bind IP Tailscale, volume state) + public (Caddy, profile tuỳ chọn)
deploy.sh             chạy TRÊN VPS: pull → sao lưu SQLite → up → chờ healthy → tự rollback
.github/workflows/    deploy.yml: test → build → chạy thử image → push GHCR → SSH deploy
docs/                 deploy-vps-tailscale.md (cài VPS, secret, vận hành, cửa công khai)
```

## Core Concepts

- **Source / Crawler**: một website = một `BaseCrawler` (`name`, `domains`, `parser`) đăng ký trong `CRAWLERS`. Bật/tắt qua `CRAWLER_DISABLED_SOURCES`.
- **Novel / Chapter**: truyện định danh theo `(source, slug)`, chương theo `(novel, slug)` — **không theo URL** (website đổi tên miền liên tục). Chương có `status` `pending|done|failed`, kèm hash SHA-256 để phát hiện thay đổi.
- **Job = một dòng `crawl_runs`**: dùng chung cho cả crawl truyện và các job đồng bộ (cột `crawler`: `novel`, `aviation:world`, `aviation:vna`, `provinces`). Trạng thái `running|completed|partial|failed|interrupted|cancelled`; tiến độ ghi vào DB sau mỗi chương, API chỉ đọc DB. Các cột `chapters_*` đếm file với job đồng bộ (hàng không, tỉnh thành).
- **resume / retry**: tạo job *mới* chạy lại đúng phạm vi cũ, chỉ tải chương chưa xong; job `cancelled` thì `resume` không tự chạy lại.
- **Aviation sync**: tải đủ 3 file rồi mới ghi (job lỗi giữa chừng không làm mất dữ liệu cũ); ghi đè theo `(nguồn, mã)`; mỗi nguồn một job tại một thời điểm.

## Crawler Architecture & Thêm crawler mới

Luồng: `BaseCrawler.fetch_*` → `HttpClient` (robots, giãn cách, retry) → `BaseParser` (hàm thuần) → `CrawlService` → `NovelRepository` → DB.
Một nhịp request chung cho toàn tiến trình (mặc định 2 giây/request); mọi job web dùng chung một `HttpClient`.

Thêm website truyện mới (không phải sửa service/repository/CLI):
1. Đọc `robots.txt` + điều khoản của website trước; chỉ dùng đường dẫn được phép.
2. `crawlers/<site>/parser.py`: kế thừa `BaseParser` (`parse_novel`, `parse_chapter_list` kèm `next_url`, `parse_chapter`); thiếu dữ liệu bắt buộc → `ParseError`; làm sạch bằng `core.content.extract_paragraphs`.
3. `crawlers/<site>/crawler.py`: kế thừa `BaseCrawler`, khai `name`, `domains`, `parser`; chỉ override `novel_url`/`fetch_*` khi website có cơ chế riêng.
4. Đăng ký vào `CRAWLERS` trong `crawlers/__init__.py`.
5. Fixture HTML tự viết theo khung markup (đừng chép nội dung truyện thật) vào `tests/fixtures/<site>/`; test parser theo mẫu `tests/unit/test_truyenfull_parser.py`. `test_crawler_contract.py` tự kiểm tra giao diện chung.
6. Nếu muốn có trong UI: thêm module vào `CRAWLER_MODULES` (`web/src/crawlers/registry.tsx`).

Nguồn hàng không mới: thêm parser (hàm thuần trả `list[Record]`) + hàm `fetch_<nguồn>` (gọi `fetch` đúng `FILES_PER_SYNC` = 3 lần) vào `SOURCES`/`HOMES` trong `aviation.py`, rồi cập nhật `registry.tsx`.

Danh mục kiểu "tải vài file rồi ghi đè" khác (mẫu: `provinces.py`): parser hàm thuần + repository riêng + `sync` gọi `aviation.run_sync`; thêm `JobManager.start_<tên>`, nhánh chạy lại trong `rerun_job` (`web/app.py`), tên job trong `web/src/utils/format.ts` và đường dẫn trong `jobDataPath` (`web/src/crawlers/paths.ts`).

## Backend Architecture

- **API**: `web/app.py` — `create_app(...)`, router `/api`, lỗi luôn dạng `{"code", "detail"}` (detail tiếng Việt) qua `ApiError`; `schemas.py` là hợp đồng JSON. Chặn cross-site write và DNS rebinding (`TrustedHostMiddleware`); **API không có đăng nhập**, mặc định chỉ nghe `127.0.0.1`.
- **Jobs**: `web/jobs.py` `JobManager` — mỗi job là asyncio task trong cùng event loop, không hàng đợi/worker riêng; chặn job trùng (`DuplicateJobError`).
- **Service/Repository**: `CrawlService` quyết định dừng (bị chặn 401/403 → dừng cả loạt; `MAX_CONSECUTIVE_FAILURES = 5`). Repository dùng transaction ngắn, mỗi chương commit riêng. DB gọi **đồng bộ** trong vòng lặp async (có chủ đích).
- **Lỗi domain**: `core/exceptions.py` (`CrawlerError` → `UnsupportedSiteError`, `SourceDisabledError`, `ParseError`, `FetchError` → `NotFoundError`/`RobotsDisallowedError`/`BlockedError`).
- **Config**: `config/settings.py` — nhóm `HttpSettings`, `CrawlerSettings`, `DatabaseSettings`, `LogSettings`; trang Cài đặt của web ghi thẳng vào `.env` (`save_env`, giữ chú thích), biến môi trường OS ưu tiên hơn `.env`.
- Thời gian lưu DB là UTC naive; API trả `...Z`.

## Deployment

Chi tiết: [docs/deploy-vps-tailscale.md](docs/deploy-vps-tailscale.md) và mục "Triển khai lên VPS" trong README.

- **Luồng**: `.github/workflows/deploy.yml` — job `test` → `build` (build + chạy thử image, push `ghcr.io/minhhieu012/crawl-data-app:<12 ký tự commit>`) → `deploy` (scp `compose.yaml` + `deploy.sh` lên VPS, chạy `sh deploy.sh <image>`). **Chỉ chạy khi code vào `main`** (push/merge PR; bỏ qua commit chỉ đổi `*.md` / `docs/`) hoặc `workflow_dispatch`, và luôn chạy tới deploy — PR/nhánh khác không kích hoạt gì (tạo lại container làm job đang chạy thành `interrupted`).
- **`deploy.sh`**: ghi `APP_IMAGE` vào `.env` cạnh `compose.yaml`, `docker compose up --wait` dựa vào `HEALTHCHECK`; không healthy thì khôi phục `data/pre-deploy.db` và chạy lại image cũ, thoát mã 1. `.previous-image` giữ bản trước; `sh deploy.sh rollback` quay về đó (không khôi phục DB).
- **Hai file `.env`**: cạnh `compose.yaml` trên VPS là của Compose (`TAILSCALE_IP`, `APP_IMAGE`, `COMPOSE_PROFILES`); cấu hình app nằm trong volume `crawl-data-app_state` (`/srv/state/.env`).
- **Truy cập**: cổng 8000 chỉ bind IP Tailscale = toàn quyền (chủ máy). Dịch vụ `public` (Caddy, `COMPOSE_PROFILES=public`, ra internet bằng `tailscale funnel --bg 8080`) cho khách dùng mọi thứ **trừ** `PUT /api/settings` và `PUT /api/sources/*` (403 `owner_only`, do proxy trả, không phải `ApiError` của app).
- **Secret**: chỉ ở GitHub environment `production` (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`; biến `VPS_PATH`, `VPS_PORT`). Máy cá nhân không giữ khoá vào VPS — cần chạy lệnh trên VPS thì đưa lệnh cho người dùng.
- CI chạy trên **Linux**, Python 3.12, Node 22; máy dev là Windows → test không được phụ thuộc dấu phân cách đường dẫn hay CRLF (`*.sh` ép LF qua `.gitattributes`).

## Frontend Architecture

- `main.tsx` (provider Mantine + TanStack Query + router) → `App.tsx` (route chung; route khu vực Crawler sinh từ `crawlers/registry.tsx`: module → loại dữ liệu → tab).
- **API layer**: `api/client.ts` (một cửa gọi backend, mọi lỗi thành `ApiError`), `api/queries.ts` (mỗi endpoint một hook, tự `invalidateQueries`), `api/types.ts` (**phản chiếu `web/schemas.py`** — đổi một bên phải đổi bên kia).
- **State**: dữ liệu server chỉ ở cache TanStack Query; bộ lọc/số trang nằm trên URL (`useUrlState`); form dùng `@mantine/form`. Tiến độ job = polling 2 giây, chỉ khi có job chạy.
- Giao tiếp: trình duyệt chỉ thấy một origin — backend phục vụ `web/dist` ở production; dev dùng Vite proxy `/api` → `127.0.0.1:8000`.
- Quy ước UI: màu/cỡ chữ lấy từ `theme.ts` (không hardcode); bảng không cuộn ngang (`useMatches`, `layout="fixed"`); mỗi trang một `h1` qua `PageHeader`; trạng thái tải/lỗi/trống qua `QueryState`; nút chỉ có icon phải có `aria-label`; không dựng màn hình cho dữ liệu chưa có backend.

Thêm trang mới: (backend nếu thiếu) repository → `schemas.py` → endpoint → test `tests/integration/test_web_api.py`; rồi `api/types.ts` → hook trong `api/queries.ts` → `pages/<ten>/<Ten>Page.tsx` (`PageHeader` + `QueryState`) → khai báo `sections`/`pages` trong `registry.tsx` (trang chung thì `<Route>` trong `App.tsx` + `NAVIGATION` trong `layouts/AppLayout.tsx`) → test cạnh trang bằng `mockApi`/`renderPage` (`web/src/test/utils.tsx`).

## Development Commands

Lần đầu (Windows; Linux/macOS: `source .venv/bin/activate`):

```bash
python -m venv .venv && .venv\Scripts\activate
pip install -e ".[dev]"          # thêm ",postgres" nếu dùng PostgreSQL
cd web && npm install && cd ..   # cần Node ≥ 22.13
```

```bash
crawl-data-app init-db           # tạo/nâng schema (mọi lệnh dùng DB cũng tự chạy)
crawl-data-app serve             # API + UI đã build tại http://127.0.0.1:8000 (/docs = Swagger)
cd web && npm run dev            # dev UI http://localhost:5173 (chạy kèm `serve`)
cd web && npm run build          # tsc --noEmit rồi build ra web/dist (cần để serve phục vụ UI)

pytest                           # backend (202 test, ~20s, không có request mạng thật)
ruff check . && ruff format --check .
cd web && npm test               # Vitest (40 test)
cd web && npm run lint && npm run typecheck && npm run format:check

alembic revision --autogenerate -m "mo ta"   # sau khi sửa database/models.py

docker compose up -d --build     # chạy thử image tại chỗ (cần TAILSCALE_IP, ví dụ 127.0.0.1; thêm COMPOSE_PROFILES=public để thử cửa công khai :8080)
```

Chạy lệnh từ thư mục gốc (đường dẫn mặc định `data/`, `logs/`, `.env`, `web/dist` tính theo cwd). `crawl-data-app ...` ≡ `python -m crawl_data_app ...`.
Không có lệnh "run production" riêng ngoài `serve`.

**Deploy lên VPS** ("build Docker image rồi deploy lên VPS"): không build/push/SSH từ máy cá nhân — secret chỉ nằm ở GitHub.
Đẩy code vào `main` là workflow tự chạy (đừng `gh workflow run` thêm — sẽ deploy hai lần); chỉ chạy tay khi cần deploy lại
hoặc commit chỉ đổi tài liệu. Kiểm tra cây làm việc sạch và commit đã được đẩy, rồi theo dõi tới khi xong; báo lại đúng kết quả
(job `deploy` đỏ = VPS đã tự quay về bản cũ). Chi tiết: [docs/deploy-vps-tailscale.md](docs/deploy-vps-tailscale.md).

```bash
gh workflow run deploy.yml --ref main                 # deploy lại bằng tay: test → build → chạy thử → push GHCR → deploy → health check
gh run watch --exit-status "$(gh run list --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh workflow run deploy.yml --ref main -f rollback=true   # quay về image chạy ngay trước đó
```

## Environment Configuration

`cp .env.example .env` là tuỳ chọn — không có thì dùng mặc định. Không bắt buộc biến nào. `.env`, `data/`, `logs/`, `exports/` đã nằm trong `.gitignore`.

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `DATABASE_URL` | `sqlite:///data/crawl-data-app.db` | PostgreSQL: `postgresql+psycopg://...` |
| `HTTP_REQUEST_DELAY` | `2.0` | giây, tối thiểu 0.5 (có chủ đích); robots `Crawl-delay` lớn hơn thì dùng giá trị đó |
| `HTTP_CONCURRENCY` | `2` | 1–8 |
| `HTTP_REQUEST_TIMEOUT` · `HTTP_MAX_RETRIES` · `HTTP_USER_AGENT` | `20` · `3` · `crawl-data-app/<version>` | |
| `CRAWLER_CONTENT_FORMAT` · `CRAWLER_DISABLED_SOURCES` | `html` · `[]` (JSON) | |
| `LOG_LEVEL` · `LOG_DIR` | `INFO` · `logs` | |

Frontend (`web/.env.local`, tuỳ chọn): `VITE_API_BASE_URL`, `VITE_DEV_PROXY_TARGET`, `VITE_POLL_INTERVAL_MS`.

Docker Compose (file `.env` cạnh `compose.yaml`, **không** phải cấu hình app): `TAILSCALE_IP` (bắt buộc), `APP_IMAGE` (do `deploy.sh` ghi;
mặc định `crawl-data-app:local` khi build tại chỗ), `COMPOSE_PROFILES=public` (bật cửa công khai), `PUBLIC_SITE=<tên miền>` (cửa công khai nhận thẳng tên miền ở cổng 80/443 thay cho Funnel).

## Testing

- `tests/unit/`: parser trên fixture, `content`, `http_client` (retry/robots/giãn cách), settings, hợp đồng crawler.
- `tests/integration/`: luồng crawl đầu-cuối trên website giả (`httpx.MockTransport`) + SQLite thật; CLI; API web (`create_app` + `JobManager`, fixture ở `tests/integration/conftest.py`, `Gate` + `FakeClock` (`tests/conftest.py`) giữ job đứng giữa chừng); aviation; migration.
- `test_migrations_produce_exactly_the_orm_schema` **đỏ nếu sửa model mà quên migration**.
- Khi đổi code: chạy test liên quan + `ruff`; đổi `web/` thì chạy `npm run lint && npm run typecheck && npm test`. Đổi `schemas.py` hoặc endpoint → cập nhật `web/src/api/types.ts` và test API.
- Không thêm test gọi mạng thật; không chép nội dung truyện thật vào fixture.

## Coding Conventions

- Python: ruff (`line-length = 100`, rule `E F W I UP B SIM`, `E501` bỏ qua), type hint đầy đủ, cú pháp Py3.12 (ví dụ `def _parse[T]`). Import tuyệt đối `from crawl_data_app....`.
- Docstring/comment/thông báo lỗi/chữ UI bằng tiếng Việt; tên định danh bằng tiếng Anh. Thông báo lỗi người dùng nhìn thấy phải đọc được, không lộ stack trace.
- Parser = hàm thuần, không gọi mạng/DB. Module đơn (`service.py`, `repository.py`, `cli.py`) — **không tạo** `utils/`, `pipelines/`, `scripts/` rỗng; chỉ tách package khi thật sự cần.
- Chỗ cố tình đơn giản hoá được đánh dấu `# ponytail: <giới hạn + hướng nâng cấp>` — giữ nguyên kiểu này.
- Frontend: Prettier + ESLint (`web/`), TypeScript strict, hook `useXxx`, trang `<Ten>Page.tsx`, test `*.test.ts(x)` cạnh file.
- DB: migration Alembic ở `database/migrations/versions/` (ruff bỏ qua thư mục này); giữ `alembic.ini` thuần ASCII.

## Important Rules

1. **Tuân thủ website nguồn**: không bỏ kiểm tra `robots.txt`, không hạ sàn 0.5s / trần 8 kết nối, không giả trình duyệt, không giải CAPTCHA, không gọi endpoint bị `robots.txt` cấm (`/ajax`, `/api`, `/tim-kiem/` của TruyenFull). Bị 401/403 thì dừng, không vượt.
2. **Không tự ý đổi schema DB** — mọi thay đổi `models.py` kèm migration Alembic; không sửa migration đã có.
3. **Không đổi API contract** (endpoint, field, `code` lỗi) nếu chưa cần; nếu đổi thì sửa đồng thời `schemas.py`, `api/types.ts`, test, và bảng API trong README.
4. **Định danh theo slug, không theo URL**; giữ tính idempotent: chạy lại luôn an toàn, mỗi chương commit riêng, tiến độ ghi vào `crawl_runs`.
5. **Không nhân đôi logic crawl** giữa CLI và web — cả hai chỉ gọi `CrawlService`/`NovelRepository`. Không đưa logic crawl vào frontend.
6. **Không hardcode cấu hình** (đưa vào `config/settings.py` + `.env.example`); không commit `.env`, secret, `data/`, `logs/`, `exports/`.
7. Không chạy `crawl`/`resume` bằng CLI khi `serve` đang có job chạy (và ngược lại): lúc khởi động mỗi bên đánh dấu mọi run `running` là `interrupted`.
8. Nguồn `vna`: chỉ dùng cá nhân, phi thương mại; `world`: OpenFlights ODbL cần ghi nguồn. Đổi phạm vi dùng dữ liệu thì cập nhật mục "Tuân thủ và giới hạn" trong README.
9. Đổi hành vi/lệnh/endpoint → cập nhật README trong cùng thay đổi. Commit kiểu `feat(scope): …` / `fix(scope): …` bằng tiếng Anh.
10. **Thêm endpoint ghi cấu hình máy chủ** (ghi `.env`, đổi hành vi cho mọi người dùng) → thêm đường dẫn vào `@owner_only` trong `compose.yaml`, nếu không khách qua cửa công khai sẽ gọi được.
11. **Không publish cổng 8000 ra `0.0.0.0`** hay IP công khai (API không có đăng nhập; Docker bỏ qua ufw). Không bỏ `HEALTHCHECK`, không đổi `GET /api/stats` thành thứ không chạm DB — rollback dựa vào đó.
12. **Deploy chỉ qua workflow**, image gắn tag theo commit (không `latest`); không sửa tay `APP_IMAGE` trên VPS. Không đưa khoá SSH, token vào repo hay máy cá nhân.
13. Mẫu `.gitignore` cho thư mục dữ liệu phải neo vào gốc (`/data/`, `/logs/`, `/exports/`) — mẫu không neo từng làm mất `web/src/pages/logs/`.
