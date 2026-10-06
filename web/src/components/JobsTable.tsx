import { Anchor, Box, Group, Stack, Table, Text, useMatches } from '@mantine/core'
import { Link } from 'react-router'

import type { Job } from '../api/types'
import { recordCounts, formatDateTime, jobScope, jobTitle } from '../utils/format'
import { JobProgress } from './JobProgress'
import { JobStatusBadge } from './StatusBadge'

/**
 * Bảng job dùng chung cho Tổng quan, trang Job và lịch sử crawl của một truyện. Màn hình hẹp hơn
 * `lg` không đủ chỗ cho sáu cột: trạng thái, tiến độ, phạm vi và giờ bắt đầu dồn xuống dưới tên
 * truyện, không bắt người dùng cuộn ngang mới thấy job chạy tới đâu.
 */
export function JobsTable({ jobs }: { jobs: Job[] }) {
  const wide = useMatches({ base: false, lg: true }, { getInitialValueInEffect: false })

  return (
    <Table verticalSpacing="sm" highlightOnHover layout="fixed">
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={64}>Job</Table.Th>
          <Table.Th>Nội dung</Table.Th>
          {wide && (
            <>
              <Table.Th w={140}>Phạm vi</Table.Th>
              <Table.Th w={220}>Tiến độ</Table.Th>
              <Table.Th w={150}>Trạng thái</Table.Th>
              <Table.Th w={130}>Bắt đầu</Table.Th>
            </>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {jobs.map((job) => {
          const title = jobTitle(job)
          const started = formatDateTime(job.started_at)
          return (
            <Table.Tr key={job.id}>
              <Table.Td style={{ verticalAlign: wide ? undefined : 'top' }}>
                <Anchor component={Link} to={`/jobs/${job.id}`} size="sm" fw={600}>
                  #{job.id}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Anchor
                  component={Link}
                  to={`/jobs/${job.id}`}
                  c="inherit"
                  size="sm"
                  lineClamp={wide ? 1 : 2}
                  title={title}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {title}
                </Anchor>
                {job.result && (
                  <Text size="xs" c="dimmed" lineClamp={wide ? 1 : 2}>
                    {recordCounts(job.result)}
                  </Text>
                )}
                {job.error && (
                  <Text size="xs" c="red" lineClamp={wide ? 1 : 2} title={job.error}>
                    {job.error}
                  </Text>
                )}
                {!wide && (
                  <Stack gap={6} mt={6}>
                    <Group gap="xs">
                      <JobStatusBadge status={job.status} />
                      <Text size="xs" c="dimmed">
                        {jobScope(job)} · {started}
                      </Text>
                    </Group>
                    <Box maw={360}>
                      <JobProgress job={job} />
                    </Box>
                  </Stack>
                )}
              </Table.Td>
              {wide && (
                <>
                  <Table.Td>
                    <Text size="sm">{jobScope(job)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <JobProgress job={job} />
                  </Table.Td>
                  <Table.Td>
                    <JobStatusBadge status={job.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {started}
                    </Text>
                  </Table.Td>
                </>
              )}
            </Table.Tr>
          )
        })}
      </Table.Tbody>
    </Table>
  )
}
