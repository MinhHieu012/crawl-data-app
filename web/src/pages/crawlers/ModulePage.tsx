import { Button, SimpleGrid } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router'

import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/QueryState'
import { categoryPath, CRAWLERS_PATH } from '../../crawlers/paths'
import { CRAWLER_MODULES } from '../../crawlers/registry'
import { CrawlerCard } from './CrawlerCard'

/** Trang tổng quan của một crawler module: mỗi loại dữ liệu một thẻ. */
export function ModulePage() {
  const { t } = useTranslation()
  const { moduleId } = useParams()
  const crawler = CRAWLER_MODULES.find((item) => item.id === moduleId)

  if (!crawler) {
    return (
      <EmptyState
        title={t('module.notFound.title')}
        description={t('module.notFound.description')}
        action={
          <Button component={Link} to={CRAWLERS_PATH} variant="light">
            {t('module.notFound.action')}
          </Button>
        }
      />
    )
  }
  // Chỉ một loại dữ liệu: trang chọn loại là thừa, vào thẳng khu vực quản lý.
  if (crawler.categories.length === 1) {
    return <Navigate to={categoryPath(crawler.id, crawler.categories[0].id)} replace />
  }

  return (
    <>
      <PageHeader
        title={t(crawler.name)}
        description={t(crawler.description)}
        crumbs={[{ label: t('common.crawlers'), to: CRAWLERS_PATH }, { label: t(crawler.name) }]}
      />
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
        {crawler.categories.map((category) => (
          <CrawlerCard
            key={category.id}
            icon={category.icon}
            title={t(category.name)}
            description={t(category.description)}
            to={categoryPath(crawler.id, category.id)}
            ready={Boolean(category.sections)}
          >
            {category.Summary && <category.Summary />}
          </CrawlerCard>
        ))}
      </SimpleGrid>
    </>
  )
}
