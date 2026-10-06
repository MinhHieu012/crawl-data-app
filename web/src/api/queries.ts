// Toàn bộ "server state" của giao diện: mỗi endpoint một hook TanStack Query.
// Trang chỉ gọi hook; cache, hỏi lại định kỳ và làm mới dữ liệu liên quan nằm hết ở đây.

import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { api, ApiError } from './client'
import type {
  ChapterContent,
  ChapterStatus,
  Chapter,
  ConnectionTest,
  Job,
  JobAction,
  JobCreate,
  JobStatus,
  LogEntry,
  LogKind,
  LogLevel,
  Novel,
  Page,
  Settings,
  SettingsUpdate,
  Source,
  Stats,
  AviationKind,
  AviationRecord,
  AviationSource,
  AviationSummary,
  Province,
  ProvinceSummary,
} from './types'

/** Chu kỳ hỏi lại khi có job đang chạy. Không có job nào chạy thì không hỏi định kỳ. */
const POLL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 2000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        // Lỗi 4xx (không tìm thấy, dữ liệu sai...) thử lại cũng vô ích; lỗi mạng/5xx thử thêm 2 lần.
        retry: (failures, error) =>
          failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  })
}

export interface NovelListParams {
  search?: string
  source?: string
  status?: string
  sort?: string
  order?: string
  page?: number
  page_size?: number
}

export interface ChapterListParams {
  status?: ChapterStatus | ''
  page?: number
  page_size?: number
}

export interface JobListParams {
  /** Chỉ job của một crawler: "novel", "aviation:world", "provinces"… */
  crawler?: string
  status?: JobStatus | ''
  novel_id?: number
  page?: number
  page_size?: number
}

export interface LogParams {
  level?: LogLevel | ''
  kind?: LogKind | ''
  job_id?: number
  search?: string
  limit?: number
}

export interface AviationRecordParams {
  kind: AviationKind
  search?: string
  page?: number
  page_size?: number
}

const isRunning = (job: Job | undefined) => job?.status === 'running'

// --- Đọc ---------------------------------------------------------------------------------------

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api<Stats>('/stats'),
    refetchInterval: (query) => ((query.state.data?.jobs.running ?? 0) > 0 ? POLL_MS : false),
  })
}

export function useSources() {
  return useQuery({ queryKey: ['sources'], queryFn: () => api<Source[]>('/sources') })
}

export function useNovels(params: NovelListParams) {
  return useQuery({
    queryKey: ['novels', 'list', params],
    queryFn: () => api<Page<Novel>>('/novels', { params }),
    placeholderData: keepPreviousData, // đổi trang/bộ lọc: giữ bảng cũ tới khi có dữ liệu mới
  })
}

/** `live`: truyện đang được crawl → hỏi lại định kỳ để số chương đã tải tự tăng. */
export function useNovel(id: number, live = false) {
  return useQuery({
    queryKey: ['novels', id],
    queryFn: () => api<Novel>(`/novels/${id}`),
    refetchInterval: live ? POLL_MS : false,
  })
}

export function useChapters(novelId: number, params: ChapterListParams, live = false) {
  return useQuery({
    queryKey: ['novels', novelId, 'chapters', params],
    queryFn: () => api<Page<Chapter>>(`/novels/${novelId}/chapters`, { params }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? POLL_MS : false,
  })
}

export function useChapter(novelId: number, number: number) {
  return useQuery({
    queryKey: ['novels', novelId, 'chapter', number],
    queryFn: () => api<ChapterContent>(`/novels/${novelId}/chapters/${number}`),
  })
}

export function useJobs(params: JobListParams = {}) {
  return useQuery({
    queryKey: ['jobs', 'list', params],
    queryFn: () => api<Page<Job>>('/crawl/jobs', { params }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some(isRunning) ? POLL_MS : false),
  })
}

export function useJob(id: number) {
  return useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api<Job>(`/crawl/jobs/${id}`),
    refetchInterval: (query) => (isRunning(query.state.data) ? POLL_MS : false),
  })
}

/** `live`: hỏi lại định kỳ (dùng khi job đang chạy hoặc người dùng bật "tự làm mới"). */
export function useLogs(params: LogParams, live: boolean) {
  return useQuery({
    queryKey: ['logs', params],
    queryFn: () => api<LogEntry[]>('/logs', { params }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? POLL_MS : false,
  })
}

/** Số bản ghi và job đồng bộ gần nhất của một nguồn; hỏi lại định kỳ khi job đó còn đang chạy. */
export function useAviationSummary(source: AviationSource) {
  return useQuery({
    queryKey: ['aviation', source, 'summary'],
    queryFn: () => api<AviationSummary>(`/aviation/${source}/summary`),
    refetchInterval: (query) =>
      isRunning(query.state.data?.last_job ?? undefined) ? POLL_MS : false,
  })
}

export function useAviationRecords(source: AviationSource, params: AviationRecordParams) {
  return useQuery({
    queryKey: ['aviation', source, 'records', params],
    queryFn: () => api<Page<AviationRecord>>(`/aviation/${source}/records`, { params }),
    placeholderData: keepPreviousData,
  })
}

/** Số tỉnh thành và job đồng bộ gần nhất; hỏi lại định kỳ khi job đó còn đang chạy. */
export function useProvinceSummary() {
  return useQuery({
    queryKey: ['provinces', 'summary'],
    queryFn: () => api<ProvinceSummary>('/provinces/summary'),
    refetchInterval: (query) =>
      isRunning(query.state.data?.last_job ?? undefined) ? POLL_MS : false,
  })
}

/** Cả danh mục trong một trang: chỉ có 34 tỉnh thành nên không phân trang ở giao diện. */
export function useProvinces(search: string) {
  return useQuery({
    queryKey: ['provinces', 'list', search],
    queryFn: () => api<Page<Province>>('/provinces', { params: { search, page_size: 200 } }),
    placeholderData: keepPreviousData,
  })
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') })
}

/**
 * Số job đang chạy. Đặt ở layout nên luôn hoạt động dù đang ở trang nào: mỗi khi có job vừa
 * kết thúc (xong, lỗi, bị dừng) thì làm mới mọi dữ liệu mà job đó có thể đã thay đổi.
 */
export function useJobActivity(): number {
  const queryClient = useQueryClient()
  const { data } = useStats()
  const running = data?.jobs.running ?? 0
  const finished = data && Object.values(data.jobs).reduce((sum, count) => sum + count, 0) - running
  const previous = useRef(finished)

  useEffect(() => {
    if (previous.current !== undefined && finished !== undefined && finished > previous.current) {
      for (const key of ['jobs', 'novels', 'sources', 'aviation', 'provinces', 'logs']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    }
    previous.current = finished
  }, [finished, queryClient])

  return running
}

// --- Ghi ---------------------------------------------------------------------------------------

function useJobMutation<TInput>(send: (input: TInput) => Promise<Job>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: (job) => {
      queryClient.setQueryData(['jobs', job.id], job)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useCreateJob() {
  return useJobMutation((body: JobCreate) => api<Job>('/crawl/jobs', { method: 'POST', body }))
}

/** Tạm dừng / huỷ trả về chính job đó; tiếp tục / thử lại trả về một job MỚI (ID khác). */
export function useJobAction() {
  return useJobMutation(({ id, action }: { id: number; action: JobAction }) =>
    api<Job>(`/crawl/jobs/${id}/${action}`, { method: 'POST' }),
  )
}

export function useToggleSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api<Source>(`/sources/${name}`, { method: 'PUT', body: { enabled } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] })
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export function useTestSource() {
  return useMutation({
    // Backend tự thử lại khi mạng chập chờn (có backoff) nên có thể mất cả phút mới trả lời.
    mutationFn: (name: string) =>
      api<ConnectionTest>(`/sources/${name}/test`, { method: 'POST', timeoutMs: 180_000 }),
  })
}

/**
 * Tạo job đồng bộ lại toàn bộ một danh mục; backend trả về job ngay, việc tải chạy nền. `dataKey`:
 * khoá cache của danh mục đó.
 */
function useSyncJob(path: string, dataKey: string[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<Job>(path, { method: 'POST' }),
    onSuccess: (job) => {
      queryClient.setQueryData(['jobs', job.id], job)
      // `dataKey`: nút đồng bộ chuyển sang "đang chạy" và bắt đầu hỏi lại định kỳ.
      for (const queryKey of [['jobs'], ['stats'], dataKey]) {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
  })
}

export const useSyncAviation = (source: AviationSource) =>
  useSyncJob(`/aviation/${source}/sync`, ['aviation', source])

export const useSyncProvinces = () => useSyncJob('/provinces/sync', ['provinces'])

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SettingsUpdate) => api<Settings>('/settings', { method: 'PUT', body }),
    onSuccess: (settings) => queryClient.setQueryData(['settings'], settings),
  })
}
