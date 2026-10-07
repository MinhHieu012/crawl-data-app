import { afterEach, expect, test, vi as vitest } from 'vitest'

import i18n, { detectLanguage, setLanguage } from './i18n'
import en from './locales/en.json'
import vi from './locales/vi.json'

/** Mọi khoá của một bảng dịch dạng "a.b.c"; các dạng số nhiều (`_one`, `_other`) tính là một khoá. */
function keys(node: object, prefix = ''): string[] {
  return Object.entries(node)
    .flatMap(([key, value]) =>
      typeof value === 'string' ? [prefix + key] : keys(value as object, `${prefix}${key}.`),
    )
    .map((key) => key.replace(/_(one|other)$/, ''))
}

afterEach(() => localStorage.clear())

test('bản tiếng Anh có đúng bộ khoá của bản tiếng Việt', () => {
  expect([...new Set(keys(en))].sort()).toEqual(keys(vi).sort())
})

test('ngôn ngữ ban đầu theo máy, lựa chọn của người dùng được ưu tiên và nhớ lại', () => {
  vitest.stubGlobal('navigator', { language: 'vi-VN' })
  expect(detectLanguage()).toBe('vi')
  vitest.stubGlobal('navigator', { language: 'fr-FR' }) // ngôn ngữ chưa hỗ trợ → tiếng Anh
  expect(detectLanguage()).toBe('en')

  setLanguage('en')
  vitest.stubGlobal('navigator', { language: 'vi-VN' })
  expect(detectLanguage()).toBe('en')
  expect(document.documentElement.lang).toBe('en')
  expect(i18n.t('common.retry')).toBe('Retry')
  expect(i18n.t('records.airport', { count: 1 })).toBe('1 airport')
  expect(i18n.t('records.airport', { count: 1234 })).toBe('1,234 airports')
})
