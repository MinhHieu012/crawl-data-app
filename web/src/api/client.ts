// Một cửa duy nhất để gọi backend: ghép URL, đặt timeout và đổi mọi kiểu thất bại
// (mất mạng, quá hạn, 4xx, 5xx) thành `ApiError` có câu thông báo đọc được cho người dùng.

const BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
const DEFAULT_TIMEOUT_MS = 15_000

interface ApiErrorInit {
  kind: 'network' | 'timeout' | 'http'
  status?: number
  code?: string
  fields?: Record<string, string>
  jobId?: number
}

export class ApiError extends Error {
  readonly kind: ApiErrorInit['kind']
  /** Mã HTTP; 0 nếu không nhận được phản hồi nào. */
  readonly status: number
  /** Mã lỗi của backend: invalid_url, unsupported_source, duplicate_job, source_disabled... */
  readonly code: string | undefined
  /** Lỗi theo từng trường của form (HTTP 422), ví dụ "http.request_delay" → thông báo. */
  readonly fields: Record<string, string>
  /** Với duplicate_job: job đang crawl truyện đó. */
  readonly jobId: number | undefined

  constructor(message: string, init: ApiErrorInit) {
    super(message)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status ?? 0
    this.code = init.code
    this.fields = init.fields ?? {}
    this.jobId = init.jobId
  }
}

type QueryValue = string | number | boolean | null | undefined

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  /** Tham số trên URL; giá trị rỗng/null/undefined được bỏ qua. */
  params?: object
  body?: unknown
  timeoutMs?: number
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as [string, QueryValue][]) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const queryString = query.toString()

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}${queryString ? `?${queryString}` : ''}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new ApiError('Máy chủ phản hồi quá lâu. Kiểm tra backend rồi thử lại.', {
        kind: 'timeout',
      })
    }
    throw new ApiError(
      'Không kết nối được tới máy chủ. Kiểm tra backend (novel-crawler serve) có đang chạy không.',
      { kind: 'network' },
    )
  }
  if (!response.ok) throw await toApiError(response)
  return (await response.json()) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined // lỗi 5xx có thể trả về văn bản hoặc HTML thay vì JSON
  }
  const data = isRecord(payload) ? payload : {}
  const fields: Record<string, string> = {}
  let message: string | undefined

  if (typeof data.detail === 'string') {
    message = data.detail
  } else if (Array.isArray(data.detail)) {
    // Lỗi kiểm tra dữ liệu của FastAPI: [{ loc: ["body", "http", "request_delay"], msg: "..." }]
    for (const item of data.detail) {
      if (!isRecord(item) || typeof item.msg !== 'string') continue
      const path = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body') : []
      fields[path.join('.')] = item.msg.replace(/^Value error, /, '')
    }
    const lines = Object.entries(fields).map(([field, text]) =>
      field ? `${field}: ${text}` : text,
    )
    message = `Dữ liệu gửi lên không hợp lệ — ${lines.join('; ')}`
  }

  return new ApiError(message ?? fallbackMessage(response.status), {
    kind: 'http',
    status: response.status,
    code: typeof data.code === 'string' ? data.code : undefined,
    fields,
    jobId: typeof data.job_id === 'number' ? data.job_id : undefined,
  })
}

function fallbackMessage(status: number): string {
  if (status === 404) return 'Không tìm thấy dữ liệu được yêu cầu.'
  if (status === 502 || status === 503 || status === 504) {
    return `Không liên lạc được với backend (HTTP ${status}). Kiểm tra novel-crawler serve có đang chạy không.`
  }
  if (status >= 500) return `Máy chủ gặp lỗi (HTTP ${status}). Xem log của backend rồi thử lại.`
  return `Yêu cầu không thực hiện được (HTTP ${status}).`
}
