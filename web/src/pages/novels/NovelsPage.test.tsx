import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Novel } from '../../api/types'
import { type ApiRequest, makeNovel, mockApi, renderPage, reply } from '../../test/utils'
import { NovelsPage } from './NovelsPage'

const SOURCES = [
  {
    name: 'truyenfull',
    domains: ['truyenfull.live'],
    description: '',
    enabled: true,
    novels: 2,
    chapters_done: 4,
  },
]

/** Backend giả: trả danh sách nguồn và danh sách truyện (cố định, hoặc tính từ request). */
function backend(novels: Novel[] | ((request: ApiRequest) => unknown)) {
  return mockApi((request) => {
    if (request.path === '/sources') return SOURCES
    if (typeof novels === 'function') return novels(request)
    return { items: novels, total: novels.length }
  })
}

const novelRequests = (requests: ApiRequest[]) => requests.filter((r) => r.path === '/novels')

describe('NovelsPage', () => {
  it('liệt kê truyện kèm tác giả, tiến độ tải và tổng số dòng', async () => {
    const requests = backend([
      makeNovel(),
      makeNovel({ id: 4, title: 'Phàm Nhân Tu Tiên', author: null, total_chapters: null }),
    ])

    renderPage(<NovelsPage />)

    expect(await screen.findByRole('link', { name: 'Kiếm Lai' })).toHaveAttribute(
      'href',
      '/crawlers/novel/stories/novels/3',
    )
    expect(screen.getByText('Phong Hỏa')).toBeInTheDocument()
    expect(screen.getByText('4 / 10 chương')).toBeInTheDocument()
    expect(screen.getByText('Chưa rõ tác giả')).toBeInTheDocument()
    expect(screen.getByText('Chưa crawl mục lục')).toBeInTheDocument()
    expect(screen.getByText('1–2 trong 2')).toBeInTheDocument()
    expect(novelRequests(requests)[0].query).toEqual({
      sort: 'last_crawled_at',
      order: 'desc',
      page: '1',
      page_size: '20',
    })
  })

  it('tìm kiếm sau khi ngừng gõ và lọc theo nguồn, tình trạng, cách sắp xếp', async () => {
    const user = userEvent.setup()
    const requests = backend([makeNovel()])
    renderPage(<NovelsPage />)
    await screen.findByRole('link', { name: 'Kiếm Lai' })

    await user.type(screen.getByRole('searchbox', { name: 'Tìm truyện' }), 'kiem lai')
    await waitFor(() => expect(novelRequests(requests).at(-1)?.query.search).toBe('kiem lai'))
    // Gõ 8 ký tự nhưng chỉ thêm đúng một request: không gọi API cho từng phím.
    expect(novelRequests(requests)).toHaveLength(2)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lọc theo nguồn' }), 'truyenfull')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Lọc theo tình trạng' }),
      'Hoàn thành',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sắp xếp' }), 'Tên A → Z')

    await waitFor(() =>
      expect(novelRequests(requests).at(-1)?.query).toEqual({
        search: 'kiem lai',
        source: 'truyenfull',
        status: 'completed',
        sort: 'title',
        order: 'asc',
        page: '1',
        page_size: '20',
      }),
    )
  })

  it('chuyển trang và quay về trang 1 khi đổi bộ lọc', async () => {
    const user = userEvent.setup()
    const requests = backend(() => ({ items: [makeNovel()], total: 45 }))
    renderPage(<NovelsPage />, { route: '/?page=2' })

    expect(await screen.findByText('21–40 trong 45')).toBeInTheDocument()
    expect(novelRequests(requests)[0].query.page).toBe('2')

    await user.click(screen.getByRole('button', { name: '3' }))
    await waitFor(() => expect(novelRequests(requests).at(-1)?.query.page).toBe('3'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lọc theo nguồn' }), 'truyenfull')
    await waitFor(() =>
      expect(novelRequests(requests).at(-1)?.query).toMatchObject({
        source: 'truyenfull',
        page: '1',
      }),
    )
  })

  it('phân biệt "chưa có truyện" với "không khớp bộ lọc"', async () => {
    backend([])

    const first = renderPage(<NovelsPage />)
    expect(await screen.findByText('Chưa có truyện nào')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crawl truyện đầu tiên' })).toHaveAttribute(
      'href',
      '/crawlers/novel/stories/crawl',
    )
    first.unmount()

    renderPage(<NovelsPage />, { route: '/?search=khong-co' })
    expect(await screen.findByText('Không có truyện nào khớp bộ lọc')).toBeInTheDocument()
  })

  it('báo lỗi rõ ràng và tải lại được khi backend gặp sự cố', async () => {
    const user = userEvent.setup()
    let healthy = false
    backend(() => (healthy ? { items: [makeNovel()], total: 1 } : reply(500, 'Internal Error')))
    renderPage(<NovelsPage />)

    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument()
    expect(screen.getByText(/Máy chủ gặp lỗi \(HTTP 500\)/)).toBeInTheDocument()

    healthy = true
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByRole('link', { name: 'Kiếm Lai' })).toBeInTheDocument()
    expect(screen.queryByText('Không tải được dữ liệu')).not.toBeInTheDocument()
  })
})
