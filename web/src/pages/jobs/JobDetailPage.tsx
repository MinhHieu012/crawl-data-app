import {
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import {
  IconBan,
  IconBook,
  IconDatabase,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { useJob, useJobAction, useLogs } from '../../api/queries'
import type { Job, JobAction } from '../../api/types'
import type { I18nKey } from '../../i18n'
import { JobProgress } from '../../components/JobProgress'
import { LogList } from '../../components/LogList'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { JobStatusBadge } from '../../components/StatusBadge'
import { jobDataPath, novelPaths } from '../../crawlers/paths'
import {
  recordCounts,
  formatDateTime,
  formatDuration,
  formatNumber,
  isNovelJob,
  jobScope,
  jobTitle,
} from '../../utils/format'
import { notifyError, notifySuccess } from '../../utils/notify'

function Metric({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fz={24} fw={700} c={value > 0 ? color : undefined} lh={1.3}>
        {formatNumber(value)}
      </Text>
    </div>
  )
}

// Chạy lại một job cũ là cùng một thao tác ở backend; chỉ tên nút đổi theo lý do job đã dừng.
const RERUN_LABEL: Partial<Record<Job['status'], I18nKey>> = {
  interrupted: 'job.rerun.interrupted',
  partial: 'job.rerun.partial',
  failed: 'common.retry',
  completed: 'job.rerun.completed',
  cancelled: 'job.rerun.cancelled',
}

function JobControls({ job }: { job: Job }) {
  const { t } = useTranslation()
  const action = useJobAction()
  const navigate = useNavigate()

  const run = (name: JobAction, done: string) =>
    action.mutate(
      { id: job.id, action: name },
      {
        onSuccess: (result) => {
          notifySuccess(done)
          if (result.id !== job.id) navigate(`/jobs/${result.id}`) // chạy lại = một job mới
        },
        onError: (error) => notifyError(error),
      },
    )

  const confirmCancel = () =>
    modals.openConfirmModal({
      title: t('job.cancelConfirm.title', { id: job.id }),
      children: (
        <Text size="sm">
          {isNovelJob(job) ? t('job.cancelConfirm.novel') : t('job.cancelConfirm.sync')}
        </Text>
      ),
      labels: { confirm: t('job.cancelConfirm.confirm'), cancel: t('job.cancelConfirm.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => run('cancel', t('job.cancelled', { id: job.id })),
    })

  const novel = isNovelJob(job)
  const paused = job.status === 'interrupted'
  // Job hàng không luôn tải lại cả nguồn, nên không có "thử lại chương lỗi" hay "kiểm tra chương mới".
  const rerunLabel: I18nKey | false | undefined =
    novel || paused ? RERUN_LABEL[job.status] : job.status !== 'running' && 'job.rerun.sync'

  return (
    <Group gap="xs">
      {job.active && (
        <Button
          variant="default"
          leftSection={<IconPlayerPause size={16} />}
          loading={action.isPending}
          onClick={() => run('pause', t('job.paused', { id: job.id }))}
        >
          {t('job.pause')}
        </Button>
      )}
      {rerunLabel && (
        <Button
          leftSection={paused ? <IconPlayerPlay size={16} /> : <IconRefresh size={16} />}
          loading={action.isPending}
          onClick={() => run(paused ? 'resume' : 'retry', t('job.rerunCreated'))}
        >
          {t(rerunLabel)}
        </Button>
      )}
      {(job.active || paused) && (
        <Button
          variant="outline"
          color="red"
          leftSection={<IconBan size={16} />}
          disabled={action.isPending}
          onClick={confirmCancel}
        >
          {t('job.cancel')}
        </Button>
      )}
      {job.novel_id !== null && (
        <Button
          variant="subtle"
          component={Link}
          to={novelPaths.novel(job.novel_id)}
          leftSection={<IconBook size={16} />}
        >
          {t('common.viewNovel')}
        </Button>
      )}
      {!novel && (
        <Button
          variant="subtle"
          component={Link}
          to={jobDataPath(job.crawler)}
          leftSection={<IconDatabase size={16} />}
        >
          {t('job.viewData')}
        </Button>
      )}
    </Group>
  )
}

function JobLogs({ job }: { job: Job }) {
  const { t } = useTranslation()
  const logs = useLogs({ job_id: job.id, limit: 200 }, job.status === 'running')
  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          {t('job.logs.title')}
        </Title>
        <Button component={Link} to={`/logs?job=${job.id}`} variant="subtle" size="compact-sm">
          {t('job.logs.open')}
        </Button>
      </Group>
      <QueryState
        query={logs}
        isEmpty={(entries) => entries.length === 0}
        empty={
          <EmptyState
            title={t('job.logs.empty.title')}
            description={t('job.logs.empty.description')}
          />
        }
      >
        {(entries) => (
          <ScrollArea.Autosize mah={440}>
            <LogList entries={entries} showJob={false} />
          </ScrollArea.Autosize>
        )}
      </QueryState>
    </Card>
  )
}

function JobView({ job }: { job: Job }) {
  const { t } = useTranslation()
  const running = job.status === 'running'
  const remaining = Math.max(job.chapters_total - job.chapters_ok - job.chapters_failed, 0)

  return (
    <Stack gap="lg">
      <Card withBorder>
        <Group justify="space-between" align="flex-start" mb="md">
          <div style={{ minWidth: 0 }}>
            <Group gap="xs" mb={4}>
              <JobStatusBadge status={job.status} />
              <Text size="sm" c="dimmed">
                {jobScope(job)}
              </Text>
            </Group>
            <Anchor
              href={job.url}
              target="_blank"
              rel="noreferrer"
              size="sm"
              style={{ overflowWrap: 'anywhere' }}
            >
              {job.url}
            </Anchor>
          </div>
          <JobControls job={job} />
        </Group>

        <JobProgress job={job} size="xl" />

        {isNovelJob(job) ? (
          <SimpleGrid cols={{ base: 2, sm: 4 }} mt="md">
            <Metric label={t('job.metrics.ok')} value={job.chapters_ok} color="teal" />
            <Metric label={t('job.metrics.failed')} value={job.chapters_failed} color="red" />
            <Metric label={t('job.metrics.remaining')} value={remaining} />
            <Metric label={t('job.metrics.skipped')} value={job.chapters_skipped} />
          </SimpleGrid>
        ) : (
          job.result && (
            <Text size="sm" mt="md">
              {t('job.written')} <b>{recordCounts(job.result)}</b>
            </Text>
          )
        )}

        {job.last_chapter && (
          <Text size="sm" mt="md">
            {t('job.lastChapter')} <b>{job.last_chapter}</b>
          </Text>
        )}
        {job.error && (
          <Alert color="red" title={t('job.stopReason')} mt="md">
            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
              {job.error}
            </Text>
          </Alert>
        )}
        {running && !job.active && (
          <Alert color="yellow" mt="md">
            {t('job.otherProcess')}
          </Alert>
        )}
        <Text size="xs" c="dimmed" mt="md">
          {t('job.started', { time: formatDateTime(job.started_at) })}
          {job.finished_at &&
            ` · ${t('job.finished', {
              time: formatDateTime(job.finished_at),
              duration: formatDuration(job.started_at, job.finished_at),
            })}`}
        </Text>
      </Card>

      <JobLogs job={job} />
    </Stack>
  )
}

export function JobDetailPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const job = useJob(id)

  return (
    <>
      <PageHeader
        title={job.data ? jobTitle(job.data) : `Job #${id}`}
        crumbs={[{ label: t('jobs.title'), to: '/jobs' }, { label: `Job #${id}` }]}
      />
      <QueryState query={job} skeleton={<Skeleton height={260} radius="md" />}>
        {(data) => <JobView job={data} />}
      </QueryState>
    </>
  )
}
