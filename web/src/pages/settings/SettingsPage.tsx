import {
  Alert,
  Button,
  Fieldset,
  Group,
  NativeSelect,
  NumberInput,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { IconInfoCircle } from '@tabler/icons-react'
import { Trans, useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { useSettings, useUpdateSettings } from '../../api/queries'
import type { Settings, SettingsUpdate } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { notifyError, notifySuccess } from '../../utils/notify'

function editable(settings: Settings): SettingsUpdate {
  return {
    http: settings.http,
    crawler: { content_format: settings.crawler.content_format },
    log: { level: settings.log.level },
  }
}

/** Ô số bị xoá trắng cho ra chuỗi rỗng, nên phải kiểm tra cả kiểu chứ không chỉ khoảng giá trị. */
const between = (min: number, max: number, message: string) => (value: unknown) =>
  typeof value === 'number' && value >= min && value <= max ? null : message

function SettingsForm({ settings }: { settings: Settings }) {
  const { t } = useTranslation()
  const update = useUpdateSettings()
  // Giới hạn ở đây chỉ để báo lỗi sớm; backend mới là nơi quyết định (cùng quy tắc với file .env).
  const form = useForm<SettingsUpdate>({
    initialValues: editable(settings),
    validate: {
      http: {
        user_agent: (value) => (value.trim() ? null : t('settings.validation.required')),
        request_timeout: between(0.1, 600, t('settings.validation.timeout')),
        max_retries: between(0, 10, t('settings.validation.retries')),
        concurrency: between(1, 8, t('settings.validation.concurrency')),
        request_delay: between(0.5, 3600, t('settings.validation.delay')),
      },
    },
  })

  const save = form.onSubmit(
    (values) =>
      update.mutate(values, {
        onSuccess: (saved) => {
          // Hiện đúng giá trị backend đang dùng (có thể khác giá trị vừa gửi nếu bị biến môi trường
          // ghi đè). Form bị khoá trong lúc lưu nên không ghi đè lên thứ người dùng đang gõ dở.
          form.setValues(editable(saved))
          form.resetDirty(editable(saved))
          notifySuccess(t('settings.saved'))
        },
        onError: (error) => {
          if (error instanceof ApiError) form.setErrors(error.fields)
          notifyError(error, t('settings.saveFailed'))
        },
      }),
    // Còn ô sai thì đưa con trỏ tới ô sai đầu tiên, không chỉ hiện chữ đỏ.
    (errors) => form.getInputNode(Object.keys(errors)[0] ?? '')?.focus(),
  )

  return (
    <form onSubmit={save} noValidate>
      <Stack gap="lg" maw={860}>
        <Alert color="blue" icon={<IconInfoCircle size={18} />}>
          <Trans
            i18nKey="settings.envNote"
            values={{ file: settings.env_file }}
            components={{ b: <b style={{ overflowWrap: 'anywhere' }} /> }}
          />
        </Alert>

        <Fieldset legend="HTTP client" disabled={update.isPending}>
          <Stack gap="md">
            <TextInput
              label="User-Agent"
              description={t('settings.userAgentHint')}
              {...form.getInputProps('http.user_agent')}
            />
            {/* Hai cột từ `md`: hẹp hơn thì nhãn dài xuống dòng, đẩy lệch ô nhập bên cạnh. */}
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <NumberInput
                label={t('settings.delay.label')}
                description={t('settings.delay.description')}
                min={0.5}
                step={0.5}
                {...form.getInputProps('http.request_delay')}
              />
              <NumberInput
                label={t('settings.concurrency.label')}
                description={t('settings.concurrency.description')}
                min={1}
                max={8}
                allowDecimal={false}
                {...form.getInputProps('http.concurrency')}
              />
              <NumberInput
                label={t('settings.timeout')}
                min={1}
                {...form.getInputProps('http.request_timeout')}
              />
              <NumberInput
                label={t('settings.retries.label')}
                description={t('settings.retries.description')}
                min={0}
                max={10}
                allowDecimal={false}
                {...form.getInputProps('http.max_retries')}
              />
            </SimpleGrid>
          </Stack>
        </Fieldset>

        <Fieldset legend={t('settings.crawlerAndLog')} disabled={update.isPending}>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <NativeSelect
              label={t('settings.contentFormat.label')}
              description={t('settings.contentFormat.description')}
              data={[
                { value: 'html', label: t('settings.contentFormat.html') },
                { value: 'markdown', label: 'Markdown' },
              ]}
              {...form.getInputProps('crawler.content_format')}
            />
            <NativeSelect
              label={t('logs.level')}
              description={t('settings.logLevelHint')}
              data={['DEBUG', 'INFO', 'WARNING', 'ERROR']}
              {...form.getInputProps('log.level')}
            />
          </SimpleGrid>
        </Fieldset>

        <Fieldset legend={t('settings.readOnly.legend')}>
          <Text size="sm" c="dimmed" mb="sm">
            {t('settings.readOnly.note')}
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TextInput
              label="Database"
              description={t('settings.readOnly.passwordHidden')}
              value={settings.database_url}
              readOnly
            />
            <TextInput label={t('settings.readOnly.logDir')} value={settings.log.dir} readOnly />
          </SimpleGrid>
        </Fieldset>

        <Group justify="flex-end">
          {form.isDirty() && (
            <Text size="sm" c="dimmed">
              {t('settings.unsaved')}
            </Text>
          )}
          <Button variant="default" disabled={!form.isDirty()} onClick={form.reset}>
            {t('settings.undo')}
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!form.isDirty()}>
            {t('settings.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useSettings()

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      {/* Mỗi nhóm cài đặt đã là một khung (Fieldset) nên không bọc thêm Card: hai lớp viền chỉ tốn chỗ. */}
      <QueryState query={settings} skeleton={<Skeleton height={420} radius="md" />}>
        {(data) => <SettingsForm settings={data} />}
      </QueryState>
    </>
  )
}
