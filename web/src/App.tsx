import { Button } from '@mantine/core'
import { Link, Route, Routes } from 'react-router'

import { EmptyState } from './components/QueryState'
import { AppLayout } from './layouts/AppLayout'
import { CrawlPage } from './pages/crawl/CrawlPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { JobDetailPage } from './pages/jobs/JobDetailPage'
import { JobsPage } from './pages/jobs/JobsPage'
import { LogsPage } from './pages/logs/LogsPage'
import { ChapterPage } from './pages/novels/ChapterPage'
import { NovelDetailPage } from './pages/novels/NovelDetailPage'
import { NovelsPage } from './pages/novels/NovelsPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { SourcesPage } from './pages/sources/SourcesPage'

function NotFoundPage() {
  return (
    <EmptyState
      title="Không có trang này"
      description="Đường dẫn không đúng hoặc trang đã được chuyển đi."
      action={
        <Button component={Link} to="/" variant="light">
          Về trang Tổng quan
        </Button>
      }
    />
  )
}

/** Bảng định tuyến: mỗi màn hình một route, tất cả nằm trong khung chung `AppLayout`. */
export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="crawl" element={<CrawlPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="novels" element={<NovelsPage />} />
        <Route path="novels/:id" element={<NovelDetailPage />} />
        <Route path="novels/:id/chapters/:number" element={<ChapterPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
