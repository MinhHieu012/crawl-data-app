// Hình dạng dữ liệu của API — phản chiếu src/crawl_data_app/web/schemas.py ở backend.

export type JobStatus = 'running' | 'completed' | 'partial' | 'failed' | 'interrupted' | 'cancelled'
export type ChapterStatus = 'pending' | 'done' | 'failed'
export type NovelStatus = 'ongoing' | 'completed' | 'paused' | 'unknown'
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'
export type LogKind = 'request' | 'parse' | 'other'

export interface Page<T> {
  items: T[]
  /** Tổng số dòng khớp bộ lọc, không chỉ trang này. */
  total: number
}

export interface Stats {
  novels: number
  chapters: Record<ChapterStatus, number>
  jobs: Record<JobStatus, number>
}

export interface Source {
  name: string
  domains: string[]
  description: string
  enabled: boolean
  novels: number
  chapters_done: number
}

export interface ConnectionTest {
  ok: boolean
  message: string
  url: string
  elapsed_ms: number
}

export interface Novel {
  id: number
  source: string
  slug: string
  url: string
  title: string
  author: string | null
  genres: string[]
  description: string | null
  cover_url: string | null
  status: NovelStatus
  /** Theo mục lục của nguồn; null nếu chưa từng crawl chương. */
  total_chapters: number | null
  chapters_done: number
  chapters_failed: number
  chapters_pending: number
  published_at: string | null
  last_crawled_at: string | null
}

export interface Chapter {
  number: number
  title: string
  url: string
  status: ChapterStatus
  error: string | null
  crawled_at: string | null
}

export interface ChapterContent extends Chapter {
  /** Rỗng nếu chương chưa tải được. */
  paragraphs: string[]
}

export interface Job {
  id: number
  url: string
  novel_id: number | null
  novel_title: string | null
  with_chapters: boolean
  from_chapter: number | null
  to_chapter: number | null
  status: JobStatus
  /** Số chương lần này phải tải (0 khi chưa lấy xong mục lục). */
  chapters_total: number
  chapters_ok: number
  chapters_failed: number
  chapters_skipped: number
  error: string | null
  started_at: string
  finished_at: string | null
  /** Đang chạy trong tiến trình web → tạm dừng / huỷ được. */
  active: boolean
  last_chapter: string | null
}

export interface JobCreate {
  url: string
  source?: string | null
  with_chapters?: boolean
  from_chapter?: number | null
  to_chapter?: number | null
  force?: boolean
  retry_failed?: boolean
}

export type JobAction = 'pause' | 'cancel' | 'resume' | 'retry'

export interface LogEntry {
  time: string
  level: LogLevel
  logger: string
  message: string
  run_id: number | null
  url: string | null
  kind: LogKind | null
  exception: string | null
}

export interface HttpSettings {
  user_agent: string
  request_timeout: number
  max_retries: number
  concurrency: number
  request_delay: number
}

export interface SettingsUpdate {
  http: HttpSettings
  crawler: { content_format: 'html' | 'markdown' }
  log: { level: LogLevel }
}

export interface Settings {
  http: HttpSettings
  crawler: { content_format: 'html' | 'markdown'; disabled_sources: string[] }
  log: { level: LogLevel; dir: string }
  /** Mật khẩu (nếu có) đã được backend che. */
  database_url: string
  env_file: string
}
