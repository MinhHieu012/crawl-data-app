import '@testing-library/jest-dom/vitest'

import { notifications } from '@mantine/notifications'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import i18n from '../i18n'

// jsdom tự nhận là máy tiếng Anh; các test viết theo giao diện tiếng Việt.
void i18n.changeLanguage('vi')

// Mantine cần vài API của trình duyệt mà jsdom chưa có.
const { getComputedStyle } = window
window.getComputedStyle = (element) => getComputedStyle(element)
window.HTMLElement.prototype.scrollIntoView = () => {}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub

afterEach(() => {
  cleanup()
  notifications.clean() // kho thông báo của Mantine là biến toàn cục, không tự mất theo component
  vi.unstubAllGlobals()
  localStorage.clear() // lựa chọn ngôn ngữ của test trước không được lọt sang test sau
  void i18n.changeLanguage('vi')
})
