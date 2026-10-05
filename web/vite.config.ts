import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    server: {
      // Khi phát triển, /api được chuyển tiếp sang backend: trình duyệt chỉ thấy một origin nên
      // không cần CORS, giống hệt lúc backend tự phục vụ bản build.
      proxy: { '/api': env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000' },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      // Hỏi lại tiến độ thật nhanh để test không phải chờ chu kỳ 2 giây.
      env: { VITE_POLL_INTERVAL_MS: '40' },
    },
  }
})
