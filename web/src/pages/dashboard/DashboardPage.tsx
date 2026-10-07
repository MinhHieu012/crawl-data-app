import { Button, SimpleGrid, Skeleton } from '@mantine/core'
import { IconSpider } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useStats } from '../../api/queries'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { RecentJobs } from '../../components/RecentJobs'
import { StatCard } from '../../components/StatCard'
import { CRAWLERS_PATH } from '../../crawlers/paths'
import { CRAWLER_MODULES } from '../../crawlers/registry'

const GRID = { base: 2, sm: 4 }
const CATEGORIES = CRAWLER_MODULES.flatMap((crawler) => crawler.categories)
const READY = CATEGORIES.filter((category) => category.sections).length

/**
 * Tổng quan của cả hệ thống: có bao nhiêu crawler và các job đang ra sao. Số liệu riêng của từng
 * crawler (số truyện, số chương…) nằm ở tab Tổng quan của crawler đó.
 */
export function DashboardPage() {
  const { t } = useTranslation()
  const stats = useStats()

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <Button component={Link} to={CRAWLERS_PATH} leftSection={<IconSpider size={16} />}>
            {t('dashboard.openCrawlers')}
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
            <StatCard
              label={t('common.crawlers')}
              value={CRAWLER_MODULES.length}
              to={CRAWLERS_PATH}
              hint={t('dashboard.readyHint', { ready: READY, total: CATEGORIES.length })}
            />
            <StatCard
              label={t('dashboard.running')}
              value={data.jobs.running}
              color="blue"
              to="/jobs?status=running"
            />
            <StatCard
              label={t('dashboard.completed')}
              value={data.jobs.completed}
              color="teal"
              to="/jobs?status=completed"
            />
            <StatCard
              label={t('dashboard.failed')}
              value={data.jobs.failed + data.jobs.partial}
              color="red"
              to="/jobs?status=failed"
              hint={t('dashboard.failedHint', {
                failed: data.jobs.failed,
                partial: data.jobs.partial,
              })}
            />
          </SimpleGrid>
        )}
      </QueryState>

      <RecentJobs limit={8} allTo="/jobs" />
    </>
  )
}
