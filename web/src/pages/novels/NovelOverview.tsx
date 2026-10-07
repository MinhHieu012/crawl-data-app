import { Badge, Button, Group, SimpleGrid, Skeleton, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useStats } from '../../api/queries'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { RecentJobs } from '../../components/RecentJobs'
import { StatCard } from '../../components/StatCard'
import { novelPaths } from '../../crawlers/paths'
import { formatNumber } from '../../utils/format'

/** Dòng số liệu trên thẻ của crawler truyện ở các trang tổng quan. */
export function NovelSummary() {
  const { t } = useTranslation()
  const { data, isError } = useStats()

  if (!data) {
    return isError ? (
      <Text size="sm" c="red">
        {t('common.statsError')}
      </Text>
    ) : (
      <Skeleton height={20} width={200} />
    )
  }
  return (
    <Group gap="xs">
      <Text size="sm">
        {t('novelOverview.summary', {
          novels: formatNumber(data.novels),
          chapters: formatNumber(data.chapters.done),
        })}
      </Text>
      {data.jobs.running > 0 && (
        <Badge variant="light">{t('common.runningJobs', { count: data.jobs.running })}</Badge>
      )}
    </Group>
  )
}

const GRID = { base: 2, sm: 4 }

/** Tab "Tổng quan" của crawler truyện: dữ liệu đã thu thập và các job gần đây. */
export function NovelOverview() {
  const { t } = useTranslation()
  const stats = useStats()

  return (
    <>
      <PageHeader
        title={t('common.overview')}
        description={t('novelOverview.description')}
        actions={
          <Button component={Link} to={novelPaths.crawl} leftSection={<IconPlus size={16} />}>
            {t('common.crawlNovel')}
          </Button>
        }
      />
      <QueryState
        query={stats}
        skeleton={
          <SimpleGrid cols={GRID} mb="lg">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height={96} radius="md" />
            ))}
          </SimpleGrid>
        }
      >
        {(data) => (
          <SimpleGrid cols={GRID} mb="lg">
            <StatCard label={t('novels.title')} value={data.novels} to={novelPaths.novels} />
            <StatCard label={t('chapters.done')} value={data.chapters.done} color="teal" />
            <StatCard label={t('chapters.pending')} value={data.chapters.pending} />
            <StatCard label={t('chapters.failed')} value={data.chapters.failed} color="red" />
          </SimpleGrid>
        )}
      </QueryState>
      <RecentJobs limit={5} allTo={novelPaths.jobs} />
    </>
  )
}
