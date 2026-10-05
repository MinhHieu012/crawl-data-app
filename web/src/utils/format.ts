import type { Job } from '../api/types'

const DATE_TIME = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
const LOG_TIME = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Giờ UTC của API → giờ máy người xem. */
export function formatDateTime(value: string | null | undefined): string {
  return value ? DATE_TIME.format(new Date(value)) : '—'
}

/** Cùng kiểu ngày với `formatDateTime` (vi-VN tự ghi ngày-tháng không năm là "05-10"). */
export function formatLogTime(value: string): string {
  return LOG_TIME.format(new Date(value)).replace('-', '/')
}

export function formatNumber(value: number): string {
  return value.toLocaleString('vi-VN')
}

export function formatDuration(start: string, end: string | null): string {
  const seconds = Math.max(0, Math.round((Date.parse(end ?? '') - Date.parse(start)) / 1000))
  if (Number.isNaN(seconds)) return '—'
  if (seconds < 60) return `${seconds} giây`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes} phút ${seconds % 60} giây`
    : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`
}

export function jobScope(job: Pick<Job, 'with_chapters' | 'from_chapter' | 'to_chapter'>): string {
  if (!job.with_chapters) return 'Chỉ thông tin truyện'
  if (job.from_chapter === null && job.to_chapter === null) return 'Mọi chương'
  return `Chương ${job.from_chapter ?? 1}–${job.to_chapter ?? 'cuối'}`
}

/** Phần trăm đã xử lý của một job; `null` khi đang chạy mà chưa biết phải tải bao nhiêu chương. */
export function jobPercent(job: Job): number | null {
  if (job.chapters_total > 0) {
    return Math.round(((job.chapters_ok + job.chapters_failed) / job.chapters_total) * 100)
  }
  if (job.status === 'running') return null
  return job.status === 'completed' ? 100 : 0
}

/** Giá trị của ô nhập số chương (để trống là chuỗi rỗng) → số chương, hoặc null nếu để trống. */
export function toChapterNumber(value: number | string): number | null {
  return typeof value === 'number' ? value : null
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')
  } catch {
    return false
  }
}
