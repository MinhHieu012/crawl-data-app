import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Feedback } from '../../api/types'
import { type ApiRequest, mockApi, renderPage, reply } from '../../test/utils'
import { BugReportPage } from './BugReportPage'
import { CrawlerRequestPage } from './CrawlerRequestPage'
import { FeedbackPage } from './FeedbackPage'

function makeFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: 4,
    type: 'bug_report',
    title: 'Lỗi khi crawl truyện',
    description: 'Bấm Bắt đầu crawl thì báo lỗi máy chủ.',
    details: { area: 'Crawl truyện', severity: 'high' },
    status: 'open',
    response: null,
    created_at: '2026-10-07T03:00:00Z',
    updated_at: '2026-10-07T03:00:00Z',
    ...overrides,
  }
}

const posts = (requests: ApiRequest[]) => requests.filter((request) => request.method === 'POST')
const field = (name: RegExp) => screen.getByRole('textbox', { name })

describe('FeedbackPage', () => {
  it('cho chọn loại góp ý và chỉ xem góp ý của chính trình duyệt này', async () => {
    const requests = mockApi(() => [
      makeFeedback({
        status: 'resolved',
        response: 'Đã sửa ở bản mới.',
      }),
    ])
    renderPage(<FeedbackPage />)

    expect(screen.getByRole('link', { name: 'Báo lỗi' })).toHaveAttribute(
      'href',
      '/feedback/bug-report',
    )
    expect(screen.getByRole('link', { name: 'Gợi ý crawler' })).toHaveAttribute(
      'href',
      '/feedback/crawler-request',
    )
    expect(await screen.findByText('#4 · Lỗi khi crawl truyện')).toBeInTheDocument()
    expect(screen.getByText('Đã xử lý')).toBeInTheDocument()
    expect(screen.getByText('Đã sửa ở bản mới.')).toBeInTheDocument()
    // Mỗi trình duyệt một mã người gửi, giữ nguyên giữa các lần mở trang.
    const key = requests[0].headers['x-feedback-key']
    expect(requests[0].path).toBe('/feedback/mine')
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect(localStorage.getItem('feedbackReporterKey')).toBe(key)
  })

  it('báo khi chưa gửi góp ý nào', async () => {
    mockApi(() => [])
    renderPage(<FeedbackPage />)

    expect(await screen.findByText('Chưa gửi góp ý nào')).toBeInTheDocument()
  })
})

describe('BugReportPage', () => {
  it('không gửi gì khi thiếu tiêu đề hoặc mô tả quá ngắn', async () => {
    const user = userEvent.setup()
    const requests = mockApi(() => makeFeedback())
    renderPage(<BugReportPage />)

    await user.type(field(/Tiêu đề/), 'ab')
    await user.type(field(/Mô tả/), 'ngắn')
    await user.click(screen.getByRole('button', { name: 'Gửi báo lỗi' }))

    expect(await screen.findByText('Tiêu đề cần từ 3 đến 200 ký tự')).toBeInTheDocument()
    expect(screen.getByText(/Mô tả cần từ 10/)).toBeInTheDocument()
    expect(posts(requests)).toHaveLength(0)
  })

  it('gửi báo lỗi kèm mã người gửi, báo thành công rồi quay về trang Góp ý', async () => {
    const user = userEvent.setup()
    const requests = mockApi(() => reply(201, makeFeedback({ id: 9 })))
    renderPage(<BugReportPage />)

    await user.type(field(/Tiêu đề/), '  Lỗi khi crawl truyện ')
    await user.type(field(/Trang \/ chức năng/), 'Crawl truyện')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mức độ' }), 'high')
    await user.type(field(/Mô tả/), 'Bấm Bắt đầu crawl thì báo lỗi máy chủ.')
    await user.click(screen.getByRole('button', { name: 'Gửi báo lỗi' }))

    expect(await screen.findByLabelText('Trang hiện tại')).toHaveTextContent('/feedback')
    expect(screen.getByText('Đã gửi báo lỗi #9. Cảm ơn bạn!')).toBeInTheDocument()
    expect(posts(requests)[0]).toMatchObject({
      path: '/feedback',
      body: {
        type: 'bug_report',
        title: 'Lỗi khi crawl truyện',
        area: 'Crawl truyện',
        severity: 'high',
        description: 'Bấm Bắt đầu crawl thì báo lỗi máy chủ.',
        contact: null,
      },
    })
    expect(posts(requests)[0].headers['x-feedback-key']).toBeTruthy()
  })

  it('hiện lỗi của máy chủ và giữ nguyên những gì đã nhập', async () => {
    const user = userEvent.setup()
    mockApi(() => reply(500, 'lỗi'))
    renderPage(<BugReportPage />)

    await user.type(field(/Tiêu đề/), 'Lỗi khi crawl truyện')
    await user.type(field(/Mô tả/), 'Bấm Bắt đầu crawl thì báo lỗi máy chủ.')
    await user.click(screen.getByRole('button', { name: 'Gửi báo lỗi' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Không gửi được góp ý')).toBeInTheDocument()
    expect(field(/Tiêu đề/)).toHaveValue('Lỗi khi crawl truyện')
  })
})

describe('CrawlerRequestPage', () => {
  it('kiểm tra URL rồi gửi đề xuất crawler', async () => {
    const user = userEvent.setup()
    const requests = mockApi(() =>
      reply(201, makeFeedback({ id: 10, type: 'crawler_request', details: {} })),
    )
    renderPage(<CrawlerRequestPage />)

    await user.type(field(/Tên nguồn/), 'OpenStreetMap')
    await user.type(field(/Website URL/), 'openstreetmap')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Loại dữ liệu' }), 'geography')
    await user.type(field(/Mô tả/), 'Danh sách địa điểm theo tỉnh thành.')
    await user.click(screen.getByRole('button', { name: 'Gửi đề xuất' }))
    expect(await screen.findByText(/Nhập URL đầy đủ/)).toBeInTheDocument()
    expect(posts(requests)).toHaveLength(0)

    await user.clear(field(/Website URL/))
    await user.type(field(/Website URL/), 'https://www.openstreetmap.org')
    await user.click(screen.getByRole('button', { name: 'Gửi đề xuất' }))

    expect(await screen.findByLabelText('Trang hiện tại')).toHaveTextContent('/feedback')
    expect(posts(requests)[0].body).toEqual({
      type: 'crawler_request',
      title: 'OpenStreetMap',
      url: 'https://www.openstreetmap.org',
      data_type: 'geography',
      description: 'Danh sách địa điểm theo tỉnh thành.',
      contact: null,
    })
  })
})
