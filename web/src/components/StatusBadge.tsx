import { Badge } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import type {
  BugSeverity,
  ChapterStatus,
  FeedbackStatus,
  FeedbackType,
  JobStatus,
  LogLevel,
  NovelStatus,
} from '../api/types'
import i18n, { type I18nKey } from '../i18n'

/** `label` là khoá dịch; bỏ trống thì hiện nguyên giá trị (mức log không dịch). */
type Look = { label?: I18nKey; color: string }

// Nhãn và màu cho từng trạng thái — nguồn duy nhất, các ô chọn bộ lọc cũng lấy từ đây.
export const JOB_STATUS: Record<JobStatus, Look> = {
  running: { label: 'status.job.running', color: 'blue' },
  completed: { label: 'status.job.completed', color: 'teal' },
  partial: { label: 'status.job.partial', color: 'yellow' },
  failed: { label: 'status.job.failed', color: 'red' },
  interrupted: { label: 'status.job.interrupted', color: 'orange' },
  cancelled: { label: 'status.job.cancelled', color: 'gray' },
}

export const CHAPTER_STATUS: Record<ChapterStatus, Look> = {
  done: { label: 'status.chapter.done', color: 'teal' },
  pending: { label: 'status.chapter.pending', color: 'gray' },
  failed: { label: 'status.chapter.failed', color: 'red' },
}

export const NOVEL_STATUS: Record<NovelStatus, Look> = {
  ongoing: { label: 'status.novel.ongoing', color: 'blue' },
  completed: { label: 'status.novel.completed', color: 'teal' },
  paused: { label: 'status.novel.paused', color: 'yellow' },
  unknown: { label: 'status.novel.unknown', color: 'gray' },
}

export const FEEDBACK_STATUS: Record<FeedbackStatus, Look> = {
  open: { label: 'status.feedback.open', color: 'blue' },
  in_progress: { label: 'status.feedback.in_progress', color: 'yellow' },
  resolved: { label: 'status.feedback.resolved', color: 'teal' },
  rejected: { label: 'status.feedback.rejected', color: 'gray' },
}

export const FEEDBACK_TYPE: Record<FeedbackType, Look> = {
  bug_report: { label: 'feedback.types.bug_report', color: 'red' },
  crawler_request: { label: 'feedback.types.crawler_request', color: 'grape' },
}

export const BUG_SEVERITY: Record<BugSeverity, Look> = {
  low: { label: 'feedback.severity.low', color: 'gray' },
  medium: { label: 'feedback.severity.medium', color: 'yellow' },
  high: { label: 'feedback.severity.high', color: 'orange' },
  critical: { label: 'feedback.severity.critical', color: 'red' },
}

const LOG_LEVEL: Record<LogLevel, Look> = {
  DEBUG: { color: 'gray' },
  INFO: { color: 'blue' },
  WARNING: { color: 'yellow' },
  ERROR: { color: 'red' },
}

function StatusBadge({ look, fallback }: { look: Look | undefined; fallback: string }) {
  const { t } = useTranslation()
  return (
    <Badge color={look?.color ?? 'gray'} variant="light" style={{ flexShrink: 0 }}>
      {look?.label ? t(look.label) : fallback}
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

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <StatusBadge look={FEEDBACK_STATUS[status]} fallback={status} />
}

export function FeedbackTypeBadge({ type }: { type: FeedbackType }) {
  return <StatusBadge look={FEEDBACK_TYPE[type]} fallback={type} />
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <StatusBadge look={BUG_SEVERITY[severity as BugSeverity]} fallback={severity} />
}

export function LogLevelBadge({ level }: { level: LogLevel }) {
  return <StatusBadge look={LOG_LEVEL[level]} fallback={level} />
}

/** Lựa chọn cho ô lọc theo trạng thái, kèm mục "tất cả" ở đầu. */
export function statusOptions(looks: Record<string, Look>, allLabel: string) {
  return [
    { value: '', label: allLabel },
    ...Object.entries(looks).map(([value, look]) => ({
      value,
      label: look.label ? i18n.t(look.label) : value,
    })),
  ]
}
