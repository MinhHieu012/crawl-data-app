import { Progress, Stack, Text } from '@mantine/core'

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
  const percent = jobPercent(job)
  const processed = job.chapters_ok + job.chapters_failed
  const novel = isNovelJob(job)
  const unit = novel ? 'chương' : 'file'

  if (percent === null) {
    return (
      <Stack gap={4}>
        <Progress value={100} size={size} striped animated aria-label="Đang chuẩn bị" />
        <Text size="xs" c="dimmed">
          {novel ? 'Đang lấy thông tin truyện và mục lục…' : 'Đang chuẩn bị…'}
        </Text>
      </Stack>
    )
  }
  if (job.chapters_total === 0) {
    // Không có gì để vẽ thành thanh: nói rõ là vì không cần tải, hay vì job dừng quá sớm.
    let reason = novel ? 'Dừng trước khi lấy được mục lục' : 'Dừng trước khi tải được gì'
    if (novel && !job.with_chapters) reason = 'Chỉ lấy thông tin truyện'
    else if (novel && job.status === 'completed') reason = 'Không có chương nào cần tải'
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
          aria-label={novel ? 'Chương đã tải' : 'File đã tải'}
        />
        <Progress.Section
          value={share(job.chapters_failed)}
          color="red"
          aria-label={novel ? 'Chương lỗi' : 'File lỗi'}
        />
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {formatNumber(processed)} / {formatNumber(job.chapters_total)} {unit} · {percent}%
      </Text>
    </Stack>
  )
}
