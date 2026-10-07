import { NativeSelect, SimpleGrid, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useTranslation } from 'react-i18next'

import type { CrawlerDataType } from '../../api/types'
import { isHttpUrl } from '../../utils/format'
import { FeedbackForm } from './FeedbackForm'
import { blankToNull, type CommonFields, commonRules } from './form'

interface CrawlerForm extends CommonFields {
  url: string
  data_type: CrawlerDataType
}

const DATA_TYPES: CrawlerDataType[] = ['novel', 'aviation', 'geography', 'other']

export function CrawlerRequestPage() {
  const { t } = useTranslation()
  const form = useForm<CrawlerForm>({
    initialValues: { title: '', url: '', data_type: 'other', description: '', contact: '' },
    validate: {
      ...commonRules(t('feedback.validation.sourceName')),
      url: (value) => (isHttpUrl(value.trim()) ? null : t('feedback.validation.url')),
    },
  })

  return (
    <FeedbackForm
      form={form}
      title={t('feedback.crawler.title')}
      description={t('feedback.crawler.description')}
      submitLabel={t('feedback.crawler.submit')}
      sentMessage={(id) => t('feedback.crawler.sent', { id })}
      titleLabel={t('feedback.fields.sourceName')}
      titlePlaceholder={t('feedback.fields.sourceNamePlaceholder')}
      descriptionPlaceholder={t('feedback.fields.needPlaceholder')}
      toBody={(values) => ({
        type: 'crawler_request',
        title: values.title.trim(),
        url: values.url.trim(),
        data_type: values.data_type,
        description: values.description.trim(),
        contact: blankToNull(values.contact),
      })}
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label={t('feedback.fields.url')}
          placeholder="https://example.com"
          type="url"
          required
          maxLength={1000}
          {...form.getInputProps('url')}
        />
        <NativeSelect
          label={t('feedback.fields.dataType')}
          data={DATA_TYPES.map((value) => ({ value, label: t(`feedback.dataTypes.${value}`) }))}
          {...form.getInputProps('data_type')}
        />
      </SimpleGrid>
    </FeedbackForm>
  )
}
