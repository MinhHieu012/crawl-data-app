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
import { IconDownload, IconFileExport, IconReload } from '@tabler/icons-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { BASE_URL } from '../../api/client'
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
import { novelCrumbs, novelPaths } from '../../crawlers/paths'
import { useStartCrawl } from '../../hooks/useStartCrawl'
import { useUrlState } from '../../hooks/useUrlState'
import i18n from '../../i18n'
import { formatDateTime, toChapterNumber } from '../../utils/format'

const CHAPTERS_PER_PAGE = 50

interface RangeModalProps {
  novel: Novel
  opened: boolean
  onClose: () => void
}

const validateTo = (to: number | string, { from }: { from: number | string }) =>
  typeof to === 'number' && typeof from === 'number' && to < from
    ? i18n.t('crawl.validation.range')
    : null

function RangeModal({ novel, opened, onClose }: RangeModalProps) {
  const { t } = useTranslation()
  const { start, isPending } = useStartCrawl()
  const form = useForm<{ from: number | string; to: number | string; force: boolean }>({
    initialValues: { from: 1, to: novel.total_chapters ?? '', force: false },
    validate: { to: validateTo },
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
    <Modal opened={opened} onClose={onClose} title={t('novel.range.title')}>
      <form onSubmit={submit}>
        <Group grow align="flex-start">
          <NumberInput
            label={t('crawl.from')}
            min={1}
            allowDecimal={false}
            {...form.getInputProps('from')}
          />
          <NumberInput
            label={t('crawl.to')}
            placeholder={t('novel.range.toEnd')}
            min={1}
            allowDecimal={false}
            {...form.getInputProps('to')}
          />
        </Group>
        <Checkbox
          mt="md"
          label={t('novel.range.force')}
          {...form.getInputProps('force', { type: 'checkbox' })}
        />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={onClose}>
            {t('common.dismiss')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('novel.range.start')}
          </Button>
        </Group>
      </form>
    </Modal>
  )
}

/** Xuất JSON theo hai kiểu: toàn bộ chương đã tải, hoặc một khoảng chương. File do backend dựng. */
function ExportModal({ novel, opened, onClose }: RangeModalProps) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const form = useForm<{ from: number | string; to: number | string }>({
    initialValues: { from: 1, to: novel.total_chapters ?? '' },
    validateInputOnChange: true,
    validate: { to: validateTo },
  })
  const ranged = scope === 'range'

  const params = new URLSearchParams()
  if (ranged) {
    const { from, to } = form.values
    if (typeof from === 'number') params.set('from_chapter', String(from))
    if (typeof to === 'number') params.set('to_chapter', String(to))
  }
  const query = params.toString()
  const href = `${BASE_URL}/novels/${novel.id}/export${query && `?${query}`}`
  const download = {
    leftSection: <IconFileExport size={16} />,
    children: t('novel.export.download'),
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t('common.exportJson')}>
      <SegmentedControl
        fullWidth
        value={scope}
        onChange={(value) => setScope(value as 'all' | 'range')}
        data={[
          { value: 'all', label: t('crawl.scopes.all') },
          { value: 'range', label: t('crawl.scopes.range') },
        ]}
      />
      {ranged && (
        <Group grow align="flex-start" mt="md">
          <NumberInput
            label={t('crawl.from')}
            placeholder={t('novel.export.fromStart')}
            min={1}
            allowDecimal={false}
            {...form.getInputProps('from')}
          />
          <NumberInput
            label={t('crawl.to')}
            placeholder={t('novel.range.toEnd')}
            min={1}
            allowDecimal={false}
            {...form.getInputProps('to')}
          />
        </Group>
      )}
      <Text size="sm" c="dimmed" mt="md">
        <Trans
          i18nKey="novel.export.note"
          values={{ done: novel.chapters_done }}
          components={{ b: <b /> }}
        />
        {ranged && t('novel.export.rangeNote')}.
      </Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          {t('common.dismiss')}
        </Button>
        {/* Link tải thẳng như trang hàng không; khoảng không hợp lệ thì không có link để bấm. */}
        {ranged && !form.isValid() ? (
          <Button disabled {...download} />
        ) : (
          <Button component="a" href={href} download onClick={onClose} {...download} />
        )}
      </Group>
    </Modal>
  )
}

interface ChapterListProps {
  novel: Novel
  /** Truyện đang được crawl: danh sách tự cập nhật và tạm khoá nút tải lại. */
  crawling: boolean
}

function ChapterList({ novel, crawling }: ChapterListProps) {
  const { t } = useTranslation()
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
      title: t('novel.reload.title', { number: chapter.number }),
      children: <Text size="sm">{t('novel.reload.body')}</Text>,
      labels: { confirm: t('novel.reload.confirm'), cancel: t('common.dismiss') },
      onConfirm: () => start(request),
    })
  }

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          {t('novel.chapters.title')}
        </Title>
        <SegmentedControl
          size="xs"
          aria-label={t('novel.chapters.filter')}
          data={statusOptions(CHAPTER_STATUS, t('common.all'))}
          value={filters.status}
          onChange={(status) => setFilters({ status })}
        />
      </Group>
      <QueryState
        query={chapters}
        isEmpty={(data) => data.total === 0}
        empty={
          filters.status ? (
            <EmptyState title={t('novel.chapters.noneInStatus')} />
          ) : (
            <EmptyState
              title={t('novel.chapters.noToc.title')}
              description={t('novel.chapters.noToc.description')}
            />
          )
        }
      >
        {(data) => (
          <>
            <Table verticalSpacing="xs" highlightOnHover layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={wide ? 70 : 48}>{t('novel.chapters.number')}</Table.Th>
                  <Table.Th>{t('novel.chapters.titleColumn')}</Table.Th>
                  {wide && (
                    <>
                      <Table.Th w={110}>{t('common.status')}</Table.Th>
                      <Table.Th w={140}>{t('novel.chapters.downloadedAt')}</Table.Th>
                    </>
                  )}
                  <Table.Th w={56} aria-label={t('novel.chapters.actions')} />
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
                          to={novelPaths.chapter(novel.id, chapter.number)}
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
                        label={
                          chapter.status === 'done'
                            ? t('novel.chapters.reloadThis')
                            : t('chapter.download')
                        }
                      >
                        <ActionIcon
                          variant="subtle"
                          size={wide ? 'md' : 'lg'}
                          aria-label={t('novel.chapters.reload', { number: chapter.number })}
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
  const { t } = useTranslation()
  const jobs = useJobs({ novel_id: novel.id, page_size: 5 })
  const runningJob = jobs.data?.items.find((job) => job.status === 'running')
  const crawling = runningJob !== undefined
  const { start, isPending } = useStartCrawl()
  const [rangeOpened, range] = useDisclosure()
  const [exportOpened, exporting] = useDisclosure()

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
              {t('novel.author')}: <b>{novel.author ?? t('novel.unknownAuthor')}</b> ·{' '}
              {t('common.source')}: <b>{novel.source}</b>
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
              {t('novel.meta', {
                crawled: formatDateTime(novel.last_crawled_at),
                published: formatDateTime(novel.published_at),
                pending: novel.chapters_pending,
              })}
            </Text>
            <Group gap="xs" mt="xs">
              <Button
                leftSection={<IconDownload size={16} />}
                loading={isPending}
                disabled={crawling}
                onClick={() => start({ url: novel.url })}
              >
                {t('novel.downloadMissing')}
              </Button>
              <Button variant="default" disabled={crawling} onClick={range.open}>
                {t('novel.range.title')}…
              </Button>
              <Button
                variant="default"
                leftSection={<IconFileExport size={16} />}
                disabled={novel.chapters_done === 0}
                onClick={exporting.open}
              >
                {t('common.exportJson')}…
              </Button>
            </Group>
          </Stack>
        </Group>
        {novel.description && (
          <Spoiler
            maxHeight={96}
            showLabel={t('novel.showMore')}
            hideLabel={t('novel.showLess')}
            mt="md"
          >
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {novel.description}
            </Text>
          </Spoiler>
        )}
      </Card>

      {runningJob && (
        <Alert color="blue" title={t('novel.crawling', { id: runningJob.id })}>
          <JobProgress job={runningJob} />
          <Anchor component={Link} to={`/jobs/${runningJob.id}`} size="sm" mt="xs" display="block">
            {t('novel.followJob')}
          </Anchor>
        </Alert>
      )}

      <ChapterList novel={novel} crawling={crawling} />

      <Card withBorder>
        <Title order={2} size="h4" mb="sm">
          {t('novel.history')}
        </Title>
        <QueryState
          query={jobs}
          isEmpty={(data) => data.items.length === 0}
          empty={<EmptyState title={t('novel.noJobs')} />}
        >
          {(data) => <JobsTable jobs={data.items} />}
        </QueryState>
      </Card>

      <RangeModal novel={novel} opened={rangeOpened} onClose={range.close} />
      <ExportModal novel={novel} opened={exportOpened} onClose={exporting.close} />
    </Stack>
  )
}

export function NovelDetailPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  // Cùng query với NovelView nên không tốn thêm request; chỉ để biết có cần hỏi lại định kỳ không.
  const jobs = useJobs({ novel_id: id, page_size: 5 })
  const crawling = jobs.data?.items.some((job) => job.status === 'running') ?? false
  const novel = useNovel(id, crawling)

  return (
    <>
      <PageHeader
        title={novel.data?.title ?? t('novels.title')}
        crumbs={[...novelCrumbs(t), { label: novel.data?.title ?? `#${id}` }]}
      />
      <QueryState query={novel} skeleton={<Skeleton height={240} radius="md" />}>
        {(data) => <NovelView novel={data} />}
      </QueryState>
    </>
  )
}
