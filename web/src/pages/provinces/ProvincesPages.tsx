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
const SOURCE_NOTE =
  'Lấy từ bộ dữ liệu mở vietnamese-provinces-database (giấy phép MIT), theo địa giới sau sáp nhập năm 2025.'

/** Nút đồng bộ: quay vòng suốt lúc job đồng bộ còn chạy — kể cả job tạo từ tab khác. */
function SyncButton({ variant }: { variant?: string }) {
  const sync = useSyncProvinces()
  const running = useProvinceSummary().data?.last_job?.status === 'running'
  return <SyncJobButton sync={sync} running={running} variant={variant} />
}

/** Dòng số liệu trên thẻ của crawler ở các trang tổng quan. */
export function ProvinceSummaryLine() {
  const { data, isError } = useProvinceSummary()

  if (!data) {
    return isError ? (
      <Text size="sm" c="red">
        Không tải được số liệu
      </Text>
    ) : (
      <Skeleton height={20} width={220} />
    )
  }
  return (
    <Text size="sm">
      {data.count > 0
        ? recordCounts({ province: data.count, ward: data.ward_count })
        : 'Chưa đồng bộ lần nào'}
    </Text>
  )
}

/** Tab dữ liệu: bảng 34 tỉnh, thành phố. Cả danh mục nằm trên một trang nên không có phân trang. */
export function ProvincesPage() {
  const [filters, setFilters] = useUrlState({ search: '' })
  const provinces = useProvinces(filters.search)
  const summary = useProvinceSummary()
  // Hẹp hơn `md` thì chỉ còn mã và tên; các cột còn lại dồn xuống dưới tên.
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })
  const lastJob = summary.data?.last_job

  return (
    <>
      <PageHeader
        title="Tỉnh thành"
        description={
          <>
            {SOURCE_NOTE} <LastJobNote job={lastJob} />
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
                Xuất JSON
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
            label="Tìm tỉnh thành"
            placeholder="Mã hoặc tên, gõ không dấu cũng được"
          />
        </Group>
        <QueryState
          query={provinces}
          isEmpty={(data) => data.total === 0}
          empty={
            filters.search ? (
              <EmptyState
                title="Không có tỉnh thành nào khớp"
                description="Thử mã hoặc tên khác."
              />
            ) : lastJob?.status === 'running' ? (
              <EmptyState
                title="Đang đồng bộ lần đầu"
                description="Dữ liệu sẽ hiện ở đây khi job chạy xong."
              />
            ) : (
              <EmptyState
                title="Chưa có dữ liệu"
                description="Bấm Đồng bộ để tải danh mục tỉnh thành kèm phường/xã (một request)."
                action={<SyncButton variant="light" />}
              />
            )
          }
        >
          {(data) => (
            <Table verticalSpacing="sm" highlightOnHover layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={72}>Mã</Table.Th>
                  <Table.Th>Tên</Table.Th>
                  {wide && <Table.Th>Tên tiếng Anh</Table.Th>}
                  {wide && <Table.Th w={110}>Phường/xã</Table.Th>}
                  {wide && <Table.Th>Đầu mã bưu chính</Table.Th>}
                  {wide && <Table.Th w={150}>Cập nhật</Table.Th>}
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
                          {province.full_name_en} · {formatNumber(province.ward_count)} phường/xã
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
    { value: '', label: 'Cả nước' },
    ...(provinces.data?.items ?? []).map((item) => ({ value: item.code, label: item.full_name })),
  ]
  const exportQuery = filters.province ? `?province_code=${filters.province}` : ''

  return (
    <>
      <PageHeader
        title="Phường/xã"
        description={
          <>
            Phường, xã và đặc khu — cấp ngay dưới tỉnh thành. {SOURCE_NOTE}{' '}
            <LastJobNote job={lastJob} />
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
                Xuất JSON
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
            label="Tìm phường/xã"
            placeholder="Mã hoặc tên, gõ không dấu cũng được"
          />
          <NativeSelect
            aria-label="Lọc theo tỉnh thành"
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
                title="Không có phường/xã nào khớp"
                description="Thử mã, tên hoặc tỉnh thành khác."
              />
            ) : lastJob?.status === 'running' ? (
              <EmptyState
                title="Đang đồng bộ lần đầu"
                description="Dữ liệu sẽ hiện ở đây khi job chạy xong."
              />
            ) : (
              <EmptyState
                title="Chưa có dữ liệu"
                description="Bấm Đồng bộ để tải danh mục tỉnh thành kèm phường/xã (một request)."
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
                    <Table.Th w={84}>Mã</Table.Th>
                    <Table.Th>Tên</Table.Th>
                    {wide && <Table.Th>Tên tiếng Anh</Table.Th>}
                    {wide && <Table.Th>Tỉnh thành</Table.Th>}
                    {wide && <Table.Th w={120}>Mã bưu chính</Table.Th>}
                    {wide && <Table.Th w={150}>Cập nhật</Table.Th>}
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
  return (
    <SyncHistoryPage
      crawler="provinces"
      description="Mỗi lần đồng bộ là một job tải lại cả danh mục (tỉnh thành và phường/xã). Job thất bại hay bị dừng không làm mất dữ liệu đã có."
      actions={<SyncButton />}
    />
  )
}
