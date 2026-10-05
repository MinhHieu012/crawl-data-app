import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from '@mantine/core'
import { useDocumentTitle } from '@mantine/hooks'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

export interface Crumb {
  label: string
  /** Bỏ trống ở mục cuối (trang hiện tại). */
  to?: string
}

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Đường dẫn từ sau "Tổng quan" tới trang hiện tại — chỉ cần cho trang con (chi tiết truyện, job…). */
  crumbs?: Crumb[]
  actions?: ReactNode
}

// Mỗi mục cắt một dòng (tên truyện dài không đẩy trang tràn ngang), di chuột xem tên đầy đủ.
// `lh`: Breadcrumbs của Mantine đặt line-height 1, cộng với cắt dòng thì xén mất dấu tiếng Việt.
const CRUMB = { size: 'sm', lh: 'md', truncate: 'end', maw: 'min(60vw, 22rem)' } as const

/** Đầu mỗi trang: breadcrumb (trang con), tiêu đề h1, và các nút hành động chính ở bên phải. */
export function PageHeader({ title, description, crumbs = [], actions }: PageHeaderProps) {
  useDocumentTitle(`${title} · Novel Crawler`)
  // Mục cuối trùng hẳn với tiêu đề ngay bên dưới (trang chi tiết truyện) thì bỏ: nói một lần là đủ.
  const trail: Crumb[] = [
    { label: 'Tổng quan', to: '/' },
    ...crumbs.filter((crumb) => crumb.to || crumb.label !== title),
  ]

  return (
    <Stack gap={6} mb="lg">
      {crumbs.length > 0 && (
        <Breadcrumbs
          separator="›"
          aria-label="Breadcrumb"
          styles={{
            root: { flexWrap: 'wrap', rowGap: 2 },
            separator: { color: 'var(--mantine-color-dimmed)' },
          }}
        >
          {trail.map((crumb) =>
            crumb.to ? (
              <Anchor
                key={crumb.label}
                component={Link}
                to={crumb.to}
                title={crumb.label}
                {...CRUMB}
              >
                {crumb.label}
              </Anchor>
            ) : (
              <Text key={crumb.label} c="dimmed" aria-current="page" title={crumb.label} {...CRUMB}>
                {crumb.label}
              </Text>
            ),
          )}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
          {/* Cỡ chữ h2, nhỏ hơn một bậc ở màn hẹp để tên truyện dài không chiếm hết màn hình. */}
          <Title
            order={1}
            size="h2"
            fz={{ base: 'h3', sm: 'h2' }}
            style={{ textWrap: 'balance', overflowWrap: 'anywhere' }}
          >
            {title}
          </Title>
          {description && (
            <Text c="dimmed" size="sm" mt={2}>
              {description}
            </Text>
          )}
        </div>
        {actions && <Group gap="xs">{actions}</Group>}
      </Group>
    </Stack>
  )
}
