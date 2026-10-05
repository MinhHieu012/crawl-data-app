import { Anchor, Button, Card, Group, SimpleGrid, Skeleton, Text, Title } from '@mantine/core'
import { useHover } from '@mantine/hooks'
import { IconPlus } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useJobs, useStats } from '../../api/queries'
import { JobsTable } from '../../components/JobsTable'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { formatNumber } from '../../utils/format'

interface StatCardProps {
  label: string
  value: number
  hint?: ReactNode
  color?: string
  /** Bấm vào thẻ để tới danh sách tương ứng. */
  to?: string
}

function StatCard({ label, value, hint, color, to }: StatCardProps) {
  // Thẻ bấm được (có `to`) đổi nền khi rê chuột, để phân biệt với thẻ chỉ để xem.
  const { hovered, ref } = useHover<HTMLDivElement>()
  const card = (
    <Card
      ref={ref}
      withBorder
      padding="md"
      h="100%"
      bg={to && hovered ? 'var(--mantine-color-default-hover)' : undefined}
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fz={28} fw={700} c={value > 0 ? color : undefined} lh={1.3}>
        {formatNumber(value)}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Card>
  )
  return to ? (
    <Anchor
      component={Link}
      to={to}
      underline="never"
      c="inherit"
      aria-label={`${label}: ${value}`}
    >
      {card}
    </Anchor>
  ) : (
    card
  )
}

const GRID = { base: 2, sm: 3, lg: 5 }

export function DashboardPage() {
  const stats = useStats()
  const jobs = useJobs({ page_size: 8 })

  return (
    <>
      <PageHeader
        title="Tổng quan"
        actions={
          <Button component={Link} to="/crawl" leftSection={<IconPlus size={16} />}>
            Crawl truyện
          </Button>
        }
      />

      <QueryState
        query={stats}
        skeleton={
          <SimpleGrid cols={GRID} mb="lg">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} height={96} radius="md" />
            ))}
          </SimpleGrid>
        }
      >
        {(data) => (
          <SimpleGrid cols={GRID} mb="lg">
            <StatCard label="Truyện" value={data.novels} to="/novels" />
            <StatCard
              label="Chương đã tải"
              value={data.chapters.done}
              hint={`${formatNumber(data.chapters.pending)} chờ tải · ${formatNumber(data.chapters.failed)} lỗi`}
            />
            <StatCard
              label="Job đang chạy"
              value={data.jobs.running}
              color="blue"
              to="/jobs?status=running"
              hint="mỗi job crawl một truyện"
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

      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={2} size="h4">
            Job gần đây
          </Title>
          <Button component={Link} to="/jobs" variant="subtle" size="compact-sm">
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
                <Button component={Link} to="/crawl" variant="light">
                  Crawl truyện đầu tiên
                </Button>
              }
            />
          }
        >
          {(data) => <JobsTable jobs={data.items} />}
        </QueryState>
      </Card>
    </>
  )
}
