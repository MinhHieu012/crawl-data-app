import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'

import type { Job, Novel } from '../api/types'
import { theme } from '../theme'

export interface ApiRequest {
  method: string
  /** Đường dẫn sau tiền tố /api, ví dụ "/crawl/jobs/7/pause". */
  path: string
  query: Record<string, string>
  body: unknown
}

export function reply(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(text, { status })
}

/**
 * Thay `fetch` bằng một backend giả trong bộ nhớ. `handler` trả về dữ liệu (thành HTTP 200) hoặc
 * `reply(mã, body)`; kết quả là danh sách request giao diện đã gửi, để test kiểm tra lại.
 */
export function mockApi(handler: (request: ApiRequest) => unknown): ApiRequest[] {
  const requests: ApiRequest[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const request: ApiRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname.replace(/^\/api/, ''),
      query: Object.fromEntries(url.searchParams),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    requests.push(request)
    const result = handler(request)
    return result instanceof Response ? result : reply(200, result)
  })
  return requests
}

function CurrentLocation() {
  const location = useLocation()
  return <output aria-label="Trang hiện tại">{location.pathname + location.search}</output>
}

interface RenderOptions {
  /** URL đang mở. */
  route?: string
  /** Mẫu route của trang được test, ví dụ "/jobs/:id". */
  path?: string
}

/**
 * Dựng một trang với đủ các provider như ứng dụng thật. Khi trang điều hướng đi nơi khác, màn hình
 * chỉ còn một dòng ghi địa chỉ mới — tìm nó bằng `screen.findByLabelText('Trang hiện tại')`.
 */
export function renderPage(page: ReactNode, { route = '/', path = '/' }: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MantineProvider env="test" theme={theme}>
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <Notifications />
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={page} />
              <Route path="*" element={<CurrentLocation />} />
            </Routes>
          </MemoryRouter>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 7,
    url: 'https://truyenfull.live/kiem-lai/',
    novel_id: 3,
    novel_title: 'Kiếm Lai',
    with_chapters: true,
    from_chapter: null,
    to_chapter: null,
    status: 'running',
    chapters_total: 5,
    chapters_ok: 2,
    chapters_failed: 0,
    chapters_skipped: 0,
    error: null,
    started_at: '2026-10-05T03:00:00Z',
    finished_at: null,
    active: true,
    last_chapter: 'Chương 2: Lên núi',
    ...overrides,
  }
}

export function makeNovel(overrides: Partial<Novel> = {}): Novel {
  return {
    id: 3,
    source: 'truyenfull',
    slug: 'kiem-lai',
    url: 'https://truyenfull.live/kiem-lai/',
    title: 'Kiếm Lai',
    author: 'Phong Hỏa',
    genres: ['Tiên Hiệp'],
    description: null,
    cover_url: null,
    status: 'ongoing',
    total_chapters: 10,
    chapters_done: 4,
    chapters_failed: 0,
    chapters_pending: 6,
    published_at: null,
    last_crawled_at: '2026-10-05T03:00:00Z',
    ...overrides,
  }
}
