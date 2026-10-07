import { useSyncExternalStore } from 'react'

// Mã quản trị người dùng đã nhập, giữ ở localStorage để không phải nhập lại mỗi lần mở trang. Đây
// chỉ là chỗ cất mã: có mã hay không chỉ quyết định hiện/ẩn menu — backend mới kiểm tra mã đúng sai.

const STORAGE_KEY = 'adminToken'
const listeners = new Set<() => void>()

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // trình duyệt chặn localStorage: coi như chưa đăng nhập
  }
}

/** `null` = đăng xuất. */
export function setAdminToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // không lưu được thì lần sau phải nhập lại
  }
  for (const listener of listeners) listener()
}

/** Header gửi kèm các request tới `/admin/*`. */
export function adminHeaders(): Record<string, string> {
  const token = getAdminToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener) // đăng nhập/đăng xuất ở tab khác
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function useAdminToken(): string | null {
  return useSyncExternalStore(subscribe, getAdminToken)
}
