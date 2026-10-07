import { NativeSelect, SimpleGrid, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useTranslation } from 'react-i18next'

import type { BugSeverity } from '../../api/types'
import { BUG_SEVERITY } from '../../components/StatusBadge'
import { FeedbackForm } from './FeedbackForm'
import { blankToNull, type CommonFields, commonRules } from './form'

interface BugForm extends CommonFields {
  area: string
  severity: BugSeverity
}

export function BugReportPage() {
  const { t } = useTranslation()
  const form = useForm<BugForm>({
    initialValues: { title: '', area: '', severity: 'medium', description: '', contact: '' },
    validate: commonRules(t('feedback.validation.title')),
  })

  return (
    <FeedbackForm
      form={form}
      title={t('feedback.bug.title')}
      description={t('feedback.bug.description')}
      submitLabel={t('feedback.bug.submit')}
      sentMessage={(id) => t('feedback.bug.sent', { id })}
      descriptionPlaceholder={t('feedback.fields.bugPlaceholder')}
      toBody={(values) => ({
        type: 'bug_report',
        title: values.title.trim(),
        area: blankToNull(values.area),
        severity: values.severity,
        description: values.description.trim(),
        contact: blankToNull(values.contact),
      })}
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label={t('feedback.fields.area')}
          placeholder={t('feedback.fields.areaPlaceholder')}
          maxLength={200}
          {...form.getInputProps('area')}
        />
        <NativeSelect
          label={t('feedback.fields.severity')}
          data={Object.entries(BUG_SEVERITY).map(([value, look]) => ({
            value,
            label: look.label ? t(look.label) : value,
          }))}
          {...form.getInputProps('severity')}
        />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {t('feedback.attachmentNote')}
      </Text>
    </FeedbackForm>
  )
}
