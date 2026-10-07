import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AdminFeedback } from '../../api/types'
import { setAdminToken } from '../../hooks/useAdminToken'
import { type ApiRequest, mockApi, renderPage, reply } from '../../test/utils'
import { AdminFeedbackDetailPage } from './AdminFeedbackDetailPage'
import { AdminFeedbackPage } from './AdminFeedbackPage'

const TOKEN = 'ma-quan-tri-dai-it-nhat-16-ky-tu'

function makeItem(overrides: Partial<AdminFeedback> = {}): AdminFeedback {
  return {
    id: 4,
    type: 'bug_report',
    title: 'Lỗi khi crawl truyện',
    description: 'Bấm Bắt đầu crawl thì báo lỗi máy chủ.',
    details: { area: 'Crawl truyện', severity: 'high' },
    status: 'open',
    response: null,
    contact: 'alice@example.com',
    reporter: 'a1b2c3d4',
    created_at: '2026-10-07T03:00:00Z',
    updated_at: '2026-10-07T03:00:00Z',
    ...overrides,
  }
}

const forbidden = () =>
  reply(403, { code: 'admin_only', detail: 'Chỉ quản trị viên mới xem và quản lý được góp ý' })

/** Backend giả có kiểm tra mã quản trị, như backend thật. */
function backend(handler: (request: ApiRequest) => unknown) {
  return mockApi((request) =>
    request.headers.authorization === `Bearer ${TOKEN}` ? handler(request) : forbidden(),
  )
}

const page = (items: AdminFeedback[]) => ({ items, total: items.length })

describe('AdminFeedbackPage', () => {
  it('chưa có mã quản trị thì chỉ hiện form đăng nhập, không tải góp ý', async () => {
    const requests = backend(() => page([makeItem()]))
    renderPage(<AdminFeedbackPage />)

    expect(screen.getByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it('mã sai thì báo lỗi; mã đúng thì vào danh sách và gửi kèm mã ở mọi request', async () => {
    const user = userEvent.setup()
    const requests = backend((request) =>
      request.path === '/admin/session' ? { role: 'admin' } : page([makeItem()]),
    )
    renderPage(<AdminFeedbackPage />)

    await user.type(screen.getByLabelText(/Mã quản trị/), 'doan-bua-mot-ma')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Chỉ quản trị viên/)).toBeInTheDocument()
    expect(localStorage.getItem('adminToken')).toBeNull()

    await user.clear(screen.getByLabelText(/Mã quản trị/))
    await user.type(screen.getByLabelText(/Mã quản trị/), TOKEN)
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    expect(await screen.findByText('#4 · Lỗi khi crawl truyện')).toBeInTheDocument()
    expect(screen.getByText(/alice@example.com/)).toBeInTheDocument()
    expect(requests.at(-1)).toMatchObject({ path: '/admin/feedback' })
    expect(localStorage.getItem('adminToken')).toBe(TOKEN)
  })

  it('lọc theo loại và trạng thái bằng tham số gửi lên backend', async () => {
    const user = userEvent.setup()
    setAdminToken(TOKEN)
    const requests = backend(() => page([]))
    renderPage(<AdminFeedbackPage />)
    expect(await screen.findByText('Chưa có góp ý nào')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Gợi ý crawler' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }), 'open')

    expect(await screen.findByText('Không có góp ý nào khớp')).toBeInTheDocument()
    expect(requests.at(-1)?.query).toMatchObject({ type: 'crawler_request', status: 'open' })
  })

  it('backend từ chối mã đã lưu thì quên mã và quay về form đăng nhập', async () => {
    setAdminToken('ma-cu-da-bi-doi-tren-may-chu')
    backend(() => page([makeItem()]))
    renderPage(<AdminFeedbackPage />)

    expect(await screen.findByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument()
    expect(localStorage.getItem('adminToken')).toBeNull()
  })
})

describe('AdminFeedbackDetailPage', () => {
  const route = { route: '/admin/feedback/4', path: '/admin/feedback/:id' }

  it('đổi trạng thái và gửi phản hồi cho người góp ý', async () => {
    const user = userEvent.setup()
    setAdminToken(TOKEN)
    const requests = backend((request) =>
      request.method === 'PATCH'
        ? makeItem({ status: 'resolved', response: 'Đã sửa.', updated_at: '2026-10-07T04:00:00Z' })
        : makeItem(),
    )
    renderPage(<AdminFeedbackDetailPage />, route)

    expect(await screen.findByText('Bấm Bắt đầu crawl thì báo lỗi máy chủ.')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Trạng thái' }), 'resolved')
    await user.type(screen.getByRole('textbox', { name: /Phản hồi/ }), 'Đã sửa.')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Đã lưu góp ý #4')).toBeInTheDocument()
    expect(requests.find((request) => request.method === 'PATCH')).toMatchObject({
      path: '/admin/feedback/4',
      body: { status: 'resolved', response: 'Đã sửa.' },
    })
  })

  it('xoá chỉ sau khi xác nhận, rồi quay về danh sách', async () => {
    const user = userEvent.setup()
    setAdminToken(TOKEN)
    const requests = backend((request) => (request.method === 'DELETE' ? reply(204) : makeItem()))
    renderPage(<AdminFeedbackDetailPage />, route)

    await user.click(await screen.findByRole('button', { name: 'Xoá góp ý' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Giữ lại' }))
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Xoá góp ý' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xoá' }))

    expect(await screen.findByLabelText('Trang hiện tại')).toHaveTextContent('/admin/feedback')
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1)
  })
})
