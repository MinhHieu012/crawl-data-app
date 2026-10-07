import {
  Anchor,
  Blockquote,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconArrowRight, IconBug, IconSpider, type Icon } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useMyFeedback } from '../../api/queries'
import type { Feedback } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { FeedbackStatusBadge, FeedbackTypeBadge } from '../../components/StatusBadge'
import { formatDateTime } from '../../utils/format'
import { ADMIN_FEEDBACK_PATH, BUG_REPORT_PATH, CRAWLER_REQUEST_PATH } from './paths'

interface ChoiceProps {
  icon: Icon
  color: string
  title: string
  description: string
  action: string
  to: string
}

function Choice({ icon: ChoiceIcon, color, title, description, action, to }: ChoiceProps) {
  return (
    <Card withBorder padding="lg" h="100%">
      <Stack gap="sm" h="100%">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={40} variant="light" color={color} aria-hidden>
            <ChoiceIcon size={22} stroke={1.6} />
          </ThemeIcon>
          <Title order={2} size="h4">
            {title}
          </Title>
        </Group>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
        <Button
          component={Link}
          to={to}
          rightSection={<IconArrowRight size={16} />}
          mt="auto"
          style={{ alignSelf: 'flex-start' }}
        >
          {action}
        </Button>
      </Stack>
    </Card>
  )
}

function MyFeedbackItem({ item }: { item: Feedback }) {
  const { t } = useTranslation()
  return (
    <Card withBorder padding="md">
      <Stack gap={6}>
        <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
          <Text fw={600} size="sm" style={{ overflowWrap: 'anywhere' }}>
            #{item.id} · {item.title}
          </Text>
          <FeedbackStatusBadge status={item.status} />
        </Group>
        <Group gap="xs">
          <FeedbackTypeBadge type={item.type} />
          <Text size="xs" c="dimmed">
            {t('feedback.mine.sentAt', { time: formatDateTime(item.created_at) })}
          </Text>
        </Group>
        {item.response && (
          <Blockquote p="sm" mt={4} cite={t('feedback.mine.response')}>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {item.response}
            </Text>
          </Blockquote>
        )}
      </Stack>
    </Card>
  )
}

/** Khu vực Góp ý: chọn loại góp ý cần gửi, và xem lại những góp ý đã gửi từ trình duyệt này. */
export function FeedbackPage() {
  const { t } = useTranslation()
  const mine = useMyFeedback()

  return (
    <>
      <PageHeader title={t('feedback.title')} description={t('feedback.description')} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} maw={860}>
        <Choice
          icon={IconBug}
          color="red"
          title={t('feedback.bug.title')}
          description={t('feedback.bug.cardDescription')}
          action={t('feedback.bug.button')}
          to={BUG_REPORT_PATH}
        />
        <Choice
          icon={IconSpider}
          color="grape"
          title={t('feedback.crawler.title')}
          description={t('feedback.crawler.cardDescription')}
          action={t('feedback.crawler.button')}
          to={CRAWLER_REQUEST_PATH}
        />
      </SimpleGrid>

      <Stack gap="sm" mt="xl" maw={860}>
        <div>
          <Title order={2} size="h4">
            {t('feedback.mine.title')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('feedback.mine.description')}
          </Text>
        </div>
        <QueryState
          query={mine}
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState
              title={t('feedback.mine.empty.title')}
              description={t('feedback.mine.empty.description')}
            />
          }
        >
          {(data) => (
            <Stack gap="sm">
              {data.map((item) => (
                <MyFeedbackItem key={item.id} item={item} />
              ))}
            </Stack>
          )}
        </QueryState>
        <Anchor component={Link} to={ADMIN_FEEDBACK_PATH} size="sm" c="dimmed" mt="md">
          {t('feedback.adminLink')}
        </Anchor>
      </Stack>
    </>
  )
}
