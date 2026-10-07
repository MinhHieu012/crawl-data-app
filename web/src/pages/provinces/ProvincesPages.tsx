import {
  Anchor,
  Button,
  Card,
  Group,
  NativeSelect,
  Skeleton,
  Table,
  Text,
  useMatches,
} from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BASE_URL } from '../../api/client'
import { useProvinces, useProvinceSummary, useSyncProvinces, useWards } from '../../api/queries'
import { Pager, SearchInput } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { categoryPath } from '../../crawlers/paths'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime, formatNumber, recordCounts } from '../../utils/format'
import { LastJobNote, SyncHistoryPage, SyncJobButton } from '../aviation/AviationPages'

const WARDS_PAGE_SIZE = 50
/** Tab "Phường/xã", lọc sẵn theo một tỉnh thành. */
const wardsPath = (provinceCode: string) =>
  `${categoryPath('provinces', 'vietnam')}/wards?province=${provinceCode}`

/** Nút đồng bộ: quay vòng suốt lúc job đồng bộ còn chạy — kể cả job tạo từ tab khác. */
function SyncButton({ variant }: { variant?: string }) {
  const sync = useSyncProvinces()
  const running = useProvinceSummary().data?.last_job?.status === 'running'
  return <SyncJobButton sync={sync} running={running} variant={variant} />
}

/** Dòng số liệu trên thẻ của crawler ở các trang tổng quan. */
export function ProvinceSummaryLine() {
  const { t } = useTranslation()
  const { data, isError } = useProvinceSummary()

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
    <Text size="sm">
      {data.count > 0
        ? recordCounts({ province: data.count, ward: data.ward_count })
        : t('sync.never')}
    </Text>
  )
}

/** Tab dữ liệu: bảng 34 tỉnh, thành phố. Cả danh mục nằm trên một trang nên không có phân trang. */
export function ProvincesPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useUrlState({ search: '' })
  const provinces = useProvinces(filters.search)
  const summary = useProvinceSummary()
  // Hẹp hơn `md` thì chỉ còn mã và tên; các cột còn lại dồn xuống dưới tên.
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })
  const lastJob = summary.data?.last_job

  return (
    <>
      <PageHeader
        title={t('registry.tabs.provinces')}
        description={
          <>
            {t('provinces.sourceNote')} <LastJobNote job={lastJob} />
          </>
        }
        actions={
          <>
            {/* Link tải thẳng: file JSON chứa mọi tỉnh thành, không theo ô tìm kiếm. */}
            {(summary.data?.count ?? 0) > 0 && (
              <Button
                component="a"
                href={`${BASE_URL}/provinces/export`}
                download
                variant="default"
                leftSection={<IconDownload size={16} />}
              >
                {t('common.exportJson')}
              </Button>
            )}
            {/* Một file cho cả hai cấp: mỗi tỉnh thành kèm mảng phường/xã trực thuộc. */}
            {(summary.data?.ward_count ?? 0) > 0 && (
              <Button
                component="a"
                href={`${BASE_URL}/provinces/export?with_wards=true`}
                download
                variant="default"
                leftSection={<IconDownload size={16} />}
              >
                {t('provinces.exportWithWards')}
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
            label={t('provinces.search')}
            placeholder={t('common.searchByCodeOrName')}
          />
        </Group>
        <QueryState
          query={provinces}
          isEmpty={(data) => data.total === 0}
          empty={
            filters.search ? (
              <EmptyState
                title={t('provinces.noMatch')}
                description={t('common.tryOtherCodeOrName')}
              />
            ) : lastJob?.status === 'running' ? (
              <EmptyState title={t('sync.firstTitle')} description={t('sync.firstDescription')} />
            ) : (
              <EmptyState
                title={t('common.noData')}
                description={t('provinces.emptyDescription')}
                action={<SyncButton variant="light" />}
              />
            )
          }
        >
          {(data) => (
            <Table verticalSpacing="sm" highlightOnHover layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={72}>{t('common.code')}</Table.Th>
                  <Table.Th>{t('common.name')}</Table.Th>
                  {wide && <Table.Th>{t('common.englishName')}</Table.Th>}
                  {wide && <Table.Th w={110}>{t('registry.tabs.wards')}</Table.Th>}
                  {wide && <Table.Th>{t('provinces.postalPrefix')}</Table.Th>}
                  {wide && <Table.Th w={150}>{t('common.updated')}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((province) => (
                  <Table.Tr key={province.code}>
                    <Table.Td>
                      <Text size="sm" fw={600} ff="monospace">
                        {province.code}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                        {province.full_name}
                      </Text>
                      {!wide && (
                        <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                          {province.full_name_en} · {recordCounts({ ward: province.ward_count })}
                        </Text>
                      )}
                    </Table.Td>
                    {wide && <Table.Td>{province.full_name_en}</Table.Td>}
                    {wide && (
                      <Table.Td>
                        <Anchor component={Link} to={wardsPath(province.code)} size="sm">
                          {formatNumber(province.ward_count)}
                        </Anchor>
                      </Table.Td>
                    )}
                    {wide && <Table.Td>{province.postal_code_prefix ?? '—'}</Table.Td>}
                    {wide && (
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatDateTime(province.crawled_at)}
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

/** Tab "Phường/xã": phường, xã, đặc khu của cả nước hoặc của một tỉnh thành. */
export function WardsPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useUrlState({ search: '', province: '', page: '1' })
  const page = Number(filters.page) || 1
  const wards = useWards({
    province_code: filters.province,
    search: filters.search,
    page,
    page_size: WARDS_PAGE_SIZE,
  })
  const provinces = useProvinces('')
  const summary = useProvinceSummary()
  // Hẹp hơn `md` thì chỉ còn mã và tên; các cột còn lại dồn xuống dưới tên.
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })
  const lastJob = summary.data?.last_job
  const provinceOptions = [
    { value: '', label: t('wards.allProvinces') },
    ...(provinces.data?.items ?? []).map((item) => ({ value: item.code, label: item.full_name })),
  ]
  const exportQuery = filters.province ? `?province_code=${filters.province}` : ''

  return (
    <>
      <PageHeader
        title={t('registry.tabs.wards')}
        description={
          <>
            {t('wards.description')} {t('provinces.sourceNote')} <LastJobNote job={lastJob} />
          </>
        }
        actions={
          <>
            {/* Link tải thẳng: theo tỉnh thành đang chọn, không theo ô tìm kiếm. */}
            {(summary.data?.ward_count ?? 0) > 0 && (
              <Button
                component="a"
                href={`${BASE_URL}/provinces/wards/export${exportQuery}`}
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
        <Group mb="md" align="flex-end">
          <SearchInput
            value={filters.search}
            onSearch={(search) => setFilters({ search })}
            label={t('wards.search')}
            placeholder={t('common.searchByCodeOrName')}
          />
          <NativeSelect
            aria-label={t('wards.filterProvince')}
            data={provinceOptions}
            value={filters.province}
            onChange={(event) => setFilters({ province: event.currentTarget.value })}
          />
        </Group>
        <QueryState
          query={wards}
          isEmpty={(data) => data.total === 0}
          empty={
            filters.search || filters.province ? (
              <EmptyState
                title={t('wards.noMatch.title')}
                description={t('wards.noMatch.description')}
              />
            ) : lastJob?.status === 'running' ? (
              <EmptyState title={t('sync.firstTitle')} description={t('sync.firstDescription')} />
            ) : (
              <EmptyState
                title={t('common.noData')}
                description={t('provinces.emptyDescription')}
                action={<SyncButton variant="light" />}
              />
            )
          }
        >
          {(data) => (
            <>
              <Table verticalSpacing="sm" highlightOnHover layout="fixed">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={84}>{t('common.code')}</Table.Th>
                    <Table.Th>{t('common.name')}</Table.Th>
                    {wide && <Table.Th>{t('common.englishName')}</Table.Th>}
                    {wide && <Table.Th>{t('wards.province')}</Table.Th>}
                    {wide && <Table.Th w={120}>{t('wards.postalCode')}</Table.Th>}
                    {wide && <Table.Th w={150}>{t('common.updated')}</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.items.map((ward) => (
                    <Table.Tr key={ward.code}>
                      <Table.Td>
                        <Text size="sm" fw={600} ff="monospace">
                          {ward.code}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                          {ward.full_name}
                        </Text>
                        {!wide && (
                          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                            {[ward.province_name, ward.postal_code].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </Table.Td>
                      {wide && <Table.Td>{ward.full_name_en}</Table.Td>}
                      {wide && <Table.Td>{ward.province_name ?? ward.province_code}</Table.Td>}
                      {wide && <Table.Td>{ward.postal_code ?? '—'}</Table.Td>}
                      {wide && (
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {formatDateTime(ward.crawled_at)}
                          </Text>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Pager
                total={data.total}
                page={page}
                pageSize={WARDS_PAGE_SIZE}
                onChange={(next) => setFilters({ page: String(next) })}
              />
            </>
          )}
        </QueryState>
      </Card>
    </>
  )
}

/** Tab "Lịch sử": các job đồng bộ danh mục tỉnh thành, mới nhất ở trên. */
export function ProvinceHistoryPage() {
  const { t } = useTranslation()
  return (
    <SyncHistoryPage
      crawler="provinces"
      description={t('provinces.historyDescription')}
      actions={<SyncButton />}
    />
  )
}
