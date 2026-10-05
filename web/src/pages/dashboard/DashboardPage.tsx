import { Button, SimpleGrid, Skeleton } from '@mantine/core'
import { IconSpider } from '@tabler/icons-react'
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
  const stats = useStats()

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Hoạt động của mọi crawler trong hệ thống."
        actions={
          <Button component={Link} to={CRAWLERS_PATH} leftSection={<IconSpider size={16} />}>
            Mở crawler
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
              label="Crawler"
              value={CRAWLER_MODULES.length}
              to={CRAWLERS_PATH}
              hint={`${READY} / ${CATEGORIES.length} loại dữ liệu đã sẵn sàng`}
            />
            <StatCard
              label="Job đang chạy"
              value={data.jobs.running}
              color="blue"
              to="/jobs?status=running"
            />
            <StatCard
              label="Job hoàn tất"
              value={data.jobs.completed}
              color="teal"
              to="/jobs?status=completed"
            />
            <StatCard
              label="Job lỗi"
              value={data.jobs.failed + data.jobs.partial}
              color="red"
              to="/jobs?status=failed"
              hint={`${data.jobs.failed} thất bại · ${data.jobs.partial} còn chương lỗi`}
            />
          </SimpleGrid>
        )}
      </QueryState>

      <RecentJobs limit={8} allTo="/jobs" />
    </>
  )
}
