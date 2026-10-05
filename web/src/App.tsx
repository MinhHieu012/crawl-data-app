import { Button } from '@mantine/core'
import { Link, Navigate, Route, Routes } from 'react-router'

import { EmptyState } from './components/QueryState'
import { CRAWLERS_PATH } from './crawlers/paths'
import { CRAWLER_MODULES } from './crawlers/registry'
import { AppLayout } from './layouts/AppLayout'
import { CategoryLayout } from './layouts/CategoryLayout'
import { CrawlersPage } from './pages/crawlers/CrawlersPage'
import { ModulePage } from './pages/crawlers/ModulePage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { JobDetailPage } from './pages/jobs/JobDetailPage'
import { JobsPage } from './pages/jobs/JobsPage'
import { LogsPage } from './pages/logs/LogsPage'
import { SettingsPage } from './pages/settings/SettingsPage'

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

/**
 * Bảng định tuyến, tất cả nằm trong khung chung `AppLayout`. Khu vực Crawler đi theo ba tầng
 * crawler → loại dữ liệu → tab, sinh ra từ `CRAWLER_MODULES`; các trang còn lại là trang chung của
 * cả hệ thống.
 */
export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path={CRAWLERS_PATH}>
          <Route index element={<CrawlersPage />} />
          <Route path=":moduleId" element={<ModulePage />} />
          {CRAWLER_MODULES.flatMap((crawler) =>
            crawler.categories.map((category) => (
              <Route key={`${crawler.id}/${category.id}`} path={`${crawler.id}/${category.id}`}>
                <Route element={<CategoryLayout crawler={crawler} category={category} />}>
                  <Route
                    index
                    element={
                      category.sections && <Navigate to={category.sections[0].path} replace />
                    }
                  />
                  {category.sections?.map((section) => (
                    <Route key={section.path} path={section.path} element={section.element} />
                  ))}
                </Route>
                {category.pages?.map((page) => (
                  <Route key={page.path} path={page.path} element={page.element} />
                ))}
              </Route>
            )),
          )}
        </Route>
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
