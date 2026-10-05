import { Button, SimpleGrid } from '@mantine/core'
import { Link, Navigate, useParams } from 'react-router'

import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/QueryState'
import { categoryPath, CRAWLERS_PATH } from '../../crawlers/paths'
import { CRAWLER_MODULES } from '../../crawlers/registry'
import { CrawlerCard } from './CrawlerCard'

/** Trang tổng quan của một crawler module: mỗi loại dữ liệu một thẻ. */
export function ModulePage() {
  const { moduleId } = useParams()
  const crawler = CRAWLER_MODULES.find((item) => item.id === moduleId)

  if (!crawler) {
    return (
      <EmptyState
        title="Không có crawler này"
        description="Đường dẫn không đúng hoặc crawler đã được gỡ khỏi danh mục."
        action={
          <Button component={Link} to={CRAWLERS_PATH} variant="light">
            Xem tất cả crawler
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
        title={crawler.name}
        description={crawler.description}
        crumbs={[{ label: 'Crawler', to: CRAWLERS_PATH }, { label: crawler.name }]}
      />
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
        {crawler.categories.map((category) => (
          <CrawlerCard
            key={category.id}
            icon={category.icon}
            title={category.name}
            description={category.description}
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
