// Danh mục crawler của giao diện. Menu, trang "Tất cả crawler", trang tổng quan của module và các
// route đều sinh ra từ đây: thêm crawler mới = thêm một module (hoặc một category) vào CRAWLER_MODULES.

import {
  IconBook2,
  IconBuildingBank,
  IconMapPin,
  IconPlane,
  IconPlaneDeparture,
  IconWorld,
  type Icon,
} from '@tabler/icons-react'
import type { ComponentType, ReactNode } from 'react'

import type { AviationKind, AviationSource } from '../api/types'
import type { I18nKey } from '../i18n'
import {
  AviationDataPage,
  AviationHistoryPage,
  AviationSummaryLine,
} from '../pages/aviation/AviationPages'
import { BankHistoryPage, BanksPage, BankSummaryLine } from '../pages/banks/BanksPages'
import { CrawlPage } from '../pages/crawl/CrawlPage'
import { JobsPage } from '../pages/jobs/JobsPage'
import { LogsPage } from '../pages/logs/LogsPage'
import { ChapterPage } from '../pages/novels/ChapterPage'
import { NovelDetailPage } from '../pages/novels/NovelDetailPage'
import { NovelOverview, NovelSummary } from '../pages/novels/NovelOverview'
import { NovelsPage } from '../pages/novels/NovelsPage'
import {
  ProvinceHistoryPage,
  ProvincesPage,
  ProvinceSummaryLine,
  WardsPage,
} from '../pages/provinces/ProvincesPages'
import { SourcesPage } from '../pages/sources/SourcesPage'
import { NOVEL } from './paths'

// Chữ hiển thị (`name`, `description`, `label`) khai báo bằng khoá dịch trong `locales/*.json`;
// nơi hiển thị gọi `t(khoá)` nên đổi ngôn ngữ là đổi theo.

/** Một tab trong khu vực quản lý của category. `path` nối sau đường dẫn của category. */
export interface CrawlerSection {
  path: string
  label: I18nKey
  element: ReactNode
}

/** Loại dữ liệu mà một crawler thu thập (truyện, sân bay, hãng bay…). */
export interface CrawlerCategory {
  id: string
  name: I18nKey
  description: I18nKey
  icon: Icon
  /**
   * Các tab của khu vực quản lý. Bỏ trống khi backend chưa có crawler này: giao diện báo
   * "chưa triển khai" chứ không dựng màn hình với số liệu giả.
   */
  sections?: CrawlerSection[]
  /** `path` của tab nơi bắt đầu một lần crawl (menu "Crawl" dẫn tới đó); mặc định là tab đầu tiên. */
  crawlPath?: string
  /** Trang con nằm ngoài các tab (chi tiết một bản ghi…), tự dựng tiêu đề và breadcrumb. */
  pages?: { path: string; element: ReactNode }[]
  /** Một dòng số liệu thật (lấy từ API) hiện trên thẻ của category. */
  Summary?: ComponentType
}

/** Một crawler độc lập (thường ứng với một nhà cung cấp dữ liệu), gồm một hay nhiều category. */
export interface CrawlerModule {
  id: string
  name: I18nKey
  description: I18nKey
  icon: Icon
  categories: CrawlerCategory[]
}

/**
 * Một nguồn dữ liệu hàng không: bốn tab dữ liệu dùng chung trang (chỉ khác `kind`) và tab lịch sử.
 * Tên và mô tả nằm ở khoá `registry.aviation.<source>`.
 */
function aviationCategory(id: string, source: AviationSource, icon: Icon): CrawlerCategory {
  const data = (kind: AviationKind): CrawlerSection => ({
    path: kind,
    label: `registry.tabs.${kind}`,
    element: <AviationDataPage source={source} kind={kind} />,
  })
  return {
    id,
    name: `registry.aviation.${source}.name`,
    description: `registry.aviation.${source}.description`,
    icon,
    Summary: () => <AviationSummaryLine source={source} />,
    sections: [
      data('airport'),
      data('airline'),
      data('city'),
      data('country'),
      {
        path: 'history',
        label: 'common.history',
        element: <AviationHistoryPage source={source} />,
      },
    ],
  }
}

export const CRAWLER_MODULES: CrawlerModule[] = [
  {
    id: NOVEL.moduleId,
    name: 'registry.novel.name',
    description: 'registry.novel.description',
    icon: IconBook2,
    categories: [
      {
        id: NOVEL.categoryId,
        name: 'registry.novel.stories.name',
        description: 'registry.novel.stories.description',
        icon: IconBook2,
        Summary: NovelSummary,
        crawlPath: 'crawl',
        sections: [
          { path: 'overview', label: 'common.overview', element: <NovelOverview /> },
          { path: 'crawl', label: 'registry.tabs.crawl', element: <CrawlPage /> },
          { path: 'novels', label: 'novels.title', element: <NovelsPage /> },
          { path: 'jobs', label: 'common.jobs', element: <JobsPage crawler="novel" /> },
          { path: 'sources', label: 'registry.tabs.sources', element: <SourcesPage /> },
          { path: 'logs', label: 'logs.title', element: <LogsPage /> },
        ],
        pages: [
          { path: 'novels/:id', element: <NovelDetailPage /> },
          { path: 'novels/:id/chapters/:number', element: <ChapterPage /> },
        ],
      },
    ],
  },
  {
    id: 'aviation',
    name: 'registry.aviation.name',
    description: 'registry.aviation.description',
    icon: IconPlane,
    categories: [
      aviationCategory('world', 'world', IconWorld),
      aviationCategory('vietnam-airlines', 'vna', IconPlaneDeparture),
    ],
  },
  {
    id: 'provinces',
    name: 'registry.provinces.name',
    description: 'registry.provinces.description',
    icon: IconMapPin,
    categories: [
      {
        id: 'vietnam',
        name: 'registry.provinces.vietnam.name',
        description: 'registry.provinces.vietnam.description',
        icon: IconMapPin,
        Summary: ProvinceSummaryLine,
        sections: [
          { path: 'list', label: 'registry.tabs.provinces', element: <ProvincesPage /> },
          { path: 'wards', label: 'registry.tabs.wards', element: <WardsPage /> },
          { path: 'history', label: 'common.history', element: <ProvinceHistoryPage /> },
        ],
      },
    ],
  },
  {
    id: 'banks',
    name: 'registry.banks.name',
    description: 'registry.banks.description',
    icon: IconBuildingBank,
    categories: [
      {
        id: 'vietnam',
        name: 'registry.banks.vietnam.name',
        description: 'registry.banks.vietnam.description',
        icon: IconBuildingBank,
        Summary: BankSummaryLine,
        sections: [
          { path: 'list', label: 'registry.tabs.banks', element: <BanksPage /> },
          { path: 'history', label: 'common.history', element: <BankHistoryPage /> },
        ],
      },
    ],
  },
]
