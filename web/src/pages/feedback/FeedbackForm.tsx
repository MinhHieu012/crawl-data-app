import {
  Alert,
  Button,
  Card,
  Fieldset,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { IconAlertTriangle, IconSend } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { ApiError } from '../../api/client'
import { useCreateFeedback } from '../../api/queries'
import type { FeedbackCreate } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { notifySuccess } from '../../utils/notify'
import type { CommonFields } from './form'
import { FEEDBACK_PATH } from './paths'

interface FeedbackFormProps<T extends CommonFields> {
  form: UseFormReturnType<T>
  title: string
  description: string
  submitLabel: string
  /** Câu báo thành công, nhận số của góp ý vừa tạo. */
  sentMessage: (id: number) => string
  toBody: (values: T) => FeedbackCreate
  /** Ô mô tả: nhãn và gợi ý tuỳ loại góp ý. */
  descriptionPlaceholder: string
  /** Các ô riêng của loại góp ý, nằm giữa tiêu đề và mô tả. */
  children: ReactNode
  titleLabel?: string
  titlePlaceholder?: string
}

/**
 * Khung form góp ý dùng chung: tiêu đề, các ô riêng, mô tả, liên hệ, nút gửi. Gửi xong thì báo
 * thành công và quay về trang Góp ý (góp ý vừa gửi hiện ở "Góp ý bạn đã gửi").
 */
export function FeedbackForm<T extends CommonFields>({
  form,
  title,
  description,
  submitLabel,
  sentMessage,
  toBody,
  descriptionPlaceholder,
  children,
  titleLabel,
  titlePlaceholder,
}: FeedbackFormProps<T>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateFeedback()

  const submit = form.onSubmit(
    (values) =>
      create.mutate(toBody(values), {
        onSuccess: (item) => {
          notifySuccess(sentMessage(item.id))
          form.reset()
          navigate(FEEDBACK_PATH)
        },
        onError: (error) => {
          // Lỗi 422 theo từng ô ("bug_report.title" → ô "title") hiện ngay dưới ô đó.
          if (error instanceof ApiError) {
            for (const [field, message] of Object.entries(error.fields)) {
              form.setFieldError(field.split('.').pop() ?? field, message)
            }
          }
        },
      }),
    (errors) => form.getInputNode(Object.keys(errors)[0] ?? '')?.focus(),
  )

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        crumbs={[{ label: t('feedback.title'), to: FEEDBACK_PATH }, { label: title }]}
      />
      <Card withBorder maw={720}>
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            {/* Khoá mọi ô trong lúc gửi: không sửa được thứ đang trên đường tới máy chủ. */}
            <Fieldset variant="unstyled" disabled={create.isPending}>
              <Stack gap="md">
                <TextInput
                  label={titleLabel ?? t('feedback.fields.title')}
                  placeholder={titlePlaceholder ?? t('feedback.fields.titlePlaceholder')}
                  required
                  maxLength={200}
                  {...form.getInputProps('title')}
                />
                {children}
                <Textarea
                  label={t('feedback.fields.description')}
                  placeholder={descriptionPlaceholder}
                  required
                  autosize
                  minRows={4}
                  maxRows={12}
                  maxLength={5000}
                  {...form.getInputProps('description')}
                />
                <TextInput
                  label={t('feedback.fields.contact')}
                  description={t('feedback.fields.contactHint')}
                  maxLength={200}
                  {...form.getInputProps('contact')}
                />
              </Stack>
            </Fieldset>

            {create.isError && (
              <Alert
                color="red"
                icon={<IconAlertTriangle size={18} />}
                title={t('feedback.sendFailed')}
                role="alert"
              >
                <Text size="sm">{create.error.message}</Text>
              </Alert>
            )}

            <Group justify="space-between" align="center">
              <Button variant="default" onClick={() => navigate(FEEDBACK_PATH)}>
                {t('feedback.back')}
              </Button>
              <Button type="submit" loading={create.isPending} leftSection={<IconSend size={16} />}>
                {submitLabel}
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </>
  )
}
