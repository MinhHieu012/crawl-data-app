import { Group, Pagination, Text, TextInput } from '@mantine/core'
import { useDebouncedCallback } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'

import { formatNumber } from '../utils/format'

interface SearchInputProps {
  /** Giá trị đang áp dụng (thường lấy từ URL). */
  value: string
  /** Gọi sau khi người dùng ngừng gõ 300 ms — không gửi request cho từng phím. */
  onSearch: (value: string) => void
  label: string
  placeholder?: string
}

export function SearchInput({ value, onSearch, label, placeholder }: SearchInputProps) {
  const [text, setText] = useState(value)
  const search = useDebouncedCallback(onSearch, 300)

  return (
    <TextInput
      type="search"
      aria-label={label}
      placeholder={placeholder ?? label}
      leftSection={<IconSearch size={16} />}
      value={text}
      onChange={(event) => {
        setText(event.currentTarget.value)
        search(event.currentTarget.value.trim())
      }}
      style={{ flex: '1 1 220px' }}
    />
  )
}

interface PagerProps {
  total: number
  page: number
  pageSize: number
  onChange: (page: number) => void
}

// Hai nút mũi tên của phân trang chỉ có icon nên cần tên cho trình đọc màn hình.
const PAGE_CONTROL_LABEL = {
  first: 'Trang đầu',
  previous: 'Trang trước',
  next: 'Trang sau',
  last: 'Trang cuối',
}

/** Dòng "1–20 trong 1.245" kèm nút chuyển trang (ẩn khi chỉ có một trang). */
export function Pager({ total, page, pageSize, onChange }: PagerProps) {
  const pages = Math.ceil(total / pageSize)
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <Group justify="space-between" mt="md" gap="sm">
      <Text size="sm" c="dimmed">
        {total === 0
          ? 'Không có dòng nào'
          : `${formatNumber(first)}–${formatNumber(last)} trong ${formatNumber(total)}`}
      </Text>
      {pages > 1 && (
        <Pagination
          total={pages}
          value={page}
          onChange={onChange}
          size="sm"
          getControlProps={(control) => ({ 'aria-label': PAGE_CONTROL_LABEL[control] })}
        />
      )}
    </Group>
  )
}
