// Đường dẫn của khu vực Góp ý — dùng chung cho route (App.tsx), menu và các nút chuyển trang.
export const FEEDBACK_PATH = '/feedback'
export const BUG_REPORT_PATH = `${FEEDBACK_PATH}/bug-report`
export const CRAWLER_REQUEST_PATH = `${FEEDBACK_PATH}/crawler-request`
export const ADMIN_FEEDBACK_PATH = '/admin/feedback'
export const adminFeedbackPath = (id: number) => `${ADMIN_FEEDBACK_PATH}/${id}`
