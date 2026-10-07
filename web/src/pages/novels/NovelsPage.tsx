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
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useNovels, useSources } from '../../api/queries'
import { Cover } from '../../components/Cover'
import { Pager, SearchInput } from '../../components/ListControls'
import { NovelProgress } from '../../components/NovelProgress'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { NOVEL_STATUS, NovelStatusBadge, statusOptions } from '../../components/StatusBadge'
import { novelPaths } from '../../crawlers/paths'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime } from '../../utils/format'

const PAGE_SIZE = 20
const DEFAULT_SORT = 'last_crawled_at:desc'
const SORT_OPTIONS = [
  { value: DEFAULT_SORT, label: 'novels.sort.recent' },
  { value: 'title:asc', label: 'novels.sort.title' },
  { value: 'done:desc', label: 'novels.sort.done' },
  { value: 'total_chapters:desc', label: 'novels.sort.longest' },
] as const
// Dưới `md` (kể cả tablet có menu bên trái): các ô lọc giãn đều cho kín hàng thay vì mỗi ô một bề rộng.
const FILTER_FLEX = { base: '1 1 130px', md: '0 0 auto' }

export function NovelsPage() {
  const { t } = useTranslation()
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
    { value: '', label: t('novels.allSources') },
    ...(sources.data ?? []).map((source) => ({ value: source.name, label: source.name })),
  ]

  return (
    <>
      <PageHeader
        title={t('novels.title')}
        description={t('novels.description')}
        actions={
          <Button component={Link} to={novelPaths.crawl} leftSection={<IconPlus size={16} />}>
            {t('common.crawlNovel')}
          </Button>
        }
      />
      <Card withBorder>
        <Group mb="md" align="flex-end">
          <SearchInput
            value={filters.search}
            onSearch={(search) => setFilters({ search })}
            label={t('novels.search')}
            placeholder={t('novels.searchPlaceholder')}
          />
          <NativeSelect
            aria-label={t('novels.filterSource')}
            data={sourceOptions}
            flex={FILTER_FLEX}
            value={filters.source}
            onChange={(event) => setFilters({ source: event.currentTarget.value })}
          />
          <NativeSelect
            aria-label={t('novels.filterStatus')}
            data={statusOptions(NOVEL_STATUS, t('novels.allStatuses'))}
            flex={FILTER_FLEX}
            value={filters.status}
            onChange={(event) => setFilters({ status: event.currentTarget.value })}
          />
          <NativeSelect
            aria-label={t('novels.sortLabel')}
            data={SORT_OPTIONS.map(({ value, label }) => ({ value, label: t(label) }))}
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
                title={t('novels.noMatch.title')}
                description={t('novels.noMatch.description')}
              />
            ) : (
              <EmptyState
                title={t('novels.empty.title')}
                description={t('novels.empty.description')}
                action={
                  <Button component={Link} to={novelPaths.crawl} variant="light">
                    {t('common.crawlFirstNovel')}
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
                    <Table.Th w={60} aria-label={t('novels.cover')} />
                    <Table.Th>{t('novels.title')}</Table.Th>
                    {wide && (
                      <>
                        <Table.Th w={120}>{t('common.source')}</Table.Th>
                        <Table.Th w={210}>{t('chapters.done')}</Table.Th>
                        <Table.Th w={130}>{t('novels.statusColumn')}</Table.Th>
                        <Table.Th w={140}>{t('novels.sort.recent')}</Table.Th>
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
                          to={novelPaths.novel(novel.id)}
                          fw={600}
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {novel.title}
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          {novel.author ?? t('novels.unknownAuthor')}
                        </Text>
                        {!wide && (
                          <Stack gap={6} mt={6}>
                            <Group gap="xs">
                              <NovelStatusBadge status={novel.status} />
                              <Text size="xs" c="dimmed">
                                {novel.source}
                                {novel.last_crawled_at &&
                                  ` · ${t('novels.crawledAt', { time: formatDateTime(novel.last_crawled_at) })}`}
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
