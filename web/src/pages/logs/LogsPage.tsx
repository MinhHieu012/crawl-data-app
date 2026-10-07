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
import { useTranslation } from 'react-i18next'

import { useLogs } from '../../api/queries'
import type { LogKind, LogLevel } from '../../api/types'
import { SearchInput } from '../../components/ListControls'
import { LogList } from '../../components/LogList'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { useUrlState } from '../../hooks/useUrlState'

const LIMIT = 300
const LEVELS = ['INFO', 'WARNING', 'ERROR']
const KINDS = ['request', 'parse', 'other'] as const

export function LogsPage() {
  const { t } = useTranslation()
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
      <PageHeader title={t('logs.title')} description={t('logs.description')} />
      <Card withBorder>
        {/* Màn hẹp: ô tìm một hàng, ô job và loại lỗi chia nhau một hàng, mức log trải hết bề ngang. */}
        <Group mb="md" align="center">
          <SearchInput
            value={filters.search}
            onSearch={(search) => setFilters({ search })}
            label={t('logs.search')}
            placeholder={t('logs.searchPlaceholder')}
          />
          <NumberInput
            aria-label={t('logs.filterJob')}
            placeholder="Job #"
            flex={{ base: '1 1 90px', md: '0 0 110px' }}
            min={1}
            allowDecimal={false}
            value={filters.job === '' ? '' : Number(filters.job)}
            onChange={(job) => setFilters({ job: typeof job === 'number' ? String(job) : '' })}
          />
          <NativeSelect
            aria-label={t('logs.kindLabel')}
            data={[
              { value: '', label: t('logs.kinds.all') },
              ...KINDS.map((kind) => ({ value: kind, label: t(`logs.kinds.${kind}`) })),
            ]}
            flex={{ base: '3 1 180px', md: '0 0 auto' }}
            value={filters.kind}
            onChange={(event) => setFilters({ kind: event.currentTarget.value })}
          />
          <SegmentedControl
            aria-label={t('logs.level')}
            data={[{ value: '', label: t('common.all') }, ...LEVELS]}
            w={{ base: '100%', md: 'auto' }}
            value={filters.level}
            onChange={(level) => setFilters({ level })}
          />
          <Switch
            label={t('logs.autoRefresh')}
            checked={live}
            onChange={(event) => setLive(event.currentTarget.checked)}
          />
        </Group>

        <QueryState
          query={logs}
          isEmpty={(entries) => entries.length === 0}
          empty={
            filtering ? (
              <EmptyState title={t('logs.noMatch')} />
            ) : (
              <EmptyState title={t('logs.empty.title')} description={t('logs.empty.description')} />
            )
          }
        >
          {(entries) => (
            <>
              <LogList entries={entries} />
              <Text size="xs" c="dimmed" mt="sm">
                {entries.length === LIMIT
                  ? t('logs.limited', { limit: LIMIT })
                  : t('logs.count', { count: entries.length })}
              </Text>
            </>
          )}
        </QueryState>
      </Card>
    </>
  )
}
