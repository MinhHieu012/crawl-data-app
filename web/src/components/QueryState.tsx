import { Alert, Box, Button, Center, Group, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconAlertTriangle, IconInbox } from '@tabler/icons-react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { errorMessage } from '../utils/notify'

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Stack gap="sm" role="status" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={36} radius="sm" />
      ))}
    </Stack>
  )
}

interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={420}>
        <ThemeIcon size={48} radius="xl" variant="light" color="gray" aria-hidden>
          <IconInbox size={26} stroke={1.5} />
        </ThemeIcon>
        <Text fw={600} ta="center">
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed" ta="center" style={{ overflowWrap: 'anywhere' }}>
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </Center>
  )
}

interface ErrorStateProps {
  error: unknown
  onRetry: () => void
  retrying?: boolean
}

export function ErrorState({ error, onRetry, retrying }: ErrorStateProps) {
  return (
    <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Không tải được dữ liệu">
      <Text size="sm">{errorMessage(error)}</Text>
      <Button mt="sm" size="xs" variant="light" color="red" onClick={onRetry} loading={retrying}>
        Thử lại
      </Button>
    </Alert>
  )
}

interface QueryStateProps<T> {
  query: UseQueryResult<T>
  children: (data: T) => ReactNode
  /** Mặc định là vài dòng skeleton; truyền vào khi trang có bố cục riêng. */
  skeleton?: ReactNode
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
}

/**
 * Các trạng thái mà trang nào cũng phải có, gom về một chỗ: đang tải lần đầu (skeleton), lỗi (kèm
 * nút thử lại), trống, và đang tải lại sau khi đổi trang/bộ lọc (dữ liệu cũ mờ đi tới khi có dữ
 * liệu mới). Đã có dữ liệu mà lần làm mới sau đó thất bại (ví dụ backend vừa tắt giữa lúc đang theo
 * dõi job) thì vẫn giữ dữ liệu cũ và chỉ cảnh báo, không xoá trắng màn hình.
 */
export function QueryState<T>({ query, children, skeleton, isEmpty, empty }: QueryStateProps<T>) {
  const retry = () => void query.refetch()

  if (query.data === undefined) {
    if (query.isError) {
      return <ErrorState error={query.error} onRetry={retry} retrying={query.isFetching} />
    }
    return <>{skeleton ?? <ListSkeleton />}</>
  }

  const reloading = query.isPlaceholderData
  return (
    <>
      {query.isError && (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />} mb="md">
          <Group justify="space-between" gap="xs">
            <Text size="sm">
              Không cập nhật được dữ liệu mới, đang hiển thị dữ liệu cũ. {errorMessage(query.error)}
            </Text>
            <Button size="xs" variant="light" color="yellow" onClick={retry}>
              Thử lại
            </Button>
          </Group>
        </Alert>
      )}
      <Box
        aria-busy={reloading || undefined}
        style={{ opacity: reloading ? 0.55 : 1, transition: 'opacity 150ms' }}
      >
        {isEmpty?.(query.data)
          ? (empty ?? <EmptyState title="Chưa có dữ liệu" />)
          : children(query.data)}
      </Box>
    </>
  )
}
