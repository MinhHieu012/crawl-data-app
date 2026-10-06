// Danh mục crawler của giao diện. Menu, trang "Tất cả crawler", trang tổng quan của module và các
// route đều sinh ra từ đây: thêm crawler mới = thêm một module (hoặc một category) vào CRAWLER_MODULES.

import {
  IconBook2,
  IconMapPin,
  IconPlane,
  IconPlaneDeparture,
  IconWorld,
  type Icon,
} from '@tabler/icons-react'
import type { ComponentType, ReactNode } from 'react'

import type { AviationKind, AviationSource } from '../api/types'
import {
  AviationDataPage,
  AviationHistoryPage,
  AviationSummaryLine,
} from '../pages/aviation/AviationPages'
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

/** Một tab trong khu vực quản lý của category. `path` nối sau đường dẫn của category. */
export interface CrawlerSection {
  path: string
  label: string
  element: ReactNode
}

/** Loại dữ liệu mà một crawler thu thập (truyện, sân bay, hãng bay…). */
export interface CrawlerCategory {
  id: string
  name: string
  description: string
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
  name: string
  description: string
  icon: Icon
  categories: CrawlerCategory[]
}

/** Một nguồn dữ liệu hàng không: bốn tab dữ liệu dùng chung trang (chỉ khác `kind`) và tab lịch sử. */
function aviationCategory(
  id: string,
  source: AviationSource,
  name: string,
  description: string,
  icon: Icon,
): CrawlerCategory {
  const data = (kind: AviationKind, label: string): CrawlerSection => ({
    path: kind,
    label,
    element: <AviationDataPage source={source} kind={kind} />,
  })
  return {
    id,
    name,
    description,
    icon,
    Summary: () => <AviationSummaryLine source={source} />,
    sections: [
      data('airport', 'Sân bay'),
      data('airline', 'Hãng bay'),
      data('city', 'Thành phố'),
      data('country', 'Quốc gia'),
      { path: 'history', label: 'Lịch sử', element: <AviationHistoryPage source={source} /> },
    ],
  }
}

export const CRAWLER_MODULES: CrawlerModule[] = [
  {
    id: NOVEL.moduleId,
    name: NOVEL.name,
    description: 'Crawl truyện chữ từ các website đọc truyện vào database.',
    icon: IconBook2,
    categories: [
      {
        id: NOVEL.categoryId,
        name: 'Truyện',
        description: 'Thông tin truyện, mục lục và nội dung từng chương.',
        icon: IconBook2,
        Summary: NovelSummary,
        crawlPath: 'crawl',
        sections: [
          { path: 'overview', label: 'Tổng quan', element: <NovelOverview /> },
          { path: 'crawl', label: 'Crawl', element: <CrawlPage /> },
          { path: 'novels', label: 'Truyện', element: <NovelsPage /> },
          { path: 'jobs', label: 'Job', element: <JobsPage crawler="novel" /> },
          { path: 'sources', label: 'Nguồn', element: <SourcesPage /> },
          { path: 'logs', label: 'Log', element: <LogsPage /> },
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
    name: 'Hàng không',
    description: 'Danh mục sân bay, hãng bay, thành phố và quốc gia, theo từng nguồn dữ liệu.',
    icon: IconPlane,
    categories: [
      aviationCategory(
        'world',
        'world',
        'Toàn thế giới',
        'Dữ liệu mở toàn cầu từ OurAirports và OpenFlights.',
        IconWorld,
      ),
      aviationCategory(
        'vietnam-airlines',
        'vna',
        'Vietnam Airlines',
        'Điểm đến và hãng bay đối tác công bố trên vietnamairlines.com.',
        IconPlaneDeparture,
      ),
    ],
  },
  {
    id: 'provinces',
    name: 'Tỉnh thành Việt Nam',
    description: 'Danh mục 34 tỉnh, thành phố của Việt Nam sau sáp nhập năm 2025, kèm phường/xã.',
    icon: IconMapPin,
    categories: [
      {
        id: 'vietnam',
        name: 'Tỉnh thành',
        description: 'Mã, tên, loại đơn vị của từng tỉnh, thành phố và các phường/xã trực thuộc.',
        icon: IconMapPin,
        Summary: ProvinceSummaryLine,
        sections: [
          { path: 'list', label: 'Tỉnh thành', element: <ProvincesPage /> },
          { path: 'wards', label: 'Phường/xã', element: <WardsPage /> },
          { path: 'history', label: 'Lịch sử', element: <ProvinceHistoryPage /> },
        ],
      },
    ],
  },
]
