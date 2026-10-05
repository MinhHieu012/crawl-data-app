import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { makeJob, makeNovel, mockApi, renderPage } from './test/utils'

const STATS = {
  novels: 2,
  chapters: { pending: 6, done: 4, failed: 0 },
  jobs: { running: 0, completed: 1, partial: 0, failed: 0, interrupted: 0, cancelled: 0 },
}

function backend() {
  return mockApi((request) => {
    if (request.path === '/stats') return STATS
    if (request.path === '/sources') return []
    if (request.path === '/novels') return { items: [makeNovel()], total: 1 }
    return { items: [makeJob({ status: 'completed', active: false })], total: 1 }
  })
}

const open = (route: string) => renderPage(<App />, { route, path: '*' })

describe('App — khu vực Crawler', () => {
  beforeEach(() => vi.stubGlobal('scrollTo', () => {})) // jsdom không có; AppLayout gọi khi đổi trang

  it('liệt kê mọi crawler trong registry, kèm số liệu thật và trạng thái triển khai', async () => {
    backend()
    open('/crawlers')

    expect(await screen.findByRole('heading', { name: 'Truyện chữ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vietnam Airlines' })).toBeInTheDocument()
    expect(await screen.findByText('2 truyện · 4 chương đã tải')).toBeInTheDocument()
    expect(screen.getByText('Sân bay · Hãng bay · Thành phố · Quốc gia')).toBeInTheDocument()
    expect(screen.getByText('Chưa triển khai')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mở Vietnam Airlines' })).toHaveAttribute(
      'href',
      '/crawlers/vietnam-airlines',
    )
  })

  it('crawler một loại dữ liệu mở thẳng khu vực quản lý; mỗi tab là một route', async () => {
    const user = userEvent.setup()
    backend()
    open('/crawlers/novel')

    expect(
      await screen.findByRole('tab', { name: 'Tổng quan', selected: true }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Truyện chữ')

    await user.click(screen.getByRole('tab', { name: 'Truyện' }))

    expect(await screen.findByRole('link', { name: 'Kiếm Lai' })).toHaveAttribute(
      'href',
      '/crawlers/novel/stories/novels/3',
    )
    expect(screen.getByRole('tab', { name: 'Truyện', selected: true })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('crawler nhiều loại dữ liệu có trang tổng quan; loại chưa có backend thì nói rõ, không bịa số liệu', async () => {
    const user = userEvent.setup()
    const requests = backend()
    open('/crawlers/vietnam-airlines')

    for (const name of ['Sân bay', 'Hãng bay', 'Thành phố', 'Quốc gia']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }

    await user.click(screen.getByRole('link', { name: 'Mở Sân bay' }))

    expect(await screen.findByText('Crawler này chưa được triển khai')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sân bay')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    // Chỉ có request thống kê của khung chung: không endpoint nào được gọi để lấy "dữ liệu sân bay".
    expect(requests.every((request) => request.path === '/stats')).toBe(true)
  })
})
