// Đa ngôn ngữ của giao diện. Chữ nằm trong `locales/<mã>.json` (tiếng Việt là bản gốc — kiểu của khoá
// lấy từ `vi.json`); component gọi `useTranslation()`, hàm thuần ngoài component gọi `i18n.t`.
// Thêm ngôn ngữ: thêm file JSON cùng bộ khoá rồi khai báo vào `LANGUAGES` và `resources` bên dưới.

import i18n, { type ParseKeys } from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import vi from './locales/vi.json'

/** Mã ngôn ngữ → tên hiện trong menu chọn (viết bằng chính ngôn ngữ đó). */
export const LANGUAGES = { vi: 'Tiếng Việt', en: 'English' } as const
export type Language = keyof typeof LANGUAGES
/** Khoá dịch hợp lệ — cho những chỗ giữ khoá trong dữ liệu (registry, bảng trạng thái) rồi mới `t()`. */
export type I18nKey = ParseKeys

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof vi }
  }
}

const STORAGE_KEY = 'language'
const isLanguage = (code: string | null): code is Language => code !== null && code in LANGUAGES

/** Lựa chọn đã lưu của người dùng; chưa chọn lần nào thì theo ngôn ngữ của máy (trình duyệt). */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // trình duyệt chặn localStorage: coi như chưa chọn
  }
  const system = navigator.language.slice(0, 2).toLowerCase()
  return isLanguage(system) ? system : 'en'
}

export function setLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // không lưu được thì lần sau lại theo ngôn ngữ của máy
  }
  void i18n.changeLanguage(language)
}

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})

// Bảng dịch nằm sẵn trong bundle nên `init` chạy đồng bộ: `t` dùng được ngay sau dòng này.
void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: 'vi',
  interpolation: { escapeValue: false }, // React tự escape
})

export default i18n
