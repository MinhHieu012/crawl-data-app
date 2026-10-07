import {
  Anchor,
  Card,
  Group,
  NativeSelect,
  Stack,
  Table,
  Tabs,
  Text,
  useMatches,
} from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useAdminFeedbackList } from '../../api/queries'
import type { AdminFeedback, FeedbackStatus, FeedbackType } from '../../api/types'
import { Pager, SearchInput } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import {
  FEEDBACK_STATUS,
  FEEDBACK_TYPE,
  FeedbackStatusBadge,
  FeedbackTypeBadge,
  statusOptions,
} from '../../components/StatusBadge'
import { useAdminToken } from '../../hooks/useAdminToken'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime } from '../../utils/format'
import { adminFeedbackPath } from '../feedback/paths'
import { AdminGate, LogoutButton } from './AdminGate'

const PAGE_SIZE = 20
const FILTER_FLEX = { base: '1 1 150px', sm: '0 0 220px' }

/** Hẹp hơn `md`: loại, người gửi, trạng thái và ngày gửi dồn xuống dưới tiêu đề, không cuộn ngang. */
function FeedbackTable({ items }: { items: AdminFeedback[] }) {
  const { t } = useTranslation()
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })
  const reporter = (item: AdminFeedback) => item.contact ?? item.reporter ?? t('admin.anonymous')

  return (
    <Table verticalSpacing="sm" highlightOnHover layout="fixed">
      <Table.Thead>
        <Table.Tr>
          {wide && <Table.Th w={150}>{t('admin.columns.type')}</Table.Th>}
          <Table.Th>{t('admin.columns.title')}</Table.Th>
          {wide && (
            <>
              <Table.Th w={180}>{t('admin.columns.reporter')}</Table.Th>
              <Table.Th w={130}>{t('common.status')}</Table.Th>
              <Table.Th w={140}>{t('admin.columns.created')}</Table.Th>
            </>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((item) => (
          <Table.Tr key={item.id}>
            {wide && (
              <Table.Td>
                <FeedbackTypeBadge type={item.type} />
              </Table.Td>
            )}
            <Table.Td>
              <Anchor
                component={Link}
                to={adminFeedbackPath(item.id)}
                size="sm"
                fw={600}
                lineClamp={2}
                style={{ overflowWrap: 'anywhere' }}
              >
                #{item.id} · {item.title}
              </Anchor>
              {!wide && (
                <Stack gap={6} mt={6}>
                  <Group gap="xs">
                    <FeedbackTypeBadge type={item.type} />
                    <FeedbackStatusBadge status={item.status} />
                  </Group>
                  <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                    {reporter(item)} · {formatDateTime(item.created_at)}
                  </Text>
                </Stack>
              )}
            </Table.Td>
            {wide && (
              <>
                <Table.Td>
                  <Text size="sm" truncate="end" title={reporter(item)}>
                    {reporter(item)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <FeedbackStatusBadge status={item.status} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatDateTime(item.created_at)}
                  </Text>
                </Table.Td>
              </>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function FeedbackList() {
  const { t } = useTranslation()
  const [filters, setFilters] = useUrlState({ type: '', status: '', search: '', page: '1' })
  const page = Number(filters.page) || 1
  const list = useAdminFeedbackList({
    type: filters.type as FeedbackType | '',
    status: filters.status as FeedbackStatus | '',
    search: filters.search,
    page,
    page_size: PAGE_SIZE,
  })
  const filtering = Boolean(filters.type || filters.status || filters.search)

  return (
    <Card withBorder>
      <Tabs
        value={filters.type || 'all'}
        onChange={(type) => setFilters({ type: type === 'all' ? '' : (type ?? '') })}
        mb="md"
      >
        <Tabs.List aria-label={t('admin.tabsLabel')}>
          <Tabs.Tab value="all">{t('common.all')}</Tabs.Tab>
          {Object.entries(FEEDBACK_TYPE).map(([value, look]) => (
            <Tabs.Tab key={value} value={value}>
              {look.label ? t(look.label) : value}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Group mb="md">
        <SearchInput
          value={filters.search}
          onSearch={(search) => setFilters({ search })}
          label={t('admin.search')}
          placeholder={t('admin.searchPlaceholder')}
        />
        <NativeSelect
          aria-label={t('admin.filterStatus')}
          data={statusOptions(FEEDBACK_STATUS, t('admin.allStatuses'))}
          value={filters.status}
          onChange={(event) => setFilters({ status: event.currentTarget.value })}
          flex={FILTER_FLEX}
        />
      </Group>
      <QueryState
        query={list}
        isEmpty={(data) => data.total === 0}
        empty={
          filtering ? (
            <EmptyState
              title={t('admin.noMatch.title')}
              description={t('admin.noMatch.description')}
            />
          ) : (
            <EmptyState title={t('admin.empty.title')} description={t('admin.empty.description')} />
          )
        }
      >
        {(data) => (
          <>
            <FeedbackTable items={data.items} />
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
  )
}

/** Quản lý góp ý (chỉ quản trị viên): mọi góp ý, lọc theo loại/trạng thái, tìm kiếm. */
export function AdminFeedbackPage() {
  const { t } = useTranslation()
  const token = useAdminToken()
  return (
    <>
      <PageHeader
        title={t('admin.title')}
        description={t('admin.description')}
        actions={token && <LogoutButton />}
      />
      <AdminGate>
        <FeedbackList />
      </AdminGate>
    </>
  )
}
