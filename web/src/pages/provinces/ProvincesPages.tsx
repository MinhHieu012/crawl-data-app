import { Button, Card, Group, Skeleton, Table, Text, useMatches } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'

import { BASE_URL } from '../../api/client'
import { useProvinces, useProvinceSummary, useSyncProvinces } from '../../api/queries'
import { SearchInput } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime, formatNumber } from '../../utils/format'
import { LastJobNote, SyncHistoryPage, SyncJobButton } from '../aviation/AviationPages'

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
      <Skeleton height={20} width={120} />
    )
  }
  return (
    <Text size="sm">
      {data.count > 0 ? `${formatNumber(data.count)} tỉnh thành` : 'Chưa đồng bộ lần nào'}
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
            34 tỉnh, thành phố sau sáp nhập năm 2025, lấy từ bộ dữ liệu mở
            vietnamese-provinces-database (giấy phép MIT). <LastJobNote job={lastJob} />
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
                description="Bấm Đồng bộ để tải danh mục tỉnh thành (một request)."
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
                    {wide && <Table.Td>{formatNumber(province.ward_count)}</Table.Td>}
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

/** Tab "Lịch sử": các job đồng bộ danh mục tỉnh thành, mới nhất ở trên. */
export function ProvinceHistoryPage() {
  return (
    <SyncHistoryPage
      crawler="provinces"
      description="Mỗi lần đồng bộ là một job tải lại cả danh mục. Job thất bại hay bị dừng không làm mất dữ liệu đã có."
      actions={<SyncButton />}
    />
  )
}
