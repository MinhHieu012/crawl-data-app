import { Button, Card, Group, NativeSelect } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useJobs } from '../../api/queries'
import type { JobStatus } from '../../api/types'
import { JobsTable } from '../../components/JobsTable'
import { Pager } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { JOB_STATUS, statusOptions } from '../../components/StatusBadge'
import { novelPaths } from '../../crawlers/paths'
import { useUrlState } from '../../hooks/useUrlState'
import { jobCrawlers } from '../../utils/format'

const PAGE_SIZE = 20
// Màn hẹp: hai ô lọc chia đều một hàng; từ `sm` mỗi ô rộng cố định.
const FILTER_FLEX = { base: '1 1 150px', sm: '0 0 240px' }

interface JobsPageProps {
  /** Nút ở đầu trang. Mặc định là "Crawl truyện" (tab Job của crawler truyện); trang Job chung truyền menu chọn crawler. */
  actions?: ReactNode
  /** Chỉ hiện job của một crawler (tab Job trong crawler đó); bỏ trống thì có ô lọc theo crawler. */
  crawler?: string
}

export function JobsPage({ actions, crawler }: JobsPageProps) {
  const { t } = useTranslation()
  const [filters, setFilters] = useUrlState({ status: '', crawler: '', page: '1' })
  const page = Number(filters.page) || 1
  const jobs = useJobs({
    status: filters.status as JobStatus | '',
    crawler: crawler ?? filters.crawler,
    page,
    page_size: PAGE_SIZE,
  })
  const filtering = Boolean(filters.status || (!crawler && filters.crawler))

  return (
    <>
      <PageHeader
        title={t('jobs.title')}
        description={t('jobs.description')}
        actions={
          actions ?? (
            <Button component={Link} to={novelPaths.crawl} leftSection={<IconPlus size={16} />}>
              {t('common.crawlNovel')}
            </Button>
          )
        }
      />
      <Card withBorder>
        <Group mb="md">
          {!crawler && (
            <NativeSelect
              aria-label={t('jobs.filterCrawler')}
              data={[{ value: '', label: t('jobs.allCrawlers') }, ...jobCrawlers()]}
              value={filters.crawler}
              onChange={(event) => setFilters({ crawler: event.currentTarget.value })}
              flex={FILTER_FLEX}
            />
          )}
          <NativeSelect
            aria-label={t('jobs.filterStatus')}
            data={statusOptions(JOB_STATUS, t('jobs.allStatuses'))}
            value={filters.status}
            onChange={(event) => setFilters({ status: event.currentTarget.value })}
            flex={FILTER_FLEX}
          />
        </Group>
        <QueryState
          query={jobs}
          isEmpty={(data) => data.total === 0}
          empty={
            filtering ? (
              <EmptyState
                title={t('jobs.noMatch.title')}
                description={t('jobs.noMatch.description')}
              />
            ) : (
              <EmptyState
                title={t('jobs.empty.title')}
                description={t('jobs.empty.description')}
                action={
                  <Button component={Link} to={novelPaths.crawl} variant="light">
                    {t('common.crawlFirstNovel')}
                  </Button>
                }
              />
            )
          }
        >
          {(data) => (
            <>
              <JobsTable jobs={data.items} />
              <Pager
                total={data.total}
                page={page}
                pageSize={PAGE_SIZE}
                onChange={(next) => setFilters({ page: String(next) })}
              />
            </>
          )}
        </QueryState>
      </Card>
    </>
  )
}
