import { Badge, Button, Group, SimpleGrid, Skeleton, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
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
  const { data, isError } = useStats()

  if (!data) {
    return isError ? (
      <Text size="sm" c="red">
        Không tải được số liệu
      </Text>
    ) : (
      <Skeleton height={20} width={200} />
    )
  }
  return (
    <Group gap="xs">
      <Text size="sm">
        {formatNumber(data.novels)} truyện · {formatNumber(data.chapters.done)} chương đã tải
      </Text>
      {data.jobs.running > 0 && <Badge variant="light">{data.jobs.running} job đang chạy</Badge>}
    </Group>
  )
}

const GRID = { base: 2, sm: 4 }

/** Tab "Tổng quan" của crawler truyện: dữ liệu đã thu thập và các job gần đây. */
export function NovelOverview() {
  const stats = useStats()

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Dữ liệu truyện đã thu thập và các lần crawl gần đây."
        actions={
          <Button component={Link} to={novelPaths.crawl} leftSection={<IconPlus size={16} />}>
            Crawl truyện
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
            <StatCard label="Truyện" value={data.novels} to={novelPaths.novels} />
            <StatCard label="Chương đã tải" value={data.chapters.done} color="teal" />
            <StatCard label="Chương chờ tải" value={data.chapters.pending} />
            <StatCard label="Chương lỗi" value={data.chapters.failed} color="red" />
          </SimpleGrid>
        )}
      </QueryState>
      <RecentJobs limit={5} allTo={novelPaths.jobs} />
    </>
  )
}
