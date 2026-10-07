import { Anchor, Button, Card, Group, Skeleton, Table, Text, useMatches } from '@mantine/core'
import { IconDownload, IconRefresh } from '@tabler/icons-react'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BASE_URL } from '../../api/client'
import { useAviationRecords, useAviationSummary, useJobs, useSyncAviation } from '../../api/queries'
import type { AviationKind, AviationSource, Job } from '../../api/types'
import type { I18nKey } from '../../i18n'
import { JobsTable } from '../../components/JobsTable'
import { Pager, SearchInput } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { useUrlState } from '../../hooks/useUrlState'
import { recordCounts, formatDateTime } from '../../utils/format'
import { notifyError, notifySuccess } from '../../utils/notify'

const PAGE_SIZE = 50
// Dữ liệu của từng nguồn lấy từ đâu và được dùng thế nào (khoá `aviation.sourceNote.<nguồn>`) hiện ở
// đầu mỗi tab dữ liệu, kèm điều cần biết về phạm vi của loại dữ liệu đó ở nguồn đó — để không ai
// tưởng danh sách là đầy đủ.
const KIND_NOTE: Record<AviationSource, Partial<Record<AviationKind, I18nKey>>> = {
  world: {
    airport: 'aviation.kindNote.world.airport',
    city: 'aviation.kindNote.world.city',
    airline: 'aviation.kindNote.world.airline',
  },
  vna: {
    airport: 'aviation.kindNote.vna.airport',
    airline: 'aviation.kindNote.vna.airline',
  },
}

/**
 * Nút đồng bộ: tạo một job tải lại cả bốn loại dữ liệu của nguồn. Nút quay vòng suốt lúc job của
 * nguồn này còn chạy — kể cả job được tạo từ tab khác — nên không bấm trùng được.
 */
function SyncButton({ source, variant }: { source: AviationSource; variant?: string }) {
  const sync = useSyncAviation(source)
  const running = useAviationSummary(source).data?.last_job?.status === 'running'
  return <SyncJobButton sync={sync} running={running} variant={variant} />
}

interface SyncJobButtonProps {
  /** Mutation tạo job đồng bộ (`useSyncAviation`, `useSyncProvinces`). */
  sync: UseMutationResult<Job, Error, void>
  /** Job đồng bộ gần nhất của danh mục còn đang chạy. */
  running: boolean
  variant?: string
}

/** Nút "Đồng bộ" dùng chung cho mọi crawler kiểu danh mục (hàng không, tỉnh thành). */
export function SyncJobButton({ sync, running, variant }: SyncJobButtonProps) {
  const { t } = useTranslation()
  return (
    <Button
      variant={variant}
      leftSection={<IconRefresh size={16} />}
      loading={sync.isPending || running}
      onClick={() =>
        sync.mutate(undefined, {
          onSuccess: (job) => notifySuccess(t('sync.started', { id: job.id })),
          onError: (error) => notifyError(error, t('sync.createFailed')),
        })
      }
    >
      {t('sync.button')}
    </Button>
  )
}

/** Câu nói về job đồng bộ gần nhất của nguồn, kèm link tới job đó. */
export function LastJobNote({ job }: { job: Job | null | undefined }) {
  const { t } = useTranslation()
  if (!job) return `${t('sync.never')}.`
  const values = { id: job.id, time: formatDateTime(job.finished_at) }
  const components = { job: <Anchor component={Link} to={`/jobs/${job.id}`} inherit /> }
  if (job.status === 'running') {
    return <Trans i18nKey="sync.running" values={values} components={components} />
  }
  if (job.status === 'completed') {
    return <Trans i18nKey="sync.last" values={values} components={components} />
  }
  return (
    <Text span c="red" inherit>
      <Trans i18nKey="sync.lastFailed" values={values} components={components} />
      {job.error ? `: ${job.error}` : '.'}
    </Text>
  )
}

/** Dòng số liệu trên thẻ của một nguồn ở các trang tổng quan. */
export function AviationSummaryLine({ source }: { source: AviationSource }) {
  const { t } = useTranslation()
  const { data, isError } = useAviationSummary(source)

  if (!data) {
    return isError ? (
      <Text size="sm" c="red">
        {t('common.statsError')}
      </Text>
    ) : (
      <Skeleton height={20} width={220} />
    )
  }
  const total = Object.values(data.counts).reduce((sum, count) => sum + count, 0)
  return <Text size="sm">{total > 0 ? recordCounts(data.counts) : t('sync.never')}</Text>
}

interface DataPageProps {
  source: AviationSource
  kind: AviationKind
}

/** Tab dữ liệu của một loại danh mục (sân bay, hãng bay, thành phố, quốc gia) ở một nguồn. */
export function AviationDataPage({ source, kind }: DataPageProps) {
  const { t } = useTranslation()
  const kindName = t(`aviation.kinds.${kind}`)
  const kindNote = KIND_NOTE[source][kind]
  const [filters, setFilters] = useUrlState({ search: '', page: '1' })
  const page = Number(filters.page) || 1
  const records = useAviationRecords(source, {
    kind,
    search: filters.search,
    page,
    page_size: PAGE_SIZE,
  })
  const summary = useAviationSummary(source)
  // Hẹp hơn `md` thì chỉ còn mã và tên; các cột còn lại dồn xuống dưới tên.
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })
  const hasCity = kind === 'airport'
  const hasCountry = kind === 'airport' || kind === 'city'
  const hasPlace = kind !== 'airline'
  const hasVietnamese = hasPlace && source === 'vna' // nguồn thế giới không có tên tiếng Việt
  const longCode = source === 'world' && kind === 'city' // mã tự đặt dạng "VN-ho-chi-minh-city"
  const lastJob = summary.data?.last_job
  const syncing = lastJob?.status === 'running'

  return (
    <>
      <PageHeader
        title={kindName}
        description={
          <>
            {t(`aviation.sourceNote.${source}`)} {kindNote && t(kindNote)}{' '}
            <LastJobNote job={lastJob} />
          </>
        }
        actions={
          <>
            {/* Link tải thẳng: file JSON chứa mọi bản ghi của loại này, không theo ô tìm kiếm. */}
            {(summary.data?.counts[kind] ?? 0) > 0 && (
              <Button
                component="a"
                href={`${BASE_URL}/aviation/${source}/export?kind=${kind}`}
                download
                variant="default"
                leftSection={<IconDownload size={16} />}
              >
                {t('common.exportJson')}
              </Button>
            )}
            <SyncButton source={source} />
          </>
        }
      />
      <Card withBorder>
        <Group mb="md" maw={420}>
          <SearchInput
            value={filters.search}
            onSearch={(search) => setFilters({ search })}
            label={t('aviation.search', { kind: kindName })}
            placeholder={t('common.searchByCodeOrName')}
          />
        </Group>
        <QueryState
          query={records}
          isEmpty={(data) => data.total === 0}
          empty={
            filters.search ? (
              <EmptyState
                title={t('aviation.noMatch', { kind: kindName })}
                description={t('common.tryOtherCodeOrName')}
              />
            ) : syncing ? (
              <EmptyState title={t('sync.firstTitle')} description={t('sync.firstDescription')} />
            ) : (
              <EmptyState
                title={t('common.noData')}
                description={t('aviation.emptyDescription')}
                action={<SyncButton source={source} variant="light" />}
              />
            )
          }
        >
          {(data) => (
            <>
              <Table verticalSpacing="sm" highlightOnHover layout="fixed">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={longCode ? '34%' : 72}>{t('common.code')}</Table.Th>
                    <Table.Th>{t('common.name')}</Table.Th>
                    {wide && hasVietnamese && <Table.Th>{t('aviation.vietnameseName')}</Table.Th>}
                    {wide && hasCity && <Table.Th>{t('aviation.city')}</Table.Th>}
                    {wide && hasCountry && <Table.Th>{t('aviation.country')}</Table.Th>}
                    {wide && hasPlace && (
                      <Table.Th>
                        {source === 'vna' ? t('aviation.region') : t('aviation.continent')}
                      </Table.Th>
                    )}
                    {wide && <Table.Th w={150}>{t('common.updated')}</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.items.map((record) => {
                    // Mã thành phố của nguồn thế giới là mã tự đặt, dài và không có nghĩa với người đọc.
                    const city =
                      record.city_name &&
                      (source === 'vna'
                        ? `${record.city_name} (${record.city_code})`
                        : record.city_name)
                    const country =
                      record.country_name && `${record.country_name} (${record.country_code})`
                    return (
                      <Table.Tr key={record.code}>
                        <Table.Td>
                          <Text
                            size="sm"
                            fw={600}
                            ff="monospace"
                            style={{ overflowWrap: 'anywhere' }}
                          >
                            {record.code}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                            {record.name}
                          </Text>
                          {!wide && hasPlace && (
                            <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                              {[record.name_vi, hasCity && city, hasCountry && country]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          )}
                        </Table.Td>
                        {wide && hasVietnamese && <Table.Td>{record.name_vi ?? '—'}</Table.Td>}
                        {wide && hasCity && <Table.Td>{city ?? '—'}</Table.Td>}
                        {wide && hasCountry && <Table.Td>{country ?? '—'}</Table.Td>}
                        {wide && hasPlace && <Table.Td>{record.region ?? '—'}</Table.Td>}
                        {wide && (
                          <Table.Td>
                            <Text size="sm" c="dimmed">
                              {formatDateTime(record.crawled_at)}
                            </Text>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
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

/** Tab "Lịch sử": các job đồng bộ của một nguồn, mới nhất ở trên. */
export function AviationHistoryPage({ source }: { source: AviationSource }) {
  const { t } = useTranslation()
  return (
    <SyncHistoryPage
      crawler={`aviation:${source}`}
      description={t('aviation.historyDescription')}
      actions={<SyncButton source={source} />}
    />
  )
}

interface SyncHistoryPageProps {
  /** Giá trị `job.crawler` của các job cần liệt kê. */
  crawler: string
  description: string
  actions: ReactNode
}

/** Tab "Lịch sử" dùng chung cho mọi crawler kiểu danh mục: các job đồng bộ của một `crawler`. */
export function SyncHistoryPage({ crawler, description, actions }: SyncHistoryPageProps) {
  const { t } = useTranslation()
  const [filters, setFilters] = useUrlState({ page: '1' })
  const page = Number(filters.page) || 1
  const jobs = useJobs({ crawler, page, page_size: 20 })

  return (
    <>
      <PageHeader title={t('common.history')} description={description} actions={actions} />
      <Card withBorder>
        <QueryState
          query={jobs}
          isEmpty={(data) => data.total === 0}
          empty={
            <EmptyState title={t('sync.never')} description={t('sync.historyEmptyDescription')} />
          }
        >
          {(data) => (
            <>
              <JobsTable jobs={data.items} />
              <Pager
                total={data.total}
                page={page}
                pageSize={20}
                onChange={(next) => setFilters({ page: String(next) })}
              />
            </>
          )}
        </QueryState>
      </Card>
    </>
  )
}
