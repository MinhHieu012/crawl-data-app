import { Button, Card, Group, Skeleton, Table, Text, useMatches } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { BASE_URL } from '../../api/client'
import { useBanks, useBankSummary, useSyncBanks } from '../../api/queries'
import { SearchInput } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime, recordCounts } from '../../utils/format'
import { LastJobNote, SyncHistoryPage, SyncJobButton } from '../aviation/AviationPages'

/** Nút đồng bộ: quay vòng suốt lúc job đồng bộ còn chạy — kể cả job tạo từ tab khác. */
function SyncButton({ variant }: { variant?: string }) {
  const sync = useSyncBanks()
  const running = useBankSummary().data?.last_job?.status === 'running'
  return <SyncJobButton sync={sync} running={running} variant={variant} />
}

/** Dòng số liệu trên thẻ của crawler ở các trang tổng quan. */
export function BankSummaryLine() {
  const { t } = useTranslation()
  const { data, isError } = useBankSummary()

  if (!data) {
    return isError ? (
      <Text size="sm" c="red">
        {t('common.statsError')}
      </Text>
    ) : (
      <Skeleton height={20} width={220} />
    )
  }
  return (
    <Text size="sm">{data.count > 0 ? recordCounts({ bank: data.count }) : t('sync.never')}</Text>
  )
}

/** Tab dữ liệu: bảng ngân hàng. Cả danh mục nằm trên một trang nên không có phân trang. */
export function BanksPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useUrlState({ search: '' })
  const banks = useBanks(filters.search)
  const summary = useBankSummary()
  // Hẹp hơn `md` thì chỉ còn mã BIN và tên; các cột còn lại dồn xuống dưới tên.
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })
  const lastJob = summary.data?.last_job

  return (
    <>
      <PageHeader
        title={t('registry.tabs.banks')}
        description={
          <>
            {t('banks.sourceNote')} <LastJobNote job={lastJob} />
          </>
        }
        actions={
          <>
            {/* Link tải thẳng: file JSON chứa mọi ngân hàng, không theo ô tìm kiếm. */}
            {(summary.data?.count ?? 0) > 0 && (
              <Button
                component="a"
                href={`${BASE_URL}/banks/export`}
                download
                variant="default"
                leftSection={<IconDownload size={16} />}
              >
                {t('common.exportJson')}
              </Button>
            )}
            <SyncButton />
          </>
        }
      />
      <Card withBorder>
        <Group mb="md" maw={420}>
          <SearchInput
            value={filters.search}
            onSearch={(search) => setFilters({ search })}
            label={t('banks.search')}
            placeholder={t('common.searchByCodeOrName')}
          />
        </Group>
        <QueryState
          query={banks}
          isEmpty={(data) => data.total === 0}
          empty={
            filters.search ? (
              <EmptyState title={t('banks.noMatch')} description={t('common.tryOtherCodeOrName')} />
            ) : lastJob?.status === 'running' ? (
              <EmptyState title={t('sync.firstTitle')} description={t('sync.firstDescription')} />
            ) : (
              <EmptyState
                title={t('common.noData')}
                description={t('banks.emptyDescription')}
                action={<SyncButton variant="light" />}
              />
            )
          }
        >
          {(data) => (
            <Table verticalSpacing="sm" highlightOnHover layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={90}>{t('banks.bin')}</Table.Th>
                  <Table.Th>{t('common.name')}</Table.Th>
                  {wide && <Table.Th w={130}>{t('banks.code')}</Table.Th>}
                  {wide && <Table.Th w={130}>{t('banks.swift')}</Table.Th>}
                  {wide && <Table.Th w={150}>{t('common.updated')}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((bank) => (
                  <Table.Tr key={bank.bin}>
                    <Table.Td>
                      <Text size="sm" fw={600} ff="monospace">
                        {bank.bin}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>
                        {bank.short_name}
                      </Text>
                      <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                        {wide
                          ? bank.name
                          : [bank.name, bank.code, bank.swift_code].filter(Boolean).join(' · ')}
                      </Text>
                    </Table.Td>
                    {wide && <Table.Td>{bank.code}</Table.Td>}
                    {wide && <Table.Td>{bank.swift_code ?? '—'}</Table.Td>}
                    {wide && (
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatDateTime(bank.crawled_at)}
                        </Text>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </QueryState>
      </Card>
    </>
  )
}

/** Tab "Lịch sử": các job đồng bộ danh mục ngân hàng, mới nhất ở trên. */
export function BankHistoryPage() {
  const { t } = useTranslation()
  return (
    <SyncHistoryPage
      crawler="banks"
      description={t('banks.historyDescription')}
      actions={<SyncButton />}
    />
  )
}
