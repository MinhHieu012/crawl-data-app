import { Badge, Button, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconArrowRight, type Icon } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface CrawlerCardProps {
  icon: Icon
  title: string
  description: string
  to: string
  /** Backend đã có crawler này chưa. */
  ready: boolean
  /** Dòng phụ dưới mô tả: các loại dữ liệu, số liệu thật… */
  children?: ReactNode
}

/** Thẻ của một crawler module hoặc một loại dữ liệu trên các trang tổng quan. */
export function CrawlerCard({
  icon: CardIcon,
  title,
  description,
  to,
  ready,
  children,
}: CrawlerCardProps) {
  const { t } = useTranslation()
  return (
    <Card withBorder padding="lg" h="100%">
      <Stack gap="sm" h="100%">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon size={40} variant="light" color={ready ? undefined : 'gray'} aria-hidden>
              <CardIcon size={22} stroke={1.6} />
            </ThemeIcon>
            <Title order={2} size="h4" style={{ overflowWrap: 'anywhere' }}>
              {title}
            </Title>
          </Group>
          <Badge color={ready ? 'teal' : 'gray'} variant="light" style={{ flexShrink: 0 }}>
            {ready ? t('card.ready') : t('card.notReady')}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
        {children}
        <Button
          component={Link}
          to={to}
          variant={ready ? 'filled' : 'default'}
          rightSection={<IconArrowRight size={16} />}
          aria-label={t('card.openNamed', { title })}
          mt="auto"
          style={{ alignSelf: 'flex-start' }}
        >
          {t('card.open')}
        </Button>
      </Stack>
    </Card>
  )
}
