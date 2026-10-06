import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { Job } from './api/types'
import { makeJob, makeNovel, mockApi, renderPage } from './test/utils'

const STATS = {
  novels: 2,
  chapters: { pending: 6, done: 4, failed: 0 },
  jobs: { running: 0, completed: 1, partial: 0, failed: 0, interrupted: 0, cancelled: 0 },
}
const COUNTS = { airport: 2, airline: 1, city: 2, country: 1 }
/** Job đồng bộ hàng không đã chạy xong của một nguồn. */
const syncJob = (source: string, overrides: Partial<Job> = {}) =>
  makeJob({
    id: 21,
    crawler: `aviation:${source}`,
    url: 'https://nguon.test',
    novel_id: null,
    novel_title: null,
    with_chapters: false,
    status: 'completed',
    active: false,
    chapters_total: 3,
    chapters_ok: 3,
    result: COUNTS,
    finished_at: '2026-10-05T03:00:05Z',
    last_chapter: null,
    ...overrides,
  })
const NO_COUNTS = { airport: 0, airline: 0, city: 0, country: 0 }
const VNA_AIRPORT = {
  kind: 'airport',
  code: 'HAN',
  name: 'Hanoi',
  name_vi: 'Hà Nội',
  city_code: 'HAN',
  city_name: 'Hanoi',
  country_code: 'VN',
  country_name: 'Vietnam',
  region: 'VIETNAM',
  crawled_at: '2026-10-05T03:00:05Z',
}
const WORLD_AIRPORT = {
  ...VNA_AIRPORT,
  name: 'Noi Bai International Airport',
  name_vi: null,
  city_code: 'VN-hanoi',
  region: 'Asia',
}

const HANOI = {
  code: '01',
  name: 'Hà Nội',
  name_en: 'Hanoi',
  full_name: 'Thành phố Hà Nội',
  full_name_en: 'Hanoi City',
  code_name: 'ha_noi',
  unit: 'Thành phố',
  postal_code_prefix: '10, 11, 12, 13, 14',
  ward_count: 126,
  crawled_at: '2026-10-05T03:00:05Z',
}
const BA_DINH = {
  code: '00004',
  name: 'Ba Đình',
  name_en: 'Ba Dinh',
  full_name: 'Phường Ba Đình',
  full_name_en: 'Ba Dinh Ward',
  code_name: 'ba_dinh',
  unit: 'Phường',
  postal_code: '11120',
  province_code: '01',
  province_name: 'Thành phố Hà Nội',
  crawled_at: '2026-10-05T03:00:05Z',
}

/**
 * Backend giả. Nguồn Vietnam Airlines đã đồng bộ sẵn; nguồn thế giới thì tuỳ `worldSynced` và
 * chuyển sang "đã đồng bộ" khi giao diện gọi API đồng bộ.
 */
function backend(worldSynced = true) {
  return mockApi((request) => {
    if (request.path === '/stats') return STATS
    if (request.path === '/sources') return []
    if (request.path === '/novels') return { items: [makeNovel()], total: 1 }
    if (request.path === '/crawl/jobs') {
      // Lịch sử của một nguồn hàng không là danh sách job lọc theo crawler.
      const [, source] = request.query.crawler?.match(/^aviation:(\w+)$/) ?? []
      const job = source ? syncJob(source) : makeJob({ status: 'completed', active: false })
      return { items: [job], total: 1 }
    }
    if (request.path === '/provinces/summary') return { count: 1, ward_count: 1, last_job: null }
    if (request.path === '/provinces/wards') return { items: [BA_DINH], total: 1 }
    if (request.path === '/provinces') return { items: [HANOI], total: 1 }
    if (request.path === '/provinces/sync') {
      return syncJob('', { id: 22, crawler: 'provinces', status: 'running', active: true })
    }
    const [, source, action] = request.path.match(/^\/aviation\/(\w+)\/(\w+)$/) ?? []
    if (action === 'sync') {
      // Backend thật trả job đang chạy rồi chạy nền; ở đây coi như job xong ngay sau đó.
      worldSynced = true
      return syncJob(source, { status: 'running', active: true, chapters_ok: 0, result: null })
    }
    const synced = source === 'vna' || worldSynced
    if (action === 'summary') {
      return synced
        ? { counts: COUNTS, last_job: syncJob(source) }
        : { counts: NO_COUNTS, last_job: null }
    }
    const item = source === 'vna' ? VNA_AIRPORT : WORLD_AIRPORT
    return synced ? { items: [item], total: 1 } : { items: [], total: 0 } // records
  })
}

const open = (route: string) => renderPage(<App />, { route, path: '*' })

describe('App — khu vực Crawler', () => {
  beforeEach(() => vi.stubGlobal('scrollTo', () => {})) // jsdom không có; AppLayout gọi khi đổi trang

  it('liệt kê mọi crawler trong registry kèm số liệu thật', async () => {
    backend()
    open('/crawlers')

    expect(await screen.findByRole('heading', { name: 'Truyện chữ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hàng không' })).toBeInTheDocument()
    expect(await screen.findByText('2 truyện · 4 chương đã tải')).toBeInTheDocument()
    // Hai nguồn của Hàng không, mỗi nguồn một dòng số liệu riêng.
    expect(
      await screen.findAllByText('2 sân bay · 2 thành phố · 1 quốc gia · 1 hãng bay'),
    ).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Mở Hàng không' })).toHaveAttribute(
      'href',
      '/crawlers/aviation',
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

  it('Hàng không: chọn nguồn → mỗi loại dữ liệu một tab, mỗi nguồn gọi API của riêng nó', async () => {
    const user = userEvent.setup()
    const requests = backend()
    open('/crawlers/aviation')

    expect(screen.getByRole('heading', { name: 'Toàn thế giới' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vietnam Airlines' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Mở Vietnam Airlines' }))

    expect(await screen.findByRole('tab', { name: 'Sân bay', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vietnam Airlines')
    expect(await screen.findByText(/Hà Nội/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xuất JSON' })).toHaveAttribute(
      'href',
      '/api/aviation/vna/export?kind=airport',
    )

    await user.click(screen.getByRole('tab', { name: 'Hãng bay' }))
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.path === '/aviation/vna/records' && request.query.kind === 'airline',
        ),
      ).toBe(true),
    )

    await user.click(screen.getByRole('tab', { name: 'Lịch sử' }))
    expect(
      await screen.findByText('2 sân bay · 2 thành phố · 1 quốc gia · 1 hãng bay'),
    ).toBeInTheDocument()
    // Lịch sử là bảng job của riêng nguồn này, mỗi dòng dẫn tới trang chi tiết job.
    expect(screen.getByRole('link', { name: 'Hàng không · Vietnam Airlines' })).toHaveAttribute(
      'href',
      '/jobs/21',
    )
    expect(
      requests.some(
        (request) => request.path === '/crawl/jobs' && request.query.crawler === 'aviation:vna',
      ),
    ).toBe(true)
    // Đang ở nguồn Vietnam Airlines: không bảng nào đọc dữ liệu của nguồn thế giới.
    expect(requests.some((request) => request.path === '/aviation/world/records')).toBe(false)
  })

  it('nguồn chưa có dữ liệu thì mời đồng bộ; đồng bộ xong bảng tự có dữ liệu', async () => {
    const user = userEvent.setup()
    const requests = backend(false)
    open('/crawlers/aviation/world/airport')

    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument()
    expect(screen.getByText(/Chưa đồng bộ lần nào/)).toBeInTheDocument()
    expect(screen.getByText(/phạm vi công cộng/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Xuất JSON' })).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Đồng bộ' })[0])

    expect(await screen.findByText('Noi Bai International Airport')).toBeInTheDocument()
    // Đồng bộ là một job chạy nền: giao diện báo số job và dẫn link tới job đó.
    expect(await screen.findByText('Đang đồng bộ ở job #21')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'job #21' })).toHaveAttribute('href', '/jobs/21')
    expect(requests.find((request) => request.method === 'POST')?.path).toBe('/aviation/world/sync')
    expect(screen.getByRole('link', { name: 'Xuất JSON' })).toHaveAttribute(
      'href',
      '/api/aviation/world/export?kind=airport',
    )
  })

  it('Tỉnh thành Việt Nam: bảng tỉnh thành, xuất JSON, đồng bộ thành job và lịch sử riêng', async () => {
    const user = userEvent.setup()
    const requests = backend()
    open('/crawlers/provinces')

    expect(
      await screen.findByRole('tab', { name: 'Tỉnh thành', selected: true }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tỉnh thành Việt Nam')
    expect(await screen.findByText('Thành phố Hà Nội')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xuất JSON' })).toHaveAttribute(
      'href',
      '/api/provinces/export',
    )
    expect(screen.getByRole('link', { name: 'Xuất JSON kèm phường/xã' })).toHaveAttribute(
      'href',
      '/api/provinces/export?with_wards=true',
    )

    await user.click(screen.getByRole('button', { name: 'Đồng bộ' }))
    expect(await screen.findByText('Đang đồng bộ ở job #22')).toBeInTheDocument()
    expect(requests.find((request) => request.method === 'POST')?.path).toBe('/provinces/sync')

    // Tab Phường/xã: lọc theo tỉnh thành thì cả bảng lẫn file xuất đều theo tỉnh đó.
    await user.click(screen.getByRole('tab', { name: 'Phường/xã' }))
    expect(await screen.findByText('Phường Ba Đình')).toBeInTheDocument()
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Lọc theo tỉnh thành' }),
      await screen.findByRole('option', { name: 'Thành phố Hà Nội' }),
    )
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.path === '/provinces/wards' && request.query.province_code === '01',
        ),
      ).toBe(true),
    )
    expect(screen.getByRole('link', { name: 'Xuất JSON' })).toHaveAttribute(
      'href',
      '/api/provinces/wards/export?province_code=01',
    )

    await user.click(screen.getByRole('tab', { name: 'Lịch sử' }))
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.path === '/crawl/jobs' && request.query.crawler === 'provinces',
        ),
      ).toBe(true),
    )
  })

  it('trang Job chung: nút Crawl xổ danh sách mọi crawler, mỗi mục tới chỗ bắt đầu crawl', async () => {
    const user = userEvent.setup()
    backend()
    open('/jobs')

    await user.click(await screen.findByRole('button', { name: 'Crawl' }))

    const item = (name: string) => screen.findByRole('menuitem', { name })
    expect(await item('Truyện chữ')).toHaveAttribute('href', '/crawlers/novel/stories/crawl')
    expect(await item('Toàn thế giới')).toHaveAttribute('href', '/crawlers/aviation/world/airport')
    expect(await item('Vietnam Airlines')).toHaveAttribute(
      'href',
      '/crawlers/aviation/vietnam-airlines/airport',
    )
    expect(screen.queryByRole('link', { name: 'Crawl truyện' })).not.toBeInTheDocument()
  })

  it('trang Job chung lọc được theo crawler; tab Job của crawler truyện chỉ hiện job truyện', async () => {
    const user = userEvent.setup()
    const requests = backend()
    const jobQueries = () =>
      requests.filter((request) => request.path === '/crawl/jobs').map((request) => request.query)
    const first = open('/jobs')

    expect(await screen.findByRole('link', { name: 'Kiếm Lai' })).toBeInTheDocument()
    expect(jobQueries().at(-1)).toEqual({ page: '1', page_size: '20' }) // mặc định: mọi crawler

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Lọc theo crawler' }),
      'Hàng không · Vietnam Airlines',
    )

    expect(await screen.findByRole('link', { name: 'Hàng không · Vietnam Airlines' })).toBeVisible()
    expect(jobQueries().at(-1)).toEqual({ crawler: 'aviation:vna', page: '1', page_size: '20' })
    first.unmount()

    open('/crawlers/novel/stories/jobs')

    expect(await screen.findByRole('link', { name: 'Kiếm Lai' })).toBeInTheDocument()
    expect(jobQueries().at(-1)).toEqual({ crawler: 'novel', page: '1', page_size: '20' })
    expect(screen.queryByRole('combobox', { name: 'Lọc theo crawler' })).not.toBeInTheDocument()
  })
})
