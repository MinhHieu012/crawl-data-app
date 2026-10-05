import { Badge } from '@mantine/core'

import type { ChapterStatus, JobStatus, LogLevel, NovelStatus } from '../api/types'

type Look = { label: string; color: string }

// Nhãn tiếng Việt và màu cho từng trạng thái — nguồn duy nhất, các ô chọn bộ lọc cũng lấy từ đây.
export const JOB_STATUS: Record<JobStatus, Look> = {
  running: { label: 'Đang chạy', color: 'blue' },
  completed: { label: 'Hoàn tất', color: 'teal' },
  partial: { label: 'Còn chương lỗi', color: 'yellow' },
  failed: { label: 'Thất bại', color: 'red' },
  interrupted: { label: 'Tạm dừng', color: 'orange' },
  cancelled: { label: 'Đã huỷ', color: 'gray' },
}

export const CHAPTER_STATUS: Record<ChapterStatus, Look> = {
  done: { label: 'Đã tải', color: 'teal' },
  pending: { label: 'Chờ tải', color: 'gray' },
  failed: { label: 'Lỗi', color: 'red' },
}

export const NOVEL_STATUS: Record<NovelStatus, Look> = {
  ongoing: { label: 'Đang ra', color: 'blue' },
  completed: { label: 'Hoàn thành', color: 'teal' },
  paused: { label: 'Tạm ngưng', color: 'yellow' },
  unknown: { label: 'Không rõ', color: 'gray' },
}

const LOG_LEVEL: Record<LogLevel, Look> = {
  DEBUG: { label: 'DEBUG', color: 'gray' },
  INFO: { label: 'INFO', color: 'blue' },
  WARNING: { label: 'WARNING', color: 'yellow' },
  ERROR: { label: 'ERROR', color: 'red' },
}

function StatusBadge({ look, fallback }: { look: Look | undefined; fallback: string }) {
  return (
    <Badge color={look?.color ?? 'gray'} variant="light" style={{ flexShrink: 0 }}>
      {look?.label ?? fallback}
    </Badge>
  )
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <StatusBadge look={JOB_STATUS[status]} fallback={status} />
}

export function ChapterStatusBadge({ status }: { status: ChapterStatus }) {
  return <StatusBadge look={CHAPTER_STATUS[status]} fallback={status} />
}

export function NovelStatusBadge({ status }: { status: NovelStatus }) {
  return <StatusBadge look={NOVEL_STATUS[status]} fallback={status} />
}

export function LogLevelBadge({ level }: { level: LogLevel }) {
  return <StatusBadge look={LOG_LEVEL[level]} fallback={level} />
}

/** Lựa chọn cho ô lọc theo trạng thái, kèm mục "tất cả" ở đầu. */
export function statusOptions(looks: Record<string, Look>, allLabel: string) {
  return [
    { value: '', label: allLabel },
    ...Object.entries(looks).map(([value, look]) => ({ value, label: look.label })),
  ]
}
