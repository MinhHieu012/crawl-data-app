import { Anchor, Code, Group, Table, Text, useMatches } from '@mantine/core'
import { Link } from 'react-router'

import type { LogEntry } from '../api/types'
import { formatLogTime } from '../utils/format'
import { LogLevelBadge } from './StatusBadge'

interface LogListProps {
  entries: LogEntry[]
  /** Ẩn liên kết tới job khi đang xem log của chính job đó. */
  showJob?: boolean
}

/**
 * Các dòng log, mới nhất ở trên; dòng lỗi kèm URL và traceback nếu có. Màn hình hẹp hơn `md` thì
 * giờ và mức log nằm trên nội dung thay vì chiếm hai cột — nội dung log là thứ cần chỗ nhất.
 */
export function LogList({ entries, showJob = true }: LogListProps) {
  const wide = useMatches({ base: false, md: true }, { getInitialValueInEffect: false })

  return (
    <Table verticalSpacing={6} striped layout="fixed" aria-label="Nhật ký">
      <Table.Tbody>
        {entries.map((entry, index) => {
          const time = (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {formatLogTime(entry.time)}
            </Text>
          )
          const level = <LogLevelBadge level={entry.level} />
          return (
            <Table.Tr key={`${entry.time}-${index}`}>
              {wide && (
                <>
                  <Table.Td w={130} style={{ verticalAlign: 'top' }}>
                    {time}
                  </Table.Td>
                  <Table.Td w={110} style={{ verticalAlign: 'top' }}>
                    {level}
                  </Table.Td>
                </>
              )}
              <Table.Td>
                {!wide && (
                  <Group gap="xs" mb={4}>
                    {level}
                    {time}
                  </Group>
                )}
                <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                  {entry.message}
                </Text>
                {((showJob && entry.run_id !== null) || entry.url) && (
                  <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                    {showJob && entry.run_id !== null && (
                      <Anchor component={Link} to={`/jobs/${entry.run_id}`} size="xs" mr="xs">
                        Job #{entry.run_id}
                      </Anchor>
                    )}
                    {entry.url}
                  </Text>
                )}
                {entry.exception && (
                  // Traceback tự xuống dòng: một dòng dài không được kéo cả bảng rộng ra.
                  <Code
                    block
                    mt={4}
                    fz="xs"
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {entry.exception}
                  </Code>
                )}
              </Table.Td>
            </Table.Tr>
          )
        })}
      </Table.Tbody>
    </Table>
  )
}
