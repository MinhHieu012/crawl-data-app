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

/** Nguồn của danh mục hàng không: dữ liệu mở toàn thế giới, hoặc website Vietnam Airlines. */
export type AviationSource = 'world' | 'vna'
export type AviationKind = 'airport' | 'airline' | 'city' | 'country'

export interface AviationRecord {
  kind: AviationKind
  code: string
  /** Tên tiếng Anh theo nguồn. */
  name: string
  name_vi: string | null
  /** Chỉ sân bay. */
  city_code: string | null
  city_name: string | null
  /** Sân bay và thành phố. */
  country_code: string | null
  country_name: string | null
  region: string | null
  /** Lần cuối còn thấy bản ghi này ở nguồn. */
  crawled_at: string
}

/** Số bản ghi theo loại — `result` của một job đồng bộ (hàng không, tỉnh thành). */
export type RecordCounts = Partial<Record<AviationKind | 'province' | 'ward' | 'bank', number>>

export interface AviationSummary {
  counts: Record<AviationKind, number>
  /** Job đồng bộ gần nhất của nguồn, kể cả job đang chạy. */
  last_job: Job | null
}

/** Một tỉnh hoặc thành phố trực thuộc trung ương của Việt Nam (sau sáp nhập năm 2025). */
export interface Province {
  /** Mã đơn vị hành chính, ví dụ "01". */
  code: string
  name: string
  name_en: string
  /** Kèm loại đơn vị: "Thành phố Hà Nội". */
  full_name: string
  full_name_en: string
  code_name: string
  /** "Thành phố" hoặc "Tỉnh". */
  unit: string
  postal_code_prefix: string | null
  /** Số phường/xã/đặc khu trực thuộc. */
  ward_count: number
  /** Lần cuối còn thấy bản ghi này ở nguồn. */
  crawled_at: string
}

/** Một phường, xã hoặc đặc khu — cấp ngay dưới tỉnh thành. */
export interface Ward {
  code: string
  name: string
  name_en: string
  /** Kèm loại đơn vị: "Phường Ba Đình". */
  full_name: string
  full_name_en: string
  code_name: string
  /** "Phường", "Xã" hoặc "Đặc khu". */
  unit: string
  postal_code: string | null
  province_code: string
  /** Tên đầy đủ của tỉnh thành: "Thành phố Hà Nội". */
  province_name: string | null
  /** Lần cuối còn thấy bản ghi này ở nguồn. */
  crawled_at: string
}

/** Một ngân hàng tại Việt Nam, theo danh sách của VietQR. */
export interface Bank {
  /** Mã BIN Napas, ví dụ "970415". */
  bin: string
  /** Mã ngắn của nguồn: "ICB". */
  code: string
  name: string
  short_name: string
  swift_code: string | null
  /** URL ảnh logo trên CDN của nguồn. */
  logo: string | null
  /** Nhận chuyển khoản nhanh qua mã QR. */
  transfer_supported: boolean
  /** Tra được tên chủ tài khoản. */
  lookup_supported: boolean
  /** Lần cuối còn thấy bản ghi này ở nguồn. */
  crawled_at: string
}

export interface BankSummary {
  /** Số ngân hàng đang có trong database. */
  count: number
  /** Job đồng bộ gần nhất, kể cả job đang chạy. */
  last_job: Job | null
}

export interface ProvinceSummary {
  /** Số tỉnh thành đang có trong database. */
  count: number
  /** Số phường/xã đang có trong database. */
  ward_count: number
  /** Job đồng bộ gần nhất, kể cả job đang chạy. */
  last_job: Job | null
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
  /** Crawler tạo ra job: "novel", "aviation:<nguồn>" (danh mục hàng không), "provinces" hoặc "banks". */
  crawler: string
  url: string
  novel_id: number | null
  novel_title: string | null
  with_chapters: boolean
  from_chapter: number | null
  to_chapter: number | null
  status: JobStatus
  /** Job đồng bộ đã xong: số bản ghi theo loại. */
  result: RecordCounts | null
  /**
   * Bộ đếm tiến độ. Job truyện: số chương lần này phải tải (0 khi chưa lấy xong mục lục). Job đồng
   * bộ (hàng không, tỉnh thành): số file phải tải.
   */
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
  /** Tên file cấu hình, không kèm đường dẫn. */
  env_file: string
}

// --- Góp ý -------------------------------------------------------------------------------------

export type FeedbackType = 'bug_report' | 'crawler_request'
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'rejected'
export type BugSeverity = 'low' | 'medium' | 'high' | 'critical'
/** Loại dữ liệu muốn crawl — để chung chung, không gắn với nguồn nào. */
export type CrawlerDataType = 'novel' | 'aviation' | 'geography' | 'other'

interface FeedbackCreateBase {
  title: string
  description: string
  /** Tên/email để quản trị viên liên hệ lại (tuỳ chọn). */
  contact: string | null
}

export interface BugReportCreate extends FeedbackCreateBase {
  type: 'bug_report'
  /** Trang/chức năng xảy ra lỗi. */
  area: string | null
  severity: BugSeverity
}

export interface CrawlerRequestCreate extends FeedbackCreateBase {
  /** `title` là tên nguồn/website được đề xuất. */
  type: 'crawler_request'
  url: string
  data_type: CrawlerDataType
}

export type FeedbackCreate = BugReportCreate | CrawlerRequestCreate

/** Góp ý như người gửi thấy. */
export interface Feedback {
  id: number
  type: FeedbackType
  title: string
  description: string
  /** Báo lỗi: `area`, `severity`; gợi ý crawler: `url`, `data_type`. */
  details: Partial<Record<'area' | 'severity' | 'url' | 'data_type', string>>
  status: FeedbackStatus
  /** Phản hồi của quản trị viên. */
  response: string | null
  created_at: string
  updated_at: string
}

/** Góp ý như quản trị viên thấy: thêm liên hệ và mã người gửi (8 ký tự đầu của hash). */
export interface AdminFeedback extends Feedback {
  contact: string | null
  reporter: string | null
}

export interface FeedbackUpdate {
  status?: FeedbackStatus
  response?: string | null
}
