import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Skeleton,
  Spoiler,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  useMatches,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { IconDownload, IconReload } from '@tabler/icons-react'
import { Link, useParams } from 'react-router'

import { useChapters, useJobs, useNovel } from '../../api/queries'
import type { Chapter, ChapterStatus, Novel } from '../../api/types'
import { Cover } from '../../components/Cover'
import { JobProgress } from '../../components/JobProgress'
import { JobsTable } from '../../components/JobsTable'
import { Pager } from '../../components/ListControls'
import { NovelProgress } from '../../components/NovelProgress'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import {
  CHAPTER_STATUS,
  ChapterStatusBadge,
  NovelStatusBadge,
  statusOptions,
} from '../../components/StatusBadge'
import { useStartCrawl } from '../../hooks/useStartCrawl'
import { useUrlState } from '../../hooks/useUrlState'
import { formatDateTime, toChapterNumber } from '../../utils/format'

const CHAPTERS_PER_PAGE = 50

interface RangeModalProps {
  novel: Novel
  opened: boolean
  onClose: () => void
}

function RangeModal({ novel, opened, onClose }: RangeModalProps) {
  const { start, isPending } = useStartCrawl()
  const form = useForm<{ from: number | string; to: number | string; force: boolean }>({
    initialValues: { from: 1, to: novel.total_chapters ?? '', force: false },
    validate: {
      to: (to, { from }) =>
        typeof to === 'number' && typeof from === 'number' && to < from
          ? 'Chương kết thúc phải lớn hơn hoặc bằng chương bắt đầu'
          : null,
    },
  })

  const submit = form.onSubmit(({ from, to, force }) =>
    start({
      url: novel.url,
      from_chapter: toChapterNumber(from),
      to_chapter: toChapterNumber(to),
      force,
    }),
  )

  return (
    <Modal opened={opened} onClose={onClose} title="Tải theo khoảng chương">
      <form onSubmit={submit}>
        <Group grow align="flex-start">
          <NumberInput
            label="Từ chương"
            min={1}
            allowDecimal={false}
            {...form.getInputProps('from')}
          />
          <NumberInput
            label="Đến chương"
            placeholder="cuối truyện"
            min={1}
            allowDecimal={false}
            {...form.getInputProps('to')}
          />
        </Group>
        <Checkbox
          mt="md"
          label="Tải lại cả chương đã có (chỉ ghi đè chương có nội dung thay đổi)"
          {...form.getInputProps('force', { type: 'checkbox' })}
        />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={onClose}>
            Thôi
          </Button>
          <Button type="submit" loading={isPending}>
            Bắt đầu tải
          </Button>
        </Group>
      </form>
    </Modal>
  )
}

interface ChapterListProps {
  novel: Novel
  /** Truyện đang được crawl: danh sách tự cập nhật và tạm khoá nút tải lại. */
  crawling: boolean
}

function ChapterList({ novel, crawling }: ChapterListProps) {
  const [filters, setFilters] = useUrlState({ status: '', page: '1' })
  const page = Number(filters.page) || 1
  const chapters = useChapters(
    novel.id,
    { status: filters.status as ChapterStatus | '', page, page_size: CHAPTERS_PER_PAGE },
    crawling,
  )
  const { start, isPending } = useStartCrawl()
  // Hẹp hơn `md`: trạng thái và giờ tải dồn xuống dưới tiêu đề chương, bảng không phải cuộn ngang.
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })

  const recrawl = (chapter: Chapter) => {
    const request = {
      url: novel.url,
      from_chapter: chapter.number,
      to_chapter: chapter.number,
      force: true,
    }
    if (chapter.status !== 'done') return start(request)
    modals.openConfirmModal({
      title: `Tải lại chương ${chapter.number}?`,
      children: (
        <Text size="sm">
          Nội dung đang lưu của chương này sẽ bị ghi đè nếu bản trên website nguồn đã thay đổi.
        </Text>
      ),
      labels: { confirm: 'Tải lại', cancel: 'Thôi' },
      onConfirm: () => start(request),
    })
  }

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Danh sách chương
        </Title>
        <SegmentedControl
          size="xs"
          aria-label="Lọc chương theo trạng thái"
          data={statusOptions(CHAPTER_STATUS, 'Tất cả')}
          value={filters.status}
          onChange={(status) => setFilters({ status })}
        />
      </Group>
      <QueryState
        query={chapters}
        isEmpty={(data) => data.total === 0}
        empty={
          filters.status ? (
            <EmptyState title="Không có chương nào ở trạng thái này" />
          ) : (
            <EmptyState
              title="Chưa có mục lục"
              description="Truyện này mới chỉ được lấy thông tin. Bấm “Tải các chương còn thiếu” để lấy mục lục và nội dung."
            />
          )
        }
      >
        {(data) => (
          <>
            <Table verticalSpacing="xs" highlightOnHover layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={wide ? 70 : 48}>Số</Table.Th>
                  <Table.Th>Tiêu đề</Table.Th>
                  {wide && (
                    <>
                      <Table.Th w={110}>Trạng thái</Table.Th>
                      <Table.Th w={140}>Tải lúc</Table.Th>
                    </>
                  )}
                  <Table.Th w={56} aria-label="Hành động" />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((chapter) => (
                  <Table.Tr key={`${chapter.number}-${chapter.url}`}>
                    <Table.Td style={{ verticalAlign: wide ? undefined : 'top' }}>
                      {chapter.number}
                    </Table.Td>
                    <Table.Td>
                      {chapter.status === 'done' ? (
                        <Anchor
                          component={Link}
                          to={`/novels/${novel.id}/chapters/${chapter.number}`}
                          size="sm"
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {chapter.title}
                        </Anchor>
                      ) : (
                        <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                          {chapter.title}
                        </Text>
                      )}
                      {chapter.error && (
                        <Text size="xs" c="red" style={{ overflowWrap: 'anywhere' }}>
                          {chapter.error}
                        </Text>
                      )}
                      {!wide && (
                        <Group gap="xs" mt={4}>
                          <ChapterStatusBadge status={chapter.status} />
                          {chapter.crawled_at && (
                            <Text size="xs" c="dimmed">
                              {formatDateTime(chapter.crawled_at)}
                            </Text>
                          )}
                        </Group>
                      )}
                    </Table.Td>
                    {wide && (
                      <>
                        <Table.Td>
                          <ChapterStatusBadge status={chapter.status} />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {formatDateTime(chapter.crawled_at)}
                          </Text>
                        </Table.Td>
                      </>
                    )}
                    <Table.Td>
                      <Tooltip
                        label={chapter.status === 'done' ? 'Tải lại chương này' : 'Tải chương này'}
                      >
                        <ActionIcon
                          variant="subtle"
                          size={wide ? 'md' : 'lg'}
                          aria-label={`Tải lại chương ${chapter.number}`}
                          disabled={isPending || crawling}
                          onClick={() => recrawl(chapter)}
                        >
                          <IconReload size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Pager
              total={data.total}
              page={page}
              pageSize={CHAPTERS_PER_PAGE}
              onChange={(next) => setFilters({ page: String(next) })}
            />
          </>
        )}
      </QueryState>
    </Card>
  )
}

function NovelView({ novel }: { novel: Novel }) {
  const jobs = useJobs({ novel_id: novel.id, page_size: 5 })
  const runningJob = jobs.data?.items.find((job) => job.status === 'running')
  const crawling = runningJob !== undefined
  const { start, isPending } = useStartCrawl()
  const [rangeOpened, range] = useDisclosure()

  return (
    <Stack gap="lg">
      <Card withBorder>
        <Group align="flex-start" wrap="nowrap" gap="lg">
          <Box visibleFrom="xs">
            <Cover url={novel.cover_url} width={140} />
          </Box>
          <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs">
              <NovelStatusBadge status={novel.status} />
              {novel.genres.map((genre) => (
                <Badge key={genre} variant="default">
                  {genre}
                </Badge>
              ))}
            </Group>
            <Text size="sm">
              Tác giả: <b>{novel.author ?? 'chưa rõ'}</b> · Nguồn: <b>{novel.source}</b>
            </Text>
            <Anchor
              href={novel.url}
              target="_blank"
              rel="noreferrer"
              size="sm"
              style={{ overflowWrap: 'anywhere' }}
            >
              {novel.url}
            </Anchor>
            <Box maw={420}>
              <NovelProgress novel={novel} size="md" />
            </Box>
            <Text size="xs" c="dimmed">
              Crawl gần nhất: {formatDateTime(novel.last_crawled_at)} · Đăng trên nguồn:{' '}
              {formatDateTime(novel.published_at)} · Chờ tải: {novel.chapters_pending} chương
            </Text>
            <Group gap="xs" mt="xs">
              <Button
                leftSection={<IconDownload size={16} />}
                loading={isPending}
                disabled={crawling}
                onClick={() => start({ url: novel.url })}
              >
                Tải các chương còn thiếu
              </Button>
              <Button variant="default" disabled={crawling} onClick={range.open}>
                Tải theo khoảng chương…
              </Button>
            </Group>
          </Stack>
        </Group>
        {novel.description && (
          <Spoiler maxHeight={96} showLabel="Xem thêm" hideLabel="Thu gọn" mt="md">
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {novel.description}
            </Text>
          </Spoiler>
        )}
      </Card>

      {runningJob && (
        <Alert color="blue" title={`Job #${runningJob.id} đang crawl truyện này`}>
          <JobProgress job={runningJob} />
          <Anchor component={Link} to={`/jobs/${runningJob.id}`} size="sm" mt="xs" display="block">
            Theo dõi job
          </Anchor>
        </Alert>
      )}

      <ChapterList novel={novel} crawling={crawling} />

      <Card withBorder>
        <Title order={2} size="h4" mb="sm">
          Lịch sử crawl
        </Title>
        <QueryState
          query={jobs}
          isEmpty={(data) => data.items.length === 0}
          empty={<EmptyState title="Chưa có job nào cho truyện này" />}
        >
          {(data) => <JobsTable jobs={data.items} />}
        </QueryState>
      </Card>

      <RangeModal novel={novel} opened={rangeOpened} onClose={range.close} />
    </Stack>
  )
}

export function NovelDetailPage() {
  const id = Number(useParams().id)
  // Cùng query với NovelView nên không tốn thêm request; chỉ để biết có cần hỏi lại định kỳ không.
  const jobs = useJobs({ novel_id: id, page_size: 5 })
  const crawling = jobs.data?.items.some((job) => job.status === 'running') ?? false
  const novel = useNovel(id, crawling)

  return (
    <>
      <PageHeader
        title={novel.data?.title ?? 'Truyện'}
        crumbs={[{ label: 'Truyện', to: '/novels' }, { label: novel.data?.title ?? `#${id}` }]}
      />
      <QueryState query={novel} skeleton={<Skeleton height={240} radius="md" />}>
        {(data) => <NovelView novel={data} />}
      </QueryState>
    </>
  )
}
