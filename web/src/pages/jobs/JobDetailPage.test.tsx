import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Job } from '../../api/types'
import { type ApiRequest, makeJob, mockApi, renderPage, reply } from '../../test/utils'
import { JobDetailPage } from './JobDetailPage'

const LOG = {
  time: '2026-10-05T10:00:00+07:00',
  level: 'WARNING',
  logger: 'novel_crawler.service',
  message: 'Chương 3 lỗi: HTTP 500',
  run_id: 7,
  url: 'https://truyenfull.live/kiem-lai/chuong-3/',
  kind: 'request',
  exception: null,
}

/** Backend giả cho một job: `state.job` là thứ GET trả về; hành động POST do `onAction` xử lý. */
function backend(state: { job: Job }, onAction?: (request: ApiRequest) => unknown) {
  return mockApi((request) => {
    if (request.path === '/logs') return [LOG]
    if (request.method === 'POST') return onAction?.(request)
    return state.job
  })
}

const open = (id = 7) => renderPage(<JobDetailPage />, { route: `/jobs/${id}`, path: '/jobs/:id' })

describe('JobDetailPage', () => {
  it('hiển thị tiến độ, số chương theo kết quả, chương vừa tải và log của job', async () => {
    const requests = backend({ job: makeJob({ chapters_ok: 2, chapters_failed: 1 }) })

    open()

    expect(await screen.findByRole('heading', { name: 'Kiếm Lai' })).toBeInTheDocument()
    expect(screen.getByText('Đang chạy')).toBeInTheDocument()
    expect(screen.getByText('3 / 5 chương · 60%')).toBeInTheDocument()
    expect(within(screen.getByText('Thành công').parentElement!).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByText('Lỗi').parentElement!).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByText('Còn lại').parentElement!).getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Chương 2: Lên núi')).toBeInTheDocument()
    expect(await screen.findByText('Chương 3 lỗi: HTTP 500')).toBeInTheDocument()
    expect(requests.find((request) => request.path === '/logs')?.query).toMatchObject({
      job_id: '7',
    })
  })

  it('tự cập nhật khi job chạy xong, rồi thôi không hỏi backend nữa', async () => {
    const state = { job: makeJob() }
    const requests = backend(state)
    open()
    expect(await screen.findByRole('button', { name: 'Tạm dừng' })).toBeInTheDocument()

    state.job = makeJob({
      status: 'completed',
      active: false,
      chapters_ok: 5,
      last_chapter: null,
      finished_at: '2026-10-05T03:00:10Z',
    })

    expect(await screen.findByText('Hoàn tất')).toBeInTheDocument()
    expect(screen.getByText('5 / 5 chương · 100%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tạm dừng' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kiểm tra chương mới' })).toBeInTheDocument()

    const settled = requests.length
    await new Promise((resolve) => setTimeout(resolve, 200)) // 5 chu kỳ hỏi lại của môi trường test
    expect(requests).toHaveLength(settled)
  })

  it('tạm dừng job đang chạy rồi cho phép tiếp tục hoặc huỷ', async () => {
    const user = userEvent.setup()
    const state = { job: makeJob() }
    const requests = backend(state, () => {
      state.job = makeJob({ status: 'interrupted', active: false, last_chapter: null })
      return state.job
    })
    open()

    await user.click(await screen.findByRole('button', { name: 'Tạm dừng' }))

    expect(await screen.findByRole('button', { name: 'Tiếp tục' })).toBeInTheDocument()
    expect(screen.getByText('Tạm dừng')).toBeInTheDocument() // giờ là nhãn trạng thái
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument()
    expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      path: '/crawl/jobs/7/pause',
    })
    expect(await screen.findByText('Đã tạm dừng job #7')).toBeInTheDocument()
  })

  it('huỷ job phải xác nhận trước', async () => {
    const user = userEvent.setup()
    const state = { job: makeJob() }
    const requests = backend(state, () => {
      state.job = makeJob({ status: 'cancelled', active: false, last_chapter: null })
      return state.job
    })
    open()

    await user.click(await screen.findByRole('button', { name: 'Huỷ' }))
    expect(await screen.findByText('Huỷ job #7?')).toBeInTheDocument()
    expect(requests.some((request) => request.method === 'POST')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Huỷ job' }))

    expect(await screen.findByText('Đã huỷ', { selector: '.mantine-Badge-label' })).toBeVisible()
    expect(requests.find((request) => request.method === 'POST')?.path).toBe('/crawl/jobs/7/cancel')
  })

  it('thử lại chương lỗi tạo job mới và chuyển sang job đó', async () => {
    const user = userEvent.setup()
    const partial = makeJob({
      status: 'partial',
      active: false,
      chapters_ok: 4,
      chapters_failed: 1,
      last_chapter: null,
    })
    const requests = backend({ job: partial }, () => reply(201, makeJob({ id: 8 })))
    open()

    await user.click(await screen.findByRole('button', { name: 'Thử lại chương lỗi' }))

    // Chuyển sang /jobs/8: vẫn là trang này nhưng giờ hỏi backend về job mới.
    await waitFor(() => expect(requests.map((request) => request.path)).toContain('/crawl/jobs/8'))
    expect(requests.find((request) => request.method === 'POST')?.path).toBe('/crawl/jobs/7/retry')
    expect(await screen.findByText('Đã tạo job mới chạy lại đúng phạm vi cũ')).toBeInTheDocument()
  })

  it('báo lỗi của thao tác bằng thông báo, vẫn giữ nguyên màn hình', async () => {
    const user = userEvent.setup()
    backend({ job: makeJob() }, () =>
      reply(409, {
        code: 'job_not_running',
        detail: 'Job không còn chạy trên web nên không tạm dừng được',
      }),
    )
    open()

    await user.click(await screen.findByRole('button', { name: 'Tạm dừng' }))

    expect(await screen.findByText(/Job không còn chạy trên web/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kiếm Lai' })).toBeInTheDocument()
  })

  it('job thất bại: nêu lý do dừng và cho thử lại', async () => {
    const error = 'Website từ chối truy cập (HTTP 403): https://truyenfull.live/kiem-lai/'
    backend({
      job: makeJob({ status: 'failed', active: false, error, chapters_total: 0, chapters_ok: 0 }),
    })

    open()

    expect(await screen.findByText('Thất bại')).toBeInTheDocument()
    expect(screen.getByText(error)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tạm dừng' })).not.toBeInTheDocument()
  })

  it('job không tồn tại: hiện thông báo của backend', async () => {
    mockApi(() => reply(404, { code: 'not_found', detail: 'Không có job #99' }))

    open(99)

    expect(await screen.findByText('Không có job #99')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByLabelText('Đang tải')).not.toBeInTheDocument())
  })
})
