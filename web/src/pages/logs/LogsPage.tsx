import {
  Card,
  Group,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Switch,
  Text,
} from '@mantine/core'
import { useState } from 'react'

import { useLogs } from '../../api/queries'
import type { LogKind, LogLevel } from '../../api/types'
import { SearchInput } from '../../components/ListControls'
import { LogList } from '../../components/LogList'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { useUrlState } from '../../hooks/useUrlState'

const LIMIT = 300
const LEVELS = [
  { value: '', label: 'Tất cả' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARNING', label: 'WARNING' },
  { value: 'ERROR', label: 'ERROR' },
]
const KINDS = [
  { value: '', label: 'Mọi loại dòng' },
  { value: 'request', label: 'Lỗi request (mạng, HTTP, bị chặn)' },
  { value: 'parse', label: 'Lỗi parser (HTML đổi cấu trúc)' },
  { value: 'other', label: 'Lỗi khác' },
]

export function LogsPage() {
  const [filters, setFilters] = useUrlState({ level: '', kind: '', job: '', search: '' })
  const [live, setLive] = useState(false)
  const logs = useLogs(
    {
      level: filters.level as LogLevel | '',
      kind: filters.kind as LogKind | '',
      job_id: Number(filters.job) || undefined,
      search: filters.search,
      limit: LIMIT,
    },
    live,
  )
  const filtering = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Log"
        description="Nhật ký của crawler, mới nhất ở trên. Đặt mức log DEBUG ở trang Cài đặt để thấy từng request."
      />
      <Card withBorder>
        {/* Màn hẹp: ô tìm một hàng, ô job và loại lỗi chia nhau một hàng, mức log trải hết bề ngang. */}
        <Group mb="md" align="center">
          <SearchInput
            value={filters.search}
            onSearch={(search) => setFilters({ search })}
            label="Tìm trong log"
            placeholder="URL, chương, thông báo…"
          />
          <NumberInput
            aria-label="Lọc theo job"
            placeholder="Job #"
            flex={{ base: '1 1 90px', md: '0 0 110px' }}
            min={1}
            allowDecimal={false}
            value={filters.job === '' ? '' : Number(filters.job)}
            onChange={(job) => setFilters({ job: typeof job === 'number' ? String(job) : '' })}
          />
          <NativeSelect
            aria-label="Loại lỗi"
            data={KINDS}
            flex={{ base: '3 1 180px', md: '0 0 auto' }}
            value={filters.kind}
            onChange={(event) => setFilters({ kind: event.currentTarget.value })}
          />
          <SegmentedControl
            aria-label="Mức log"
            data={LEVELS}
            w={{ base: '100%', md: 'auto' }}
            value={filters.level}
            onChange={(level) => setFilters({ level })}
          />
          <Switch
            label="Tự làm mới"
            checked={live}
            onChange={(event) => setLive(event.currentTarget.checked)}
          />
        </Group>

        <QueryState
          query={logs}
          isEmpty={(entries) => entries.length === 0}
          empty={
            filtering ? (
              <EmptyState title="Không có dòng log nào khớp bộ lọc" />
            ) : (
              <EmptyState title="Chưa có log" description="Log xuất hiện sau lần crawl đầu tiên." />
            )
          }
        >
          {(entries) => (
            <>
              <LogList entries={entries} />
              <Text size="xs" c="dimmed" mt="sm">
                {entries.length === LIMIT
                  ? `Đang hiện ${LIMIT} dòng mới nhất khớp bộ lọc — thu hẹp bộ lọc để xem các dòng cũ hơn.`
                  : `${entries.length} dòng`}
              </Text>
            </>
          )}
        </QueryState>
      </Card>
    </>
  )
}
