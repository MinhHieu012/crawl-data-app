// Một cửa duy nhất để gọi backend: ghép URL, đặt timeout và đổi mọi kiểu thất bại
// (mất mạng, quá hạn, 4xx, 5xx) thành `ApiError` có câu thông báo đọc được cho người dùng.

import i18n, { type I18nKey } from '../i18n'

export const BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Tham số trên URL; giá trị rỗng/null/undefined được bỏ qua. */
  params?: object
  body?: unknown
  /** Header thêm: mã người gửi góp ý, mã quản trị. */
  headers?: Record<string, string>
  timeoutMs?: number
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params = {}, body, headers, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as [string, QueryValue][]) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const queryString = query.toString()

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}${queryString ? `?${queryString}` : ''}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new ApiError(i18n.t('api.timeout'), { kind: 'timeout' })
    }
    throw new ApiError(i18n.t('api.network'), { kind: 'network' })
  }
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T // xoá thành công: không có nội dung
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
    // ponytail: backend chỉ viết `detail` bằng tiếng Việt; ngôn ngữ khác dùng câu chung theo `code`
    // (mất chi tiết như số job, tên nguồn). Nâng cấp: backend dịch `detail` theo Accept-Language.
    const key = `api.codes.${String(data.code)}`
    message = i18n.language !== 'vi' && i18n.exists(key) ? i18n.t(key as I18nKey) : data.detail
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
    message = i18n.t('api.invalid', { details: lines.join('; ') })
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
  if (status === 404) return i18n.t('api.codes.not_found')
  if (status === 502 || status === 503 || status === 504) {
    return i18n.t('api.unreachable', { status })
  }
  if (status >= 500) return i18n.t('api.serverError', { status })
  return i18n.t('api.failed', { status })
}
