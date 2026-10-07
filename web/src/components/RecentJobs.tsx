import { Button, Card, Group, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useJobs } from '../api/queries'
import { novelPaths } from '../crawlers/paths'
import { JobsTable } from './JobsTable'
import { EmptyState, QueryState } from './QueryState'

interface RecentJobsProps {
  limit: number
  /** Trang danh sách đầy đủ mà nút "Xem tất cả" dẫn tới. */
  allTo: string
}

/** Khối "Job gần đây" của các trang tổng quan. */
export function RecentJobs({ limit, allTo }: RecentJobsProps) {
  const { t } = useTranslation()
  const jobs = useJobs({ page_size: limit })

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          {t('recentJobs.title')}
        </Title>
        <Button component={Link} to={allTo} variant="subtle" size="compact-sm">
          {t('recentJobs.viewAll')}
        </Button>
      </Group>
      <QueryState
        query={jobs}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title={t('jobs.empty.title')}
            description={t('jobs.empty.description')}
            action={
              <Button component={Link} to={novelPaths.crawl} variant="light">
                {t('common.crawlFirstNovel')}
              </Button>
            }
          />
        }
      >
        {(data) => <JobsTable jobs={data.items} />}
      </QueryState>
    </Card>
  )
}
