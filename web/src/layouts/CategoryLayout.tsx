import { Button, Card, Tabs } from '@mantine/core'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const base = categoryPath(crawler.id, category.id)
  // Module chỉ có một category thì không có trang tổng quan riêng: khu vực này đại diện cho cả module.
  const single = crawler.categories.length === 1
  const title = t(single ? crawler.name : category.name)
  const { sections } = category
  const active = sections?.find((section) => `${pathname}/`.startsWith(`${base}/${section.path}/`))

  const header = (
    <PageHeader
      title={title}
      documentTitle={active && `${t(active.label)} · ${title}`}
      description={t(category.description)}
      crumbs={[
        { label: t('common.crawlers'), to: CRAWLERS_PATH },
        ...(single ? [] : [{ label: t(crawler.name), to: modulePath(crawler.id) }]),
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
            title={t('category.notReady.title')}
            description={t('category.notReady.description', { name: t(category.name) })}
            action={
              <Button component={Link} to={modulePath(crawler.id)} variant="light">
                {t('category.backTo', { name: t(crawler.name) })}
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
        <Tabs.List mb="md" aria-label={t('category.tabsLabel', { title })}>
          {sections.map((section) => (
            <Tabs.Tab key={section.path} value={section.path}>
              {t(section.label)}
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
