import {
  Anchor,
  Button,
  Card,
  Group,
  NativeSelect,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { IconDeviceFloppy, IconTrash } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { useAdminFeedback, useDeleteFeedback, useUpdateFeedback } from '../../api/queries'
import type { AdminFeedback, FeedbackStatus } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import {
  FEEDBACK_STATUS,
  FeedbackStatusBadge,
  FeedbackTypeBadge,
  SeverityBadge,
} from '../../components/StatusBadge'
import { useAdminToken } from '../../hooks/useAdminToken'
import type { I18nKey } from '../../i18n'
import { formatDateTime } from '../../utils/format'
import { notifyError, notifySuccess } from '../../utils/notify'
import { ADMIN_FEEDBACK_PATH } from '../feedback/paths'
import { AdminGate, LogoutButton } from './AdminGate'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text component="div" size="sm" style={{ overflowWrap: 'anywhere' }}>
        {children}
      </Text>
    </div>
  )
}

function Content({ item }: { item: AdminFeedback }) {
  const { t } = useTranslation()
  const none = t('admin.detail.none')
  const { area, severity, url, data_type: dataType } = item.details

  return (
    <Card withBorder>
      <Stack gap="md">
        <Group gap="xs">
          <FeedbackTypeBadge type={item.type} />
          <FeedbackStatusBadge status={item.status} />
          {severity && <SeverityBadge severity={severity} />}
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {item.type === 'bug_report' ? (
            <Field label={t('feedback.fields.area')}>{area ?? none}</Field>
          ) : (
            <>
              <Field label={t('feedback.fields.url')}>
                {url ? (
                  <Anchor href={url} target="_blank" rel="noopener noreferrer nofollow">
                    {url}
                  </Anchor>
                ) : (
                  none
                )}
              </Field>
              <Field label={t('feedback.fields.dataType')}>
                {dataType ? t(`feedback.dataTypes.${dataType}` as I18nKey) : none}
              </Field>
            </>
          )}
          <Field label={t('admin.detail.contact')}>{item.contact ?? none}</Field>
          <Field label={t('admin.detail.reporter')}>
            <span title={t('admin.detail.reporterHint')}>
              {item.reporter ?? t('admin.anonymous')}
            </span>
          </Field>
          <Field label={t('admin.detail.created')}>{formatDateTime(item.created_at)}</Field>
          <Field label={t('admin.detail.updated')}>{formatDateTime(item.updated_at)}</Field>
        </SimpleGrid>
        <Field label={t('feedback.fields.description')}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {item.description}
          </Text>
        </Field>
      </Stack>
    </Card>
  )
}

interface HandleForm {
  status: FeedbackStatus
  response: string
}

function Handle({ item }: { item: AdminFeedback }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const update = useUpdateFeedback()
  const remove = useDeleteFeedback()
  const current = { status: item.status, response: item.response ?? '' }
  const form = useForm<HandleForm>({ initialValues: current })

  const save = form.onSubmit((values) =>
    update.mutate(
      { id: item.id, status: values.status, response: values.response.trim() || null },
      {
        onSuccess: (saved) => {
          const next = { status: saved.status, response: saved.response ?? '' }
          form.setValues(next)
          form.resetDirty(next)
          notifySuccess(t('admin.detail.saved', { id: saved.id }))
        },
        onError: (error) => notifyError(error, t('admin.detail.saveFailed')),
      },
    ),
  )

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t('admin.detail.deleteConfirm.title', { id: item.id }),
      children: <Text size="sm">{t('admin.detail.deleteConfirm.body')}</Text>,
      labels: {
        confirm: t('admin.detail.deleteConfirm.confirm'),
        cancel: t('admin.detail.deleteConfirm.cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(item.id, {
          onSuccess: () => {
            notifySuccess(t('admin.detail.deleted', { id: item.id }))
            navigate(ADMIN_FEEDBACK_PATH)
          },
          onError: (error) => notifyError(error, t('admin.detail.deleteFailed')),
        }),
    })

  return (
    <Card withBorder>
      <form onSubmit={save} noValidate>
        <Stack gap="md">
          <Title order={2} size="h4">
            {t('admin.detail.handle')}
          </Title>
          <NativeSelect
            label={t('common.status')}
            data={Object.entries(FEEDBACK_STATUS).map(([value, look]) => ({
              value,
              label: look.label ? t(look.label) : value,
            }))}
            disabled={update.isPending}
            {...form.getInputProps('status')}
          />
          <Textarea
            label={t('admin.detail.response')}
            description={t('admin.detail.responseHint')}
            autosize
            minRows={3}
            maxRows={10}
            maxLength={5000}
            disabled={update.isPending}
            {...form.getInputProps('response')}
          />
          <Group justify="space-between">
            <Button
              variant="light"
              color="red"
              leftSection={<IconTrash size={16} />}
              loading={remove.isPending}
              onClick={confirmDelete}
            >
              {t('admin.detail.delete')}
            </Button>
            <Group gap="sm">
              {form.isDirty() && (
                <Text size="sm" c="dimmed">
                  {t('admin.detail.unsaved')}
                </Text>
              )}
              <Button
                type="submit"
                loading={update.isPending}
                disabled={!form.isDirty()}
                leftSection={<IconDeviceFloppy size={16} />}
              >
                {t('admin.detail.save')}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Card>
  )
}

function Detail({ id }: { id: number }) {
  const feedback = useAdminFeedback(id)
  return (
    <QueryState query={feedback} skeleton={<Skeleton height={360} radius="md" />}>
      {(item) => (
        <Stack gap="md" maw={860}>
          <Title order={2} size="h3" style={{ overflowWrap: 'anywhere' }}>
            {item.title}
          </Title>
          <Content item={item} />
          {/* `key`: lưu xong hoặc dữ liệu đổi từ nơi khác thì form dựng lại theo giá trị mới. */}
          <Handle key={`${item.id}-${item.updated_at}`} item={item} />
        </Stack>
      )}
    </QueryState>
  )
}

/** Chi tiết một góp ý (chỉ quản trị viên): nội dung đầy đủ, đổi trạng thái, phản hồi, xoá. */
export function AdminFeedbackDetailPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const token = useAdminToken()
  const title = t('admin.detail.title', { id })

  return (
    <>
      <PageHeader
        title={title}
        crumbs={[{ label: t('admin.title'), to: ADMIN_FEEDBACK_PATH }, { label: title }]}
        actions={token && <LogoutButton />}
      />
      <AdminGate>
        <Detail id={id} />
      </AdminGate>
    </>
  )
}
