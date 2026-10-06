import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { makeNovel, mockApi, renderPage } from '../../test/utils'
import { NovelDetailPage } from './NovelDetailPage'

function openPage(chaptersDone = 4) {
  mockApi((request) =>
    request.path === '/novels/3'
      ? makeNovel({ chapters_done: chaptersDone })
      : { items: [], total: 0 },
  )
  renderPage(<NovelDetailPage />, { route: '/novels/3', path: '/novels/:id' })
}

describe('NovelDetailPage — xuất JSON', () => {
  it('tải toàn bộ chương, hoặc một khoảng chương hợp lệ', async () => {
    const user = userEvent.setup()
    openPage()

    await user.click(await screen.findByRole('button', { name: 'Xuất JSON…' }))

    const link = () => screen.getByRole('link', { name: 'Tải file JSON' })
    expect(link()).toHaveAttribute('href', '/api/novels/3/export')

    await user.click(screen.getByRole('radio', { name: 'Khoảng chương' }))
    expect(link()).toHaveAttribute('href', '/api/novels/3/export?from_chapter=1&to_chapter=10')

    await user.clear(screen.getByLabelText('Từ chương'))
    await user.type(screen.getByLabelText('Từ chương'), '4')
    await user.clear(screen.getByLabelText('Đến chương'))
    expect(link()).toHaveAttribute('href', '/api/novels/3/export?from_chapter=4')

    await user.type(screen.getByLabelText('Đến chương'), '2')
    expect(screen.queryByRole('link', { name: 'Tải file JSON' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tải file JSON' })).toBeDisabled()
    expect(screen.getByText(/phải lớn hơn hoặc bằng chương bắt đầu/)).toBeInTheDocument()
  })

  it('khoá nút khi truyện chưa có chương nào đã tải', async () => {
    openPage(0)

    expect(await screen.findByRole('button', { name: 'Xuất JSON…' })).toBeDisabled()
  })
})
