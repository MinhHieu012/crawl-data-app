import { Progress, Stack, Text } from '@mantine/core'

import type { Job } from '../api/types'
import { formatNumber, jobPercent } from '../utils/format'

interface JobProgressProps {
  job: Job
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

/** Thanh tiến độ của một job: phần xanh là chương tải được, phần đỏ là chương lỗi. */
export function JobProgress({ job, size = 'sm' }: JobProgressProps) {
  const percent = jobPercent(job)
  const processed = job.chapters_ok + job.chapters_failed

  if (percent === null) {
    return (
      <Stack gap={4}>
        <Progress value={100} size={size} striped animated aria-label="Đang chuẩn bị" />
        <Text size="xs" c="dimmed">
          Đang lấy thông tin truyện và mục lục…
        </Text>
      </Stack>
    )
  }
  if (job.chapters_total === 0) {
    // Không có gì để vẽ thành thanh: nói rõ là vì không cần tải, hay vì job dừng quá sớm.
    let reason = 'Dừng trước khi lấy được mục lục'
    if (!job.with_chapters) reason = 'Chỉ lấy thông tin truyện'
    else if (job.status === 'completed') reason = 'Không có chương nào cần tải'
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
          aria-label="Chương đã tải"
        />
        <Progress.Section value={share(job.chapters_failed)} color="red" aria-label="Chương lỗi" />
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {formatNumber(processed)} / {formatNumber(job.chapters_total)} chương · {percent}%
      </Text>
    </Stack>
  )
}
