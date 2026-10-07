import { Progress, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import type { Job } from '../api/types'
import { formatNumber, isNovelJob, jobPercent } from '../utils/format'

interface JobProgressProps {
  job: Job
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

/**
 * Thanh tiến độ của một job: phần xanh là phần tải được, phần đỏ là phần lỗi. Đơn vị đếm là chương
 * với job truyện và file với job đồng bộ hàng không.
 */
export function JobProgress({ job, size = 'sm' }: JobProgressProps) {
  const { t } = useTranslation()
  const percent = jobPercent(job)
  const processed = job.chapters_ok + job.chapters_failed
  const novel = isNovelJob(job)

  if (percent === null) {
    return (
      <Stack gap={4}>
        <Progress value={100} size={size} striped animated aria-label={t('progress.preparing')} />
        <Text size="xs" c="dimmed">
          {novel ? t('progress.preparingNovel') : t('progress.preparingSync')}
        </Text>
      </Stack>
    )
  }
  if (job.chapters_total === 0) {
    // Không có gì để vẽ thành thanh: nói rõ là vì không cần tải, hay vì job dừng quá sớm.
    let reason = novel ? t('progress.stoppedBeforeToc') : t('progress.stoppedBeforeAny')
    if (novel && !job.with_chapters) reason = t('progress.infoOnly')
    else if (novel && job.status === 'completed') reason = t('progress.nothingToDownload')
    return (
      <Text size="xs" c="dimmed">
        {reason}
      </Text>
    )
  }

  const share = (count: number) => (count / job.chapters_total) * 100
  return (
    <Stack gap={4}>
      {/* Tên cho trình đọc màn hình đặt ở từng đoạn (role="progressbar"), không đặt ở thẻ bao. */}
      <Progress.Root size={size}>
        <Progress.Section
          value={share(job.chapters_ok)}
          color="teal"
          animated={job.status === 'running'}
          aria-label={novel ? t('chapters.done') : t('progress.filesDone')}
        />
        <Progress.Section
          value={share(job.chapters_failed)}
          color="red"
          aria-label={novel ? t('chapters.failed') : t('progress.filesFailed')}
        />
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {t(novel ? 'progress.chapters' : 'progress.files', {
          done: formatNumber(processed),
          total: formatNumber(job.chapters_total),
          percent,
        })}
      </Text>
    </Stack>
  )
}
