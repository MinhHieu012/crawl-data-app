import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { type ApiRequest, makeJob, mockApi, renderPage, reply } from '../../test/utils'
import { CrawlPage } from './CrawlPage'

const URL = 'https://truyenfull.live/kiem-lai/'
const SOURCES = [
  {
    name: 'truyenfull',
    domains: ['truyenfull.live'],
    description: '',
    enabled: true,
    novels: 0,
    chapters_done: 0,
  },
]

/** Backend giả: `onCreate` quyết định câu trả lời cho yêu cầu tạo job. */
function backend(onCreate: (request: ApiRequest) => unknown) {
  return mockApi((request) => (request.method === 'POST' ? onCreate(request) : SOURCES))
}

const posts = (requests: ApiRequest[]) => requests.filter((request) => request.method === 'POST')
const urlInput = () => screen.getByRole('textbox', { name: 'URL truyện' })
const submit = () => screen.getByRole('button', { name: 'Bắt đầu crawl' })

describe('CrawlPage', () => {
  it('không gửi gì khi URL sai định dạng', async () => {
    const user = userEvent.setup()
    const requests = backend(() => makeJob())
    renderPage(<CrawlPage />)

    await user.type(urlInput(), 'kiem-lai')
    await user.click(submit())

    expect(await screen.findByText(/Nhập URL đầy đủ của truyện/)).toBeInTheDocument()
    expect(posts(requests)).toHaveLength(0)
  })

  it('tạo job crawl toàn bộ chương rồi chuyển sang màn hình theo dõi', async () => {
    const user = userEvent.setup()
    const requests = backend(() => reply(201, makeJob({ id: 12 })))
    renderPage(<CrawlPage />)

    await user.type(urlInput(), `  ${URL}  `)
    await user.click(submit())

    expect(await screen.findByLabelText('Trang hiện tại')).toHaveTextContent('/jobs/12')
    expect(posts(requests)[0]).toMatchObject({
      path: '/crawl/jobs',
      body: {
        url: URL,
        source: null,
        with_chapters: true,
        from_chapter: null,
        to_chapter: null,
        force: false,
        retry_failed: true,
      },
    })
  })

  it('gửi đúng khoảng chương và các tuỳ chọn đã chọn', async () => {
    const user = userEvent.setup()
    const requests = backend(() => reply(201, makeJob()))
    renderPage(<CrawlPage />)
    await screen.findByRole('option', { name: 'truyenfull' })

    await user.selectOptions(screen.getByRole('combobox', { name: /Nguồn/ }), 'truyenfull')
    await user.type(urlInput(), URL)
    await user.click(screen.getByRole('radio', { name: 'Khoảng chương' }))
    await user.clear(screen.getByRole('textbox', { name: /Từ chương/ }))
    await user.type(screen.getByRole('textbox', { name: /Từ chương/ }), '11')
    await user.type(screen.getByRole('textbox', { name: /Đến chương/ }), '20')
    await user.click(screen.getByRole('checkbox', { name: /Bỏ qua các chương đã tải/ }))
    await user.click(screen.getByRole('checkbox', { name: /Thử lại các chương đang lỗi/ }))
    await user.click(submit())

    await screen.findByLabelText('Trang hiện tại')
    expect(posts(requests)[0].body).toEqual({
      url: URL,
      source: 'truyenfull',
      with_chapters: true,
      from_chapter: 11,
      to_chapter: 20,
      force: true,
      retry_failed: false,
    })
  })

  it('chặn khoảng chương ngược ngay trên form', async () => {
    const user = userEvent.setup()
    const requests = backend(() => reply(201, makeJob()))
    renderPage(<CrawlPage />)

    await user.type(urlInput(), URL)
    await user.click(screen.getByRole('radio', { name: 'Khoảng chương' }))
    await user.clear(screen.getByRole('textbox', { name: /Từ chương/ }))
    await user.type(screen.getByRole('textbox', { name: /Từ chương/ }), '9')
    await user.type(screen.getByRole('textbox', { name: /Đến chương/ }), '3')
    await user.click(submit())

    expect(await screen.findByText(/Chương kết thúc phải lớn hơn hoặc bằng/)).toBeInTheDocument()
    expect(posts(requests)).toHaveLength(0)
  })

  it('"chỉ thông tin truyện" thì không gửi khoảng chương', async () => {
    const user = userEvent.setup()
    const requests = backend(() => reply(201, makeJob()))
    renderPage(<CrawlPage />, { route: `/?url=${encodeURIComponent(URL)}` }) // URL điền sẵn từ link

    await user.click(screen.getByRole('radio', { name: 'Chỉ thông tin truyện' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(submit())

    await screen.findByLabelText('Trang hiện tại')
    expect(posts(requests)[0].body).toMatchObject({
      url: URL,
      with_chapters: false,
      from_chapter: null,
    })
  })

  it('website chưa hỗ trợ: báo lỗi ngay tại ô URL và ở lại trang', async () => {
    const user = userEvent.setup()
    backend(() =>
      reply(400, {
        code: 'unsupported_source',
        detail: 'Chưa hỗ trợ website của URL: https://example.com/a/ (đang hỗ trợ: truyenfull)',
      }),
    )
    renderPage(<CrawlPage />)

    await user.type(urlInput(), 'https://example.com/a/')
    await user.click(submit())

    expect(await screen.findByText(/Chưa hỗ trợ website của URL/)).toBeInTheDocument()
    expect(urlInput()).toBeInvalid()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Trang hiện tại')).not.toBeInTheDocument()
  })

  it('truyện đang được crawl: báo trùng và dẫn tới job đang chạy', async () => {
    const user = userEvent.setup()
    backend(() =>
      reply(409, {
        code: 'duplicate_job',
        detail: 'Truyện này đang được crawl ở job #3',
        job_id: 3,
      }),
    )
    renderPage(<CrawlPage />)

    await user.type(urlInput(), URL)
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Truyện này đang được crawl ở job #3',
    )
    expect(screen.getByRole('link', { name: 'Xem job #3' })).toHaveAttribute('href', '/jobs/3')
  })

  it('mất kết nối: hiện thông báo dễ hiểu thay vì lỗi kỹ thuật', async () => {
    const user = userEvent.setup()
    mockApi(() => {
      throw new TypeError('Failed to fetch')
    })
    renderPage(<CrawlPage />)

    await user.type(urlInput(), URL)
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ')
  })
})
