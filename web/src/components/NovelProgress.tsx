import { Progress, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import type { Novel } from '../api/types'
import { formatNumber } from '../utils/format'

interface NovelProgressProps {
  novel: Novel
  size?: 'sm' | 'md' | 'lg'
}

/** Số chương đã tải trên tổng số chương của truyện; phần đỏ là các chương đang lỗi. */
export function NovelProgress({ novel, size = 'sm' }: NovelProgressProps) {
  const { t } = useTranslation()
  const total = novel.total_chapters
  if (!total) {
    return (
      <Text size="xs" c="dimmed">
        {t('novelProgress.noToc')}
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
          aria-label={t('chapters.done')}
        />
        <Progress.Section
          value={share(novel.chapters_failed)}
          color="red"
          aria-label={t('chapters.failed')}
        />
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {t('novelProgress.count', {
          done: formatNumber(novel.chapters_done),
          total: formatNumber(total),
        })}
        {novel.chapters_failed > 0 &&
          ` · ${t('novelProgress.failed', { failed: formatNumber(novel.chapters_failed) })}`}
      </Text>
    </Stack>
  )
}
