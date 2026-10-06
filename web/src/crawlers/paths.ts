// Đường dẫn của khu vực Crawler. Tách khỏi registry.tsx để các trang dùng được mà không import vòng
// (registry import trang, trang lại cần đường dẫn).

export const CRAWLERS_PATH = '/crawlers'

export const modulePath = (moduleId: string) => `${CRAWLERS_PATH}/${moduleId}`

export const categoryPath = (moduleId: string, categoryId: string) =>
  `${modulePath(moduleId)}/${categoryId}`

/** Khu vực dữ liệu của một job đồng bộ, theo `job.crawler` ("aviation:world", "aviation:vna", "provinces"). */
export const jobDataPath = (crawler: string) =>
  crawler === 'provinces'
    ? categoryPath('provinces', 'vietnam')
    : categoryPath('aviation', crawler === 'aviation:vna' ? 'vietnam-airlines' : 'world')

/** Module truyện chữ: định danh và tên dùng chung cho registry lẫn breadcrumb của các trang con. */
export const NOVEL = { moduleId: 'novel', categoryId: 'stories', name: 'Truyện chữ' }

const novelBase = categoryPath(NOVEL.moduleId, NOVEL.categoryId)

export const novelPaths = {
  crawl: `${novelBase}/crawl`,
  novels: `${novelBase}/novels`,
  jobs: `${novelBase}/jobs`,
  novel: (id: number) => `${novelBase}/novels/${id}`,
  chapter: (id: number, number: number) => `${novelBase}/novels/${id}/chapters/${number}`,
}

/** Đầu breadcrumb của các trang con trong module truyện (chi tiết truyện, đọc chương). */
export const NOVEL_CRUMBS = [
  { label: 'Crawler', to: CRAWLERS_PATH },
  { label: NOVEL.name, to: novelBase },
  { label: 'Truyện', to: novelPaths.novels },
]
