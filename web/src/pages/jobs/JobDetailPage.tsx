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
  IconPlane,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
} from '@tabler/icons-react'
import { Link, useNavigate, useParams } from 'react-router'

import { useJob, useJobAction, useLogs } from '../../api/queries'
import type { Job, JobAction } from '../../api/types'
import { JobProgress } from '../../components/JobProgress'
import { LogList } from '../../components/LogList'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { JobStatusBadge } from '../../components/StatusBadge'
import { aviationPath, novelPaths } from '../../crawlers/paths'
import {
  aviationCounts,
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
const RERUN_LABEL: Partial<Record<Job['status'], string>> = {
  interrupted: 'Tiếp tục',
  partial: 'Thử lại chương lỗi',
  failed: 'Thử lại',
  completed: 'Kiểm tra chương mới',
  cancelled: 'Chạy lại',
}

function JobControls({ job }: { job: Job }) {
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
      title: `Huỷ job #${job.id}?`,
      children: (
        <Text size="sm">
          {isNovelJob(job)
            ? 'Job sẽ dừng hẳn và không tự chạy lại. Các chương đã tải vẫn được giữ; muốn tải tiếp thì tạo job mới.'
            : 'Job sẽ dừng hẳn và không tự chạy lại. Dữ liệu đã có từ các lần đồng bộ trước không bị ảnh hưởng.'}
        </Text>
      ),
      labels: { confirm: 'Huỷ job', cancel: 'Không huỷ' },
      confirmProps: { color: 'red' },
      onConfirm: () => run('cancel', `Đã huỷ job #${job.id}`),
    })

  const novel = isNovelJob(job)
  const paused = job.status === 'interrupted'
  // Job hàng không luôn tải lại cả nguồn, nên không có "thử lại chương lỗi" hay "kiểm tra chương mới".
  const rerunLabel =
    novel || paused ? RERUN_LABEL[job.status] : job.status !== 'running' && 'Đồng bộ lại'

  return (
    <Group gap="xs">
      {job.active && (
        <Button
          variant="default"
          leftSection={<IconPlayerPause size={16} />}
          loading={action.isPending}
          onClick={() => run('pause', `Đã tạm dừng job #${job.id}`)}
        >
          Tạm dừng
        </Button>
      )}
      {rerunLabel && (
        <Button
          leftSection={paused ? <IconPlayerPlay size={16} /> : <IconRefresh size={16} />}
          loading={action.isPending}
          onClick={() =>
            run(paused ? 'resume' : 'retry', 'Đã tạo job mới chạy lại đúng phạm vi cũ')
          }
        >
          {rerunLabel}
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
          Huỷ
        </Button>
      )}
      {job.novel_id !== null && (
        <Button
          variant="subtle"
          component={Link}
          to={novelPaths.novel(job.novel_id)}
          leftSection={<IconBook size={16} />}
        >
          Xem truyện
        </Button>
      )}
      {!novel && (
        <Button
          variant="subtle"
          component={Link}
          to={aviationPath(job.crawler)}
          leftSection={<IconPlane size={16} />}
        >
          Xem dữ liệu
        </Button>
      )}
    </Group>
  )
}

function JobLogs({ job }: { job: Job }) {
  const logs = useLogs({ job_id: job.id, limit: 200 }, job.status === 'running')
  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Log của job
        </Title>
        <Button component={Link} to={`/logs?job=${job.id}`} variant="subtle" size="compact-sm">
          Mở trong trang Log
        </Button>
      </Group>
      <QueryState
        query={logs}
        isEmpty={(entries) => entries.length === 0}
        empty={
          <EmptyState
            title="Chưa có dòng log nào của job này"
            description="Job cũ có thể đã nằm trong file log đã xoay vòng."
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
            <Metric label="Thành công" value={job.chapters_ok} color="teal" />
            <Metric label="Lỗi" value={job.chapters_failed} color="red" />
            <Metric label="Còn lại" value={remaining} />
            <Metric label="Bỏ qua (đã có sẵn)" value={job.chapters_skipped} />
          </SimpleGrid>
        ) : (
          job.result && (
            <Text size="sm" mt="md">
              Đã ghi: <b>{aviationCounts(job.result)}</b>
            </Text>
          )
        )}

        {job.last_chapter && (
          <Text size="sm" mt="md">
            Vừa tải xong: <b>{job.last_chapter}</b>
          </Text>
        )}
        {job.error && (
          <Alert color="red" title="Lý do dừng" mt="md">
            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
              {job.error}
            </Text>
          </Alert>
        )}
        {running && !job.active && (
          <Alert color="yellow" mt="md">
            Job này đang chạy ở một tiến trình khác (ví dụ lệnh crawl-data-app crawl) nên không tạm
            dừng hay huỷ được từ đây.
          </Alert>
        )}
        <Text size="xs" c="dimmed" mt="md">
          Bắt đầu {formatDateTime(job.started_at)}
          {job.finished_at &&
            ` · Kết thúc ${formatDateTime(job.finished_at)} · Chạy trong ${formatDuration(job.started_at, job.finished_at)}`}
        </Text>
      </Card>

      <JobLogs job={job} />
    </Stack>
  )
}

export function JobDetailPage() {
  const id = Number(useParams().id)
  const job = useJob(id)

  return (
    <>
      <PageHeader
        title={job.data ? jobTitle(job.data) : `Job #${id}`}
        crumbs={[{ label: 'Job crawl', to: '/jobs' }, { label: `Job #${id}` }]}
      />
      <QueryState query={job} skeleton={<Skeleton height={260} radius="md" />}>
        {(data) => <JobView job={data} />}
      </QueryState>
    </>
  )
}
