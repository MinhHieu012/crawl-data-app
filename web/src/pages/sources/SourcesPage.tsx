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
  const settings = useSettings()
  return (
    <Stack gap="md">
      <Text size="sm">{source.description || 'Crawler này chưa có mô tả.'}</Text>
      <Table variant="vertical" withTableBorder layout="fixed">
        <Table.Tbody>
          <Table.Tr>
            <Table.Th w="40%">Tên miền nhận diện</Table.Th>
            <Table.Td>{source.domains.join(', ')}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Trang kiểm tra kết nối</Table.Th>
            <Table.Td>https://{source.domains[0]}/</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      <QueryState query={settings}>
        {({ http }) => (
          <Table variant="vertical" withTableBorder layout="fixed">
            <Table.Tbody>
              <Table.Tr>
                <Table.Th w="40%">Khoảng nghỉ giữa hai request</Table.Th>
                <Table.Td>{http.request_delay} giây</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Request đồng thời tối đa</Table.Th>
                <Table.Td>{http.concurrency}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Timeout / số lần thử lại</Table.Th>
                <Table.Td>
                  {http.request_timeout} giây / {http.max_retries} lần
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
        Crawler luôn đọc robots.txt trước và dừng khi bị website từ chối. Sửa các thông số trên ở
        trang{' '}
        <Anchor component={Link} to="/settings" inherit>
          Cài đặt
        </Anchor>
        .
      </Text>
    </Stack>
  )
}

function SourceCard({ source }: { source: Source }) {
  const toggle = useToggleSource()
  const test = useTestSource()
  const [infoOpened, info] = useDisclosure()

  const setEnabled = (enabled: boolean) =>
    toggle.mutate(
      { name: source.name, enabled },
      {
        onSuccess: () => notifySuccess(`Đã ${enabled ? 'bật' : 'tắt'} nguồn ${source.name}`),
        onError: (error) => notifyError(error),
      },
    )

  const onToggle = (enabled: boolean) => {
    if (enabled) return setEnabled(true)
    modals.openConfirmModal({
      title: `Tắt nguồn ${source.name}?`,
      children: (
        <Text size="sm">
          Sẽ không tạo được job mới cho nguồn này cho tới khi bật lại. Job đang chạy và dữ liệu đã
          crawl không bị ảnh hưởng.
        </Text>
      ),
      labels: { confirm: 'Tắt nguồn', cancel: 'Giữ nguyên' },
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
              {source.enabled ? 'Đang bật' : 'Đang tắt'}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {source.domains.join(' · ')}
          </Text>
        </div>
        <Switch
          label="Cho phép crawl"
          checked={source.enabled}
          disabled={toggle.isPending}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
      </Group>

      <Group gap="xl" mt="md">
        <div>
          <Text size="xs" c="dimmed">
            Truyện đã crawl
          </Text>
          <Text fw={700} fz="xl">
            {formatNumber(source.novels)}
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Chương đã tải
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
          Kiểm tra kết nối
        </Button>
        <Button variant="subtle" leftSection={<IconInfoCircle size={16} />} onClick={info.open}>
          Thông tin và cấu hình
        </Button>
        <Button variant="subtle" component={Link} to={`${novelPaths.novels}?source=${source.name}`}>
          Xem truyện
        </Button>
      </Group>

      {test.data && (
        <Alert
          mt="md"
          color={test.data.ok ? 'teal' : 'red'}
          title={test.data.ok ? 'Kết nối được' : 'Không kết nối được'}
        >
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            {test.data.message}
          </Text>
          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {test.data.url} · {formatNumber(Math.round(test.data.elapsed_ms / 100) / 10)} giây (gồm
            cả thời gian giãn cách request)
          </Text>
        </Alert>
      )}
      {test.isError && (
        <Alert mt="md" color="red" title="Không kiểm tra được">
          {test.error.message}
        </Alert>
      )}

      <Modal opened={infoOpened} onClose={info.close} title={`Nguồn ${source.name}`} size="lg">
        <SourceInfo source={source} />
      </Modal>
    </Card>
  )
}

export function SourcesPage() {
  const sources = useSources()

  return (
    <>
      <PageHeader
        title="Nguồn truyện"
        description="Các website mà crawler đọc được. Thêm nguồn mới bằng cách viết crawler ở backend."
      />
      <QueryState
        query={sources}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState title="Backend chưa đăng ký crawler nào" />}
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
