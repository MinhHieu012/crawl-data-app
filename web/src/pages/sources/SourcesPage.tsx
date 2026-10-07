import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { IconInfoCircle, IconPlugConnected } from '@tabler/icons-react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useSettings, useSources, useTestSource, useToggleSource } from '../../api/queries'
import type { Source } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { novelPaths } from '../../crawlers/paths'
import { formatNumber } from '../../utils/format'
import { notifyError, notifySuccess } from '../../utils/notify'

/** Thông tin crawler và cấu hình HTTP đang áp dụng cho nguồn (cấu hình là chung cho mọi nguồn). */
function SourceInfo({ source }: { source: Source }) {
  const { t } = useTranslation()
  const settings = useSettings()
  return (
    <Stack gap="md">
      <Text size="sm">{source.description || t('sources.noDescription')}</Text>
      <Table variant="vertical" withTableBorder layout="fixed">
        <Table.Tbody>
          <Table.Tr>
            <Table.Th w="40%">{t('sources.domains')}</Table.Th>
            <Table.Td>{source.domains.join(', ')}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>{t('sources.testPage')}</Table.Th>
            <Table.Td>https://{source.domains[0]}/</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      <QueryState query={settings}>
        {({ http }) => (
          <Table variant="vertical" withTableBorder layout="fixed">
            <Table.Tbody>
              <Table.Tr>
                <Table.Th w="40%">{t('sources.delay')}</Table.Th>
                <Table.Td>{t('common.seconds', { value: http.request_delay })}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>{t('settings.concurrency.label')}</Table.Th>
                <Table.Td>{http.concurrency}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>{t('sources.timeoutRetries')}</Table.Th>
                <Table.Td>
                  {t('sources.timeoutRetriesValue', {
                    timeout: http.request_timeout,
                    retries: http.max_retries,
                  })}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>User-Agent</Table.Th>
                <Table.Td style={{ overflowWrap: 'anywhere' }}>{http.user_agent}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        )}
      </QueryState>
      <Text size="xs" c="dimmed">
        <Trans
          i18nKey="sources.robotsNote"
          components={{ settings: <Anchor component={Link} to="/settings" inherit /> }}
        />
      </Text>
    </Stack>
  )
}

function SourceCard({ source }: { source: Source }) {
  const { t } = useTranslation()
  const toggle = useToggleSource()
  const test = useTestSource()
  const [infoOpened, info] = useDisclosure()

  const setEnabled = (enabled: boolean) =>
    toggle.mutate(
      { name: source.name, enabled },
      {
        onSuccess: () =>
          notifySuccess(t(enabled ? 'sources.enabled' : 'sources.disabled', { name: source.name })),
        onError: (error) => notifyError(error),
      },
    )

  const onToggle = (enabled: boolean) => {
    if (enabled) return setEnabled(true)
    modals.openConfirmModal({
      title: t('sources.disableConfirm.title', { name: source.name }),
      children: <Text size="sm">{t('sources.disableConfirm.body')}</Text>,
      labels: {
        confirm: t('sources.disableConfirm.confirm'),
        cancel: t('sources.disableConfirm.cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => setEnabled(false),
    })
  }

  return (
    <Card withBorder>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="xs">
            <Title order={2} size="h4">
              {source.name}
            </Title>
            <Badge color={source.enabled ? 'teal' : 'gray'} variant="light">
              {source.enabled ? t('sources.on') : t('sources.off')}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {source.domains.join(' · ')}
          </Text>
        </div>
        <Switch
          label={t('sources.allowCrawl')}
          checked={source.enabled}
          disabled={toggle.isPending}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
      </Group>

      <Group gap="xl" mt="md">
        <div>
          <Text size="xs" c="dimmed">
            {t('sources.novelsCrawled')}
          </Text>
          <Text fw={700} fz="xl">
            {formatNumber(source.novels)}
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            {t('chapters.done')}
          </Text>
          <Text fw={700} fz="xl">
            {formatNumber(source.chapters_done)}
          </Text>
        </div>
      </Group>

      <Group gap="xs" mt="md">
        <Button
          variant="default"
          leftSection={<IconPlugConnected size={16} />}
          loading={test.isPending}
          onClick={() => test.mutate(source.name)}
        >
          {t('sources.test')}
        </Button>
        <Button variant="subtle" leftSection={<IconInfoCircle size={16} />} onClick={info.open}>
          {t('sources.info')}
        </Button>
        <Button variant="subtle" component={Link} to={`${novelPaths.novels}?source=${source.name}`}>
          {t('sources.viewNovels')}
        </Button>
      </Group>

      {test.data && (
        <Alert
          mt="md"
          color={test.data.ok ? 'teal' : 'red'}
          title={test.data.ok ? t('sources.testOk') : t('sources.testFail')}
        >
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            {test.data.message}
          </Text>
          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {test.data.url} ·{' '}
            {t('sources.testElapsed', {
              seconds: formatNumber(Math.round(test.data.elapsed_ms / 100) / 10),
            })}
          </Text>
        </Alert>
      )}
      {test.isError && (
        <Alert mt="md" color="red" title={t('sources.testError')}>
          {test.error.message}
        </Alert>
      )}

      <Modal
        opened={infoOpened}
        onClose={info.close}
        title={t('sources.modalTitle', { name: source.name })}
        size="lg"
      >
        <SourceInfo source={source} />
      </Modal>
    </Card>
  )
}

export function SourcesPage() {
  const { t } = useTranslation()
  const sources = useSources()

  return (
    <>
      <PageHeader title={t('sources.title')} description={t('sources.description')} />
      <QueryState
        query={sources}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState title={t('sources.empty')} />}
      >
        {(data) => (
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            {data.map((source) => (
              <SourceCard key={source.name} source={source} />
            ))}
          </SimpleGrid>
        )}
      </QueryState>
    </>
  )
}
