import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  useMatches,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { IconAlertTriangle, IconPlayerPlay } from '@tabler/icons-react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { ApiError } from '../../api/client'
import { useCreateJob, useSources } from '../../api/queries'
import { PageHeader } from '../../components/PageHeader'
import { isHttpUrl, toChapterNumber } from '../../utils/format'

type Scope = 'all' | 'range' | 'info'

interface CrawlForm {
  source: string
  url: string
  scope: Scope
  from: number | string
  to: number | string
  skipExisting: boolean
  retryFailed: boolean
}

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'Toàn bộ chương' },
  { value: 'range', label: 'Khoảng chương' },
  { value: 'info', label: 'Chỉ thông tin truyện' },
]

// Những lỗi của backend nói về chính URL → hiện ngay dưới ô URL thay vì ở cuối form.
const URL_ERROR_CODES = new Set(['invalid_url', 'unsupported_source', 'source_disabled'])

export function CrawlPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sources = useSources()
  const createJob = useCreateJob()

  const form = useForm<CrawlForm>({
    initialValues: {
      source: '',
      url: searchParams.get('url') ?? '',
      scope: 'all',
      from: 1,
      to: '',
      skipExisting: true,
      retryFailed: true,
    },
    validate: {
      url: (url) =>
        isHttpUrl(url.trim())
          ? null
          : 'Nhập URL đầy đủ của truyện, ví dụ https://truyenfull.live/ten-truyen/',
      to: (to, { from, scope }) =>
        scope === 'range' && typeof to === 'number' && typeof from === 'number' && to < from
          ? 'Chương kết thúc phải lớn hơn hoặc bằng chương bắt đầu'
          : null,
    },
  })
  const { scope } = form.values
  // Ba lựa chọn phạm vi không vừa một hàng trên điện thoại → xếp dọc, trải hết bề ngang.
  const stackScopes = useMatches({ base: true, xs: false }, { getInitialValueInEffect: false })
  const enabledSources = (sources.data ?? []).filter((source) => source.enabled)

  const submit = form.onSubmit(
    (values) => {
      const ranged = values.scope === 'range'
      createJob.mutate(
        {
          url: values.url.trim(),
          source: values.source || null,
          with_chapters: values.scope !== 'info',
          from_chapter: ranged ? toChapterNumber(values.from) : null,
          to_chapter: ranged ? toChapterNumber(values.to) : null,
          force: !values.skipExisting,
          retry_failed: values.retryFailed,
        },
        {
          onSuccess: (job) => navigate(`/jobs/${job.id}`),
          onError: (error) => {
            if (error instanceof ApiError && URL_ERROR_CODES.has(error.code ?? '')) {
              form.setFieldError('url', error.message)
            }
          },
        },
      )
      // Còn ô sai thì đưa con trỏ tới ô sai đầu tiên, không chỉ hiện chữ đỏ.
    },
    (errors) => form.getInputNode(Object.keys(errors)[0] ?? '')?.focus(),
  )

  const error = createJob.error
  const urlError = error instanceof ApiError && URL_ERROR_CODES.has(error.code ?? '')
  const duplicateJobId = error instanceof ApiError ? error.jobId : undefined

  return (
    <>
      <PageHeader
        title="Crawl truyện"
        description="Dán URL của truyện (URL một chương cũng được). Chạy lại bao nhiêu lần cũng chỉ tải phần còn thiếu."
      />
      <Card withBorder maw={720}>
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            <NativeSelect
              label="Nguồn"
              description={
                enabledSources.length > 0
                  ? `Đang hỗ trợ: ${enabledSources.map((source) => `${source.name} (${source.domains[0]})`).join(', ')}`
                  : undefined
              }
              data={[
                { value: '', label: 'Tự nhận diện theo URL' },
                ...enabledSources.map((source) => ({ value: source.name, label: source.name })),
              ]}
              {...form.getInputProps('source')}
            />
            <TextInput
              label="URL truyện"
              placeholder="https://truyenfull.live/ten-truyen/"
              type="url"
              required
              {...form.getInputProps('url')}
            />

            <div>
              <Text size="sm" fw={500} mb={4}>
                Phạm vi
              </Text>
              <SegmentedControl
                aria-label="Phạm vi crawl"
                data={SCOPES}
                orientation={stackScopes ? 'vertical' : 'horizontal'}
                fullWidth={stackScopes}
                {...form.getInputProps('scope')}
              />
            </div>
            {scope === 'range' && (
              <Group grow align="flex-start">
                <NumberInput
                  label="Từ chương"
                  description="Theo số thứ tự trong mục lục"
                  min={1}
                  allowDecimal={false}
                  {...form.getInputProps('from')}
                />
                <NumberInput
                  label="Đến chương"
                  description="Để trống = tới cuối truyện"
                  min={1}
                  allowDecimal={false}
                  {...form.getInputProps('to')}
                />
              </Group>
            )}

            {scope !== 'info' && (
              <Stack gap="xs">
                <Checkbox
                  label="Bỏ qua các chương đã tải"
                  description="Bỏ chọn để tải lại tất cả; chỉ chương có nội dung thay đổi mới bị ghi đè."
                  {...form.getInputProps('skipExisting', { type: 'checkbox' })}
                />
                <Checkbox
                  label="Thử lại các chương đang lỗi"
                  {...form.getInputProps('retryFailed', { type: 'checkbox' })}
                />
              </Stack>
            )}

            {error && !urlError && (
              <Alert
                color="red"
                icon={<IconAlertTriangle size={18} />}
                title="Không tạo được job"
                role="alert"
              >
                <Text size="sm">{error.message}</Text>
                {duplicateJobId !== undefined && (
                  <Button
                    component={Link}
                    to={`/jobs/${duplicateJobId}`}
                    size="xs"
                    variant="light"
                    color="red"
                    mt="sm"
                  >
                    Xem job #{duplicateJobId}
                  </Button>
                )}
              </Alert>
            )}

            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed" maw={420}>
                Crawler tuân thủ robots.txt, giãn cách request và dừng khi bị website từ chối. Chỉ
                crawl nội dung bạn được phép sử dụng.
              </Text>
              <Button
                type="submit"
                loading={createJob.isPending}
                leftSection={<IconPlayerPlay size={16} />}
              >
                Bắt đầu crawl
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </>
  )
}
