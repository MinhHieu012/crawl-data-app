import { describe, expect, it, vi } from 'vitest'

import { mockApi, reply } from '../test/utils'
import { api, ApiError } from './client'

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('api()', () => {
  it('gửi tham số lên URL, bỏ qua giá trị rỗng, và gửi body dạng JSON', async () => {
    const requests = mockApi(() => ({ items: [], total: 0 }))

    await api('/novels', { params: { search: 'kiếm lai', source: '', status: undefined, page: 2 } })
    await api('/crawl/jobs', { method: 'POST', body: { url: 'https://truyenfull.live/a/' } })

    expect(requests[0]).toMatchObject({
      method: 'GET',
      path: '/novels',
      query: { search: 'kiếm lai', page: '2' },
    })
    expect(requests[1]).toMatchObject({
      method: 'POST',
      path: '/crawl/jobs',
      body: { url: 'https://truyenfull.live/a/' },
    })
  })

  it('đổi lỗi mất kết nối thành thông báo đọc được', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))

    const error = await failure(api('/stats'))

    expect(error.kind).toBe('network')
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Không kết nối được tới máy chủ/)
  })

  it('nhận ra request quá hạn', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new DOMException('timed out', 'TimeoutError')))

    const error = await failure(api('/stats'))

    expect(error.kind).toBe('timeout')
    expect(error.message).toMatch(/phản hồi quá lâu/)
  })

  it('giữ nguyên câu thông báo, mã lỗi và job trùng mà backend trả về (4xx)', async () => {
    mockApi(() =>
      reply(409, {
        code: 'duplicate_job',
        detail: 'Truyện này đang được crawl ở job #3',
        job_id: 3,
      }),
    )

    const error = await failure(api('/crawl/jobs', { method: 'POST', body: {} }))

    expect(error).toMatchObject({ kind: 'http', status: 409, code: 'duplicate_job', jobId: 3 })
    expect(error.message).toBe('Truyện này đang được crawl ở job #3')
  })

  it('tách lỗi kiểm tra dữ liệu (422) theo từng trường của form', async () => {
    mockApi(() =>
      reply(422, {
        detail: [
          {
            loc: ['body', 'http', 'request_delay'],
            msg: 'Input should be greater than or equal to 0.5',
          },
          { loc: ['body'], msg: 'Value error, from_chapter không được lớn hơn to_chapter' },
        ],
      }),
    )

    const error = await failure(api('/settings', { method: 'PUT', body: {} }))

    expect(error.fields).toEqual({
      'http.request_delay': 'Input should be greater than or equal to 0.5',
      '': 'from_chapter không được lớn hơn to_chapter',
    })
    expect(error.message).toMatch(/^Dữ liệu gửi lên không hợp lệ/)
    expect(error.message).not.toMatch(/[{[]/) // không phải JSON thô
  })

  it('không để lộ HTML/JSON thô khi máy chủ lỗi (5xx)', async () => {
    mockApi(() => reply(500, '<html><body>Internal Server Error</body></html>'))

    const error = await failure(api('/stats'))

    expect(error.status).toBe(500)
    expect(error.message).toBe('Máy chủ gặp lỗi (HTTP 500). Xem log của backend rồi thử lại.')
  })

  it('báo riêng trường hợp proxy không tới được backend (502)', async () => {
    mockApi(() => reply(502, ''))

    const error = await failure(api('/stats'))

    expect(error.message).toMatch(/Không liên lạc được với backend \(HTTP 502\)/)
  })
})
