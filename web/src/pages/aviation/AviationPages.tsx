import { Badge, Button, Card, Group, Skeleton, Table, Text, useMatches } from '@mantine/core'
import { IconDownload, IconRefresh } from '@tabler/icons-react'

import { BASE_URL } from '../../api/client'
import {
  useAviationRecords,
  useAviationSummary,
  useAviationSyncs,
  useSyncAviation,
} from '../../api/queries'
import type { AviationKind, AviationSource, AviationSync } from '../../api/types'
import { Pager, SearchInput } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { JobStatusBadge } from '../../components/StatusBadge'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime, formatDuration, formatNumber } from '../../utils/format'
import { notifyError, notifySuccess } from '../../utils/notify'

const PAGE_SIZE = 50
const KINDS: AviationKind[] = ['airport', 'city', 'country', 'airline']
const LABEL: Record<AviationKind, string> = {
  airport: 'sân bay',
  airline: 'hãng bay',
  city: 'thành phố',
  country: 'quốc gia',
}

/** Dữ liệu của từng nguồn lấy từ đâu và được dùng thế nào — hiện ở đầu mỗi tab dữ liệu. */
const SOURCE_NOTE: Record<AviationSource, string> = {
  world:
    'Dữ liệu mở: sân bay và quốc gia từ OurAirports (phạm vi công cộng), hãng bay từ OpenFlights (giấy phép ODbL, dùng lại phải ghi nguồn).',
  vna: 'Lấy từ vietnamairlines.com, chỉ dùng cho mục đích cá nhân, phi thương mại.',
}

/** Điều cần biết về phạm vi của một loại dữ liệu ở một nguồn, để không ai tưởng danh sách là đầy đủ. */
const KIND_NOTE: Record<AviationSource, Partial<Record<AviationKind, string>>> = {
  world: {
    airport: 'Chỉ gồm sân bay còn hoạt động có mã IATA.',
    city: 'Thành phố suy ra từ sân bay; mã do ứng dụng tự đặt vì dữ liệu mở không có mã thành phố.',
    airline:
      'Chỉ gồm hãng đang hoạt động có mã IATA; OpenFlights ít được cập nhật nên có thể thiếu hãng mới.',
  },
  vna: {
    airport: 'Chỉ gồm sân bay trong mạng bay của Vietnam Airlines và đối tác.',
    airline: 'Chỉ gồm hãng có chương trình khách hàng thường xuyên liên kết với Vietnam Airlines.',
  },
}

/** "469 sân bay · 464 thành phố · …" — chỉ kể những loại có trong `counts`. */
function countsText(counts: AviationSync['counts']): string {
  return KINDS.filter((kind) => counts[kind] !== undefined)
    .map((kind) => `${formatNumber(counts[kind] ?? 0)} ${LABEL[kind]}`)
    .join(' · ')
}

/** Nút đồng bộ: một lần chạy tải lại cả bốn loại dữ liệu của nguồn. */
function SyncButton({ source, variant }: { source: AviationSource; variant?: string }) {
  const sync = useSyncAviation(source)
  return (
    <Button
      variant={variant}
      leftSection={<IconRefresh size={16} />}
      loading={sync.isPending}
      onClick={() =>
        sync.mutate(undefined, {
          onSuccess: (result) =>
            result.status === 'completed'
              ? notifySuccess(`Đã đồng bộ: ${countsText(result.counts)}`)
              : notifyError(new Error(result.error ?? 'Không rõ lý do'), 'Đồng bộ thất bại'),
          onError: (error) => notifyError(error, 'Đồng bộ thất bại'),
        })
      }
    >
      Đồng bộ
    </Button>
  )
}

/** Dòng số liệu trên thẻ của một nguồn ở các trang tổng quan. */
export function AviationSummaryLine({ source }: { source: AviationSource }) {
  const { data, isError } = useAviationSummary(source)

  if (!data) {
    return isError ? (
      <Text size="sm" c="red">
        Không tải được số liệu
      </Text>
    ) : (
      <Skeleton height={20} width={220} />
    )
  }
  const total = Object.values(data.counts).reduce((sum, count) => sum + count, 0)
  return <Text size="sm">{total > 0 ? countsText(data.counts) : 'Chưa đồng bộ lần nào'}</Text>
}

interface DataPageProps {
  source: AviationSource
  kind: AviationKind
}

/** Tab dữ liệu của một loại danh mục (sân bay, hãng bay, thành phố, quốc gia) ở một nguồn. */
export function AviationDataPage({ source, kind }: DataPageProps) {
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
  const lastSync = summary.data?.last_sync

  return (
    <>
      <PageHeader
        title={LABEL[kind]}
        description={
          <>
            {SOURCE_NOTE[source]} {KIND_NOTE[source][kind]}{' '}
            {lastSync
              ? `Đồng bộ gần nhất: ${formatDateTime(lastSync.finished_at)}.`
              : 'Chưa đồng bộ lần nào.'}
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
                Xuất JSON
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
            label={`Tìm ${LABEL[kind]}`}
            placeholder="Mã hoặc tên, gõ không dấu cũng được"
          />
        </Group>
        <QueryState
          query={records}
          isEmpty={(data) => data.total === 0}
          empty={
            filters.search ? (
              <EmptyState
                title={`Không có ${LABEL[kind]} nào khớp`}
                description="Thử mã hoặc tên khác."
              />
            ) : (
              <EmptyState
                title="Chưa có dữ liệu"
                description="Bấm Đồng bộ để tải danh mục của nguồn này (ba request, cập nhật cả bốn loại dữ liệu)."
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
                    <Table.Th w={longCode ? '34%' : 72}>Mã</Table.Th>
                    <Table.Th>Tên</Table.Th>
                    {wide && hasVietnamese && <Table.Th>Tên tiếng Việt</Table.Th>}
                    {wide && hasCity && <Table.Th>Thành phố</Table.Th>}
                    {wide && hasCountry && <Table.Th>Quốc gia</Table.Th>}
                    {wide && hasPlace && (
                      <Table.Th>{source === 'vna' ? 'Vùng' : 'Châu lục'}</Table.Th>
                    )}
                    {wide && <Table.Th w={150}>Cập nhật</Table.Th>}
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

/** Tab "Lịch sử": các lần đồng bộ của một nguồn, mới nhất ở trên. */
export function AviationHistoryPage({ source }: { source: AviationSource }) {
  const [filters, setFilters] = useUrlState({ page: '1' })
  const page = Number(filters.page) || 1
  const syncs = useAviationSyncs(source, { page, page_size: 20 })

  return (
    <>
      <PageHeader
        title="Lịch sử"
        description="Mỗi lần đồng bộ tải lại cả bốn loại dữ liệu của nguồn này. Lần thất bại không làm mất dữ liệu đã có."
        actions={<SyncButton source={source} />}
      />
      <Card withBorder>
        <QueryState
          query={syncs}
          isEmpty={(data) => data.total === 0}
          empty={
            <EmptyState
              title="Chưa đồng bộ lần nào"
              description="Lịch sử xuất hiện sau lần đồng bộ đầu tiên."
            />
          }
        >
          {(data) => (
            <>
              <Table verticalSpacing="sm" layout="fixed">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={56}>Lần</Table.Th>
                    <Table.Th w={120}>Trạng thái</Table.Th>
                    <Table.Th>Kết quả</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.items.map((sync) => (
                    <Table.Tr key={sync.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          #{sync.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {sync.status === 'completed' ? (
                          <JobStatusBadge status="completed" />
                        ) : (
                          <Badge color="red" variant="light">
                            Thất bại
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text
                          size="sm"
                          c={sync.error ? 'red' : undefined}
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {sync.error ?? countsText(sync.counts)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDateTime(sync.started_at)} ·{' '}
                          {formatDuration(sync.started_at, sync.finished_at)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
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
