// Danh mục crawler của giao diện. Menu, trang "Tất cả crawler", trang tổng quan của module và các
// route đều sinh ra từ đây: thêm crawler mới = thêm một module (hoặc một category) vào CRAWLER_MODULES.

import {
  IconBook2,
  IconBuildingAirport,
  IconBuildingSkyscraper,
  IconFlag,
  IconPlane,
  IconPlaneDeparture,
  type Icon,
} from '@tabler/icons-react'
import type { ComponentType, ReactNode } from 'react'

import { CrawlPage } from '../pages/crawl/CrawlPage'
import { JobsPage } from '../pages/jobs/JobsPage'
import { LogsPage } from '../pages/logs/LogsPage'
import { ChapterPage } from '../pages/novels/ChapterPage'
import { NovelDetailPage } from '../pages/novels/NovelDetailPage'
import { NovelOverview, NovelSummary } from '../pages/novels/NovelOverview'
import { NovelsPage } from '../pages/novels/NovelsPage'
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
        sections: [
          { path: 'overview', label: 'Tổng quan', element: <NovelOverview /> },
          { path: 'crawl', label: 'Crawl', element: <CrawlPage /> },
          { path: 'novels', label: 'Truyện', element: <NovelsPage /> },
          { path: 'jobs', label: 'Job', element: <JobsPage /> },
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
    id: 'vietnam-airlines',
    name: 'Vietnam Airlines',
    description: 'Dữ liệu danh mục của Vietnam Airlines.',
    icon: IconPlaneDeparture,
    categories: [
      {
        id: 'airport',
        name: 'Sân bay',
        description: 'Danh mục sân bay.',
        icon: IconBuildingAirport,
      },
      { id: 'airline', name: 'Hãng bay', description: 'Danh mục hãng bay.', icon: IconPlane },
      {
        id: 'city',
        name: 'Thành phố',
        description: 'Danh mục thành phố.',
        icon: IconBuildingSkyscraper,
      },
      { id: 'country', name: 'Quốc gia', description: 'Danh mục quốc gia.', icon: IconFlag },
    ],
  },
]
