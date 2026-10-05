import { Button, Card, Tabs } from '@mantine/core'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'

import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/QueryState'
import { categoryPath, CRAWLERS_PATH, modulePath } from '../crawlers/paths'
import type { CrawlerCategory, CrawlerModule } from '../crawlers/registry'

interface CategoryLayoutProps {
  crawler: CrawlerModule
  category: CrawlerCategory
}

/**
 * Khung chung của một category: tiêu đề, breadcrumb và các tab khai báo trong registry. Mỗi tab là
 * một route con nên tải lại trang hay gửi link vẫn mở đúng tab.
 */
export function CategoryLayout({ crawler, category }: CategoryLayoutProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const base = categoryPath(crawler.id, category.id)
  // Module chỉ có một category thì không có trang tổng quan riêng: khu vực này đại diện cho cả module.
  const single = crawler.categories.length === 1
  const title = single ? crawler.name : category.name
  const { sections } = category
  const active = sections?.find((section) => `${pathname}/`.startsWith(`${base}/${section.path}/`))

  const header = (
    <PageHeader
      title={title}
      documentTitle={active && `${active.label} · ${title}`}
      description={category.description}
      crumbs={[
        { label: 'Crawler', to: CRAWLERS_PATH },
        ...(single ? [] : [{ label: crawler.name, to: modulePath(crawler.id) }]),
        { label: title },
      ]}
    />
  )

  if (!sections) {
    return (
      <>
        {header}
        <Card withBorder>
          <EmptyState
            title="Crawler này chưa được triển khai"
            description={`Backend chưa có crawler và bảng dữ liệu cho “${category.name}”, nên chưa có job, dữ liệu hay log nào để hiển thị. Khi có, khu vực này sẽ gồm các tab: cấu hình crawl, job, dữ liệu, lịch sử và log.`}
            action={
              <Button component={Link} to={modulePath(crawler.id)} variant="light">
                Về {crawler.name}
              </Button>
            }
          />
        </Card>
      </>
    )
  }

  return (
    <>
      {header}
      <Tabs
        value={active?.path ?? null}
        onChange={(path) => path && navigate(`${base}/${path}`)}
        keepMounted={false}
      >
        <Tabs.List mb="md" aria-label={`Các mục của ${title}`}>
          {sections.map((section) => (
            <Tabs.Tab key={section.path} value={section.path}>
              {section.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {active ? (
          <Tabs.Panel value={active.path}>
            <Outlet context={{ inTab: true }} />
          </Tabs.Panel>
        ) : (
          <Outlet /> // đường dẫn gốc của category: route index chuyển sang tab đầu tiên
        )}
      </Tabs>
    </>
  )
}
