import { Button, Group, Paper, Skeleton, Stack, Text } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconDownload } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useChapter, useNovel } from '../../api/queries'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, QueryState } from '../../components/QueryState'
import { ChapterStatusBadge } from '../../components/StatusBadge'
import { useStartCrawl } from '../../hooks/useStartCrawl'
import { formatDateTime } from '../../utils/format'

interface StepButtonProps {
  to: string
  disabled: boolean
  children: ReactNode
  leftSection?: ReactNode
  rightSection?: ReactNode
}

/** Nút sang chương kề bên; ở đầu/cuối truyện thì là nút bị khoá thay vì một liên kết chết. */
function StepButton({ to, disabled, children, ...sections }: StepButtonProps) {
  return disabled ? (
    <Button variant="default" disabled {...sections}>
      {children}
    </Button>
  ) : (
    <Button variant="default" component={Link} to={to} {...sections}>
      {children}
    </Button>
  )
}

export function ChapterPage() {
  const params = useParams()
  const novelId = Number(params.id)
  const number = Number(params.number)
  const novel = useNovel(novelId)
  const chapter = useChapter(novelId, number)
  const { start, isPending } = useStartCrawl()

  const total = novel.data?.total_chapters ?? null
  const linkTo = (target: number) => `/novels/${novelId}/chapters/${target}`
  const steps = (
    <Group justify="space-between">
      <StepButton
        to={linkTo(number - 1)}
        disabled={number <= 1}
        leftSection={<IconChevronLeft size={16} />}
      >
        Chương trước
      </StepButton>
      <StepButton
        to={linkTo(number + 1)}
        disabled={total !== null && number >= total}
        rightSection={<IconChevronRight size={16} />}
      >
        Chương sau
      </StepButton>
    </Group>
  )

  return (
    <>
      <PageHeader
        title={chapter.data?.title ?? `Chương ${number}`}
        crumbs={[
          { label: 'Truyện', to: '/novels' },
          { label: novel.data?.title ?? `#${novelId}`, to: `/novels/${novelId}` },
          { label: `Chương ${number}` },
        ]}
      />
      <Stack maw={780} mx="auto" gap="md">
        {steps}
        <QueryState query={chapter} skeleton={<Skeleton height={420} radius="md" />}>
          {(data) =>
            data.paragraphs.length === 0 ? (
              <Paper withBorder p="md">
                <EmptyState
                  title="Chương này chưa được tải"
                  description={data.error ?? 'Nội dung chưa có trong database.'}
                  action={
                    <Button
                      leftSection={<IconDownload size={16} />}
                      loading={isPending}
                      disabled={!novel.data}
                      onClick={() =>
                        novel.data &&
                        start({ url: novel.data.url, from_chapter: number, to_chapter: number })
                      }
                    >
                      Tải chương này
                    </Button>
                  }
                />
              </Paper>
            ) : (
              <Paper withBorder p={{ base: 'md', sm: 'xl' }}>
                <Group gap="xs" mb="md">
                  <ChapterStatusBadge status={data.status} />
                  <Text size="xs" c="dimmed">
                    Tải lúc {formatDateTime(data.crawled_at)}
                  </Text>
                </Group>
                {data.paragraphs.map((paragraph, index) => (
                  <Text key={index} mb="md" lh={1.8}>
                    {paragraph}
                  </Text>
                ))}
              </Paper>
            )
          }
        </QueryState>
        {steps}
      </Stack>
    </>
  )
}
