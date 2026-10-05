import { Anchor, Card, Text } from '@mantine/core'
import { useHover } from '@mantine/hooks'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { formatNumber } from '../utils/format'

interface StatCardProps {
  label: string
  value: number
  hint?: ReactNode
  color?: string
  /** Bấm vào thẻ để tới danh sách tương ứng. */
  to?: string
}

/** Thẻ một con số (số truyện, số job đang chạy…) ở các trang tổng quan. */
export function StatCard({ label, value, hint, color, to }: StatCardProps) {
  // Thẻ bấm được (có `to`) đổi nền khi rê chuột, để phân biệt với thẻ chỉ để xem.
  const { hovered, ref } = useHover<HTMLDivElement>()
  const card = (
    <Card
      ref={ref}
      withBorder
      padding="md"
      h="100%"
      bg={to && hovered ? 'var(--mantine-color-default-hover)' : undefined}
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fz={28} fw={700} c={value > 0 ? color : undefined} lh={1.3}>
        {formatNumber(value)}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Card>
  )
  return to ? (
    <Anchor
      component={Link}
      to={to}
      underline="never"
      c="inherit"
      aria-label={`${label}: ${value}`}
    >
      {card}
    </Anchor>
  ) : (
    card
  )
}
