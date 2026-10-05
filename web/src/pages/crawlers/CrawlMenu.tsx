import { Button, Menu } from '@mantine/core'
import { IconChevronDown, IconPlus } from '@tabler/icons-react'
import { Fragment } from 'react'
import { Link } from 'react-router'

import { categoryPath } from '../../crawlers/paths'
import { CRAWLER_MODULES } from '../../crawlers/registry'

/**
 * Nút "Crawl" ở các trang chung của hệ thống: xổ danh sách crawler trong registry, chọn một mục là tới
 * tab bắt đầu crawl của crawler đó. Loại dữ liệu chưa có backend (không khai báo `sections`) không hiện.
 */
export function CrawlMenu() {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button leftSection={<IconPlus size={16} />} rightSection={<IconChevronDown size={16} />}>
          Crawl
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {CRAWLER_MODULES.map((crawler) => {
          const grouped = crawler.categories.length > 1
          const items = crawler.categories
            .filter((category) => category.sections)
            .map((category) => {
              const ItemIcon = grouped ? category.icon : crawler.icon
              const tab = category.crawlPath ?? category.sections?.[0].path
              return (
                <Menu.Item
                  key={category.id}
                  component={Link}
                  to={`${categoryPath(crawler.id, category.id)}/${tab}`}
                  leftSection={<ItemIcon size={16} stroke={1.6} />}
                >
                  {grouped ? category.name : crawler.name}
                </Menu.Item>
              )
            })
          return (
            <Fragment key={crawler.id}>
              {grouped && items.length > 0 && <Menu.Label>{crawler.name}</Menu.Label>}
              {items}
            </Fragment>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}
