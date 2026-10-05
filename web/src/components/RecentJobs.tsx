import { Button, Card, Group, Title } from '@mantine/core'
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
  const jobs = useJobs({ page_size: limit })

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Job gần đây
        </Title>
        <Button component={Link} to={allTo} variant="subtle" size="compact-sm">
          Xem tất cả
        </Button>
      </Group>
      <QueryState
        query={jobs}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title="Chưa có job nào"
            description="Dán URL của một truyện để bắt đầu crawl."
            action={
              <Button component={Link} to={novelPaths.crawl} variant="light">
                Crawl truyện đầu tiên
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
