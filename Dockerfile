# Giai đoạn 1: build giao diện (Node chỉ cần lúc build, không có trong image cuối).
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Giai đoạn 2: image chạy.
FROM python:3.12-slim
WORKDIR /opt/app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .
COPY --from=web /web/dist ./web/dist

# Ứng dụng tính data/, logs/, .env theo thư mục hiện tại → gom hết vào một volume duy nhất.
RUN useradd --create-home app && mkdir /srv/state && chown app /srv/state
USER app
WORKDIR /srv/state
VOLUME /srv/state

EXPOSE 8000
# Khoẻ = API trả lời và đọc được database. `deploy.sh` dựa vào trạng thái này để quyết định rollback.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/stats', timeout=4)"]
# Nghe 0.0.0.0 là trong container; việc chỉ cho Tailscale vào do `ports` trong compose.yaml quyết định.
CMD ["sh", "-c", "crawl-data-app init-db && exec crawl-data-app serve --host 0.0.0.0 --ui-dir /opt/app/web/dist"]
