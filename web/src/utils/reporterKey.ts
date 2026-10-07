// Không có tài khoản người dùng: mỗi trình duyệt tự sinh một mã ngẫu nhiên làm "người gửi" góp ý và
// gửi kèm mỗi góp ý. Backend chỉ trả về góp ý gắn với đúng mã này, nên người khác không xem được.

const STORAGE_KEY = 'feedbackReporterKey'

export function reporterKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved
    const key = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, key)
    return key
  } catch {
    // ponytail: không có localStorage thì mỗi lần mở trang là một người gửi mới, không xem lại được
    // góp ý cũ. Nâng cấp: tài khoản người dùng.
    return crypto.randomUUID()
  }
}

export const reporterHeaders = () => ({ 'X-Feedback-Key': reporterKey() })
