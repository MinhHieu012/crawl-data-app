import {
  Anchor,
  Box,
  Button,
  Card,
  Group,
  NativeSelect,
  Stack,
  Table,
  Text,
  useMatches,
} from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { Link } from 'react-router'

import { useNovels, useSources } from '../../api/queries'
import { Cover } from '../../components/Cover'
import { Pager, SearchInput } from '../../components/ListControls'
import { NovelProgress } from '../../components/NovelProgress'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { NOVEL_STATUS, NovelStatusBadge, statusOptions } from '../../components/StatusBadge'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime } from '../../utils/format'

const PAGE_SIZE = 20
const DEFAULT_SORT = 'last_crawled_at:desc'
const SORT_OPTIONS = [
  { value: DEFAULT_SORT, label: 'Crawl gần nhất' },
  { value: 'title:asc', label: 'Tên A → Z' },
  { value: 'done:desc', label: 'Nhiều chương đã tải nhất' },
  { value: 'total_chapters:desc', label: 'Truyện dài nhất' },
]
// Dưới `md` (kể cả tablet có menu bên trái): các ô lọc giãn đều cho kín hàng thay vì mỗi ô một bề rộng.
const FILTER_FLEX = { base: '1 1 130px', md: '0 0 auto' }

export function NovelsPage() {
  const [filters, setFilters] = useUrlState({
    search: '',
    source: '',
    status: '',
    sort: DEFAULT_SORT,
    page: '1',
  })
  const page = Number(filters.page) || 1
  const [sort, order] = filters.sort.split(':')
  const novels = useNovels({
    search: filters.search,
    source: filters.source,
    status: filters.status,
    sort,
    order,
    page,
    page_size: PAGE_SIZE,
  })
  const sources = useSources()
  // Hẹp hơn `lg` thì không đủ chỗ cho sáu cột: nguồn, tình trạng, tiến độ dồn xuống dưới tên truyện.
  const wide = useMatches({ base: false, lg: true }, { getInitialValueInEffect: false })
  const filtering = Boolean(filters.search || filters.source || filters.status)
  const sourceOptions = [
    { value: '', label: 'Mọi nguồn' },
    ...(sources.data ?? []).map((source) => ({ value: source.name, label: source.name })),
  ]

  return (
    <>
      <PageHeader
        title="Truyện"
        description="Tìm theo tên truyện hoặc tác giả, gõ không dấu cũng được."
        actions={
          <Button component={Link} to="/crawl" leftSection={<IconPlus size={16} />}>
            Crawl truyện
          </Button>
        }
      />
      <Card withBorder>
        <Group mb="md" align="flex-end">
          <SearchInput
            value={filters.search}
            onSearch={(search) => setFilters({ search })}
            label="Tìm truyện"
            placeholder="Tên truyện hoặc tác giả"
          />
          <NativeSelect
            aria-label="Lọc theo nguồn"
            data={sourceOptions}
            flex={FILTER_FLEX}
            value={filters.source}
            onChange={(event) => setFilters({ source: event.currentTarget.value })}
          />
          <NativeSelect
            aria-label="Lọc theo tình trạng"
            data={statusOptions(NOVEL_STATUS, 'Mọi tình trạng')}
            flex={FILTER_FLEX}
            value={filters.status}
            onChange={(event) => setFilters({ status: event.currentTarget.value })}
          />
          <NativeSelect
            aria-label="Sắp xếp"
            data={SORT_OPTIONS}
            flex={FILTER_FLEX}
            value={filters.sort}
            onChange={(event) => setFilters({ sort: event.currentTarget.value })}
          />
        </Group>

        <QueryState
          query={novels}
          isEmpty={(data) => data.total === 0}
          empty={
            filtering ? (
              <EmptyState
                title="Không có truyện nào khớp bộ lọc"
                description="Thử từ khoá khác hoặc bỏ bớt điều kiện lọc."
              />
            ) : (
              <EmptyState
                title="Chưa có truyện nào"
                description="Truyện sẽ xuất hiện ở đây sau lần crawl đầu tiên."
                action={
                  <Button component={Link} to="/crawl" variant="light">
                    Crawl truyện đầu tiên
                  </Button>
                }
              />
            )
          }
        >
          {(data) => (
            <>
              <Table verticalSpacing="sm" highlightOnHover layout="fixed">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={60} aria-label="Ảnh bìa" />
                    <Table.Th>Truyện</Table.Th>
                    {wide && (
                      <>
                        <Table.Th w={120}>Nguồn</Table.Th>
                        <Table.Th w={210}>Chương đã tải</Table.Th>
                        <Table.Th w={130}>Tình trạng</Table.Th>
                        <Table.Th w={140}>Crawl gần nhất</Table.Th>
                      </>
                    )}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.items.map((novel) => (
                    <Table.Tr key={novel.id}>
                      <Table.Td style={{ verticalAlign: wide ? undefined : 'top' }}>
                        <Cover url={novel.cover_url} width={40} />
                      </Table.Td>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          to={`/novels/${novel.id}`}
                          fw={600}
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {novel.title}
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          {novel.author ?? 'Chưa rõ tác giả'}
                        </Text>
                        {!wide && (
                          <Stack gap={6} mt={6}>
                            <Group gap="xs">
                              <NovelStatusBadge status={novel.status} />
                              <Text size="xs" c="dimmed">
                                {novel.source}
                                {novel.last_crawled_at &&
                                  ` · crawl ${formatDateTime(novel.last_crawled_at)}`}
                              </Text>
                            </Group>
                            <Box maw={360}>
                              <NovelProgress novel={novel} />
                            </Box>
                          </Stack>
                        )}
                      </Table.Td>
                      {wide && (
                        <>
                          <Table.Td>{novel.source}</Table.Td>
                          <Table.Td>
                            <NovelProgress novel={novel} />
                          </Table.Td>
                          <Table.Td>
                            <NovelStatusBadge status={novel.status} />
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="dimmed">
                              {formatDateTime(novel.last_crawled_at)}
                            </Text>
                          </Table.Td>
                        </>
                      )}
                    </Table.Tr>
                  ))}
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
