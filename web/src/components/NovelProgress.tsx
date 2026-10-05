import { Progress, Stack, Text } from '@mantine/core'

import type { Novel } from '../api/types'
import { formatNumber } from '../utils/format'

interface NovelProgressProps {
  novel: Novel
  size?: 'sm' | 'md' | 'lg'
}

/** Số chương đã tải trên tổng số chương của truyện; phần đỏ là các chương đang lỗi. */
export function NovelProgress({ novel, size = 'sm' }: NovelProgressProps) {
  const total = novel.total_chapters
  if (!total) {
    return (
      <Text size="xs" c="dimmed">
        Chưa crawl mục lục
      </Text>
    )
  }
  const share = (count: number) => (count / total) * 100
  return (
    <Stack gap={4}>
      <Progress.Root size={size}>
        <Progress.Section
          value={share(novel.chapters_done)}
          color="teal"
          aria-label="Chương đã tải"
        />
        <Progress.Section
          value={share(novel.chapters_failed)}
          color="red"
          aria-label="Chương lỗi"
        />
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {formatNumber(novel.chapters_done)} / {formatNumber(total)} chương
        {novel.chapters_failed > 0 && ` · ${formatNumber(novel.chapters_failed)} lỗi`}
      </Text>
    </Stack>
  )
}
