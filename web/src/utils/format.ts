import type { Job, RecordCounts } from '../api/types'
import i18n, { type I18nKey } from '../i18n'

// Bộ định dạng ngày giờ theo ngôn ngữ đang chọn, dựng lại mỗi lần đổi ngôn ngữ (dựng mới cho từng
// dòng của bảng thì chậm).
let dateTime: Intl.DateTimeFormat
let logTime: Intl.DateTimeFormat
function buildFormats(language: string) {
  dateTime = new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' })
  logTime = new Intl.DateTimeFormat(language, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
}
buildFormats(i18n.language)
i18n.on('languageChanged', buildFormats)

/** Giờ UTC của API → giờ máy người xem. */
export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : '—'
}

/** Cùng kiểu ngày với `formatDateTime` (tiếng Việt tự ghi ngày-tháng không năm là "05-10"). */
export function formatLogTime(value: string): string {
  return logTime.format(new Date(value)).replace('-', '/')
}

export function formatNumber(value: number): string {
  return value.toLocaleString(i18n.language)
}

export function formatDuration(start: string, end: string | null): string {
  const seconds = Math.max(0, Math.round((Date.parse(end ?? '') - Date.parse(start)) / 1000))
  if (Number.isNaN(seconds)) return '—'
  if (seconds < 60) return i18n.t('duration.seconds', { seconds })
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? i18n.t('duration.minutes', { minutes, seconds: seconds % 60 })
    : i18n.t('duration.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

const RECORD_KINDS = ['airport', 'city', 'country', 'airline', 'province', 'ward'] as const

/** "469 sân bay · 464 thành phố · …" hay "34 tỉnh thành" — chỉ kể những loại có trong `counts`. */
export function recordCounts(counts: RecordCounts): string {
  return RECORD_KINDS.filter((kind) => counts[kind] !== undefined)
    .map((kind) => i18n.t(`records.${kind}`, { count: counts[kind] ?? 0 }))
    .join(' · ')
}

// Tên hiển thị của job không phải crawl truyện, ghép từ tên trong registry (khoá dịch). Để ở đây chứ
// không đọc registry.tsx vì bảng job là component dùng chung (registry import các trang, trang import bảng).
const JOB_TITLE: Record<string, I18nKey[]> = {
  'aviation:world': ['registry.aviation.name', 'registry.aviation.world.name'],
  'aviation:vna': ['registry.aviation.name', 'registry.aviation.vna.name'],
  provinces: ['registry.provinces.name'],
}
const syncJobTitle = (crawler: string) => JOB_TITLE[crawler]?.map((key) => i18n.t(key)).join(' · ')

/** Mọi giá trị của `job.crawler` kèm tên hiển thị — cho ô lọc theo crawler ở trang Job. */
export const jobCrawlers = () => [
  { value: 'novel', label: i18n.t('registry.novel.name') },
  ...Object.keys(JOB_TITLE).map((value) => ({ value, label: syncJobTitle(value) ?? value })),
]

export const isNovelJob = (job: Pick<Job, 'crawler'>) => job.crawler === 'novel'

/** Job đang làm gì: tên truyện (chưa biết thì URL), hoặc tên nguồn đang đồng bộ. */
export function jobTitle(job: Pick<Job, 'crawler' | 'novel_title' | 'url'>): string {
  return syncJobTitle(job.crawler) ?? job.novel_title ?? job.url
}

export function jobScope(
  job: Pick<Job, 'crawler' | 'with_chapters' | 'from_chapter' | 'to_chapter'>,
): string {
  if (!isNovelJob(job)) return i18n.t('jobScope.catalog')
  if (!job.with_chapters) return i18n.t('crawl.scopes.info')
  if (job.from_chapter === null && job.to_chapter === null) return i18n.t('jobScope.allChapters')
  return i18n.t('jobScope.range', {
    from: job.from_chapter ?? 1,
    to: job.to_chapter ?? i18n.t('jobScope.end'),
  })
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
