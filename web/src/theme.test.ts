import { DEFAULT_THEME, luminance, mergeMantineTheme } from '@mantine/core'
import { expect, test } from 'vitest'

import { cssVariablesResolver, theme } from './theme'

function contrast(a: string, b: string): number {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (high + 0.05) / (low + 0.05)
}

const merged = mergeMantineTheme(DEFAULT_THEME, theme)
const { light, dark } = cssVariablesResolver(merged)
const { colors, white } = merged

test('chữ màu trạng thái đọc được (≥ 4.5:1) trên nền trắng và nền dòng bảng đang rê', () => {
  for (const name of ['blue', 'teal', 'red', 'yellow', 'orange', 'gray']) {
    for (const role of ['text', 'light-color', 'outline']) {
      const color = light[`--mantine-color-${name}-${role}`]
      expect(contrast(color, white), `${name}-${role} trên nền trắng`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(color, colors.gray[1]), `${name}-${role} trên dòng đang rê`).toBeGreaterThan(
        4.5,
      )
    }
  }
})

test('chữ phụ, placeholder và chữ báo lỗi đọc được ở cả hai chế độ sáng, tối', () => {
  expect(contrast(light['--mantine-color-dimmed'], colors.gray[1])).toBeGreaterThanOrEqual(4.5)
  expect(contrast(light['--mantine-color-placeholder'], white)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(light['--mantine-color-error'], white)).toBeGreaterThanOrEqual(4.5)

  const card = colors.dark[6]
  for (const name of ['dimmed', 'placeholder', 'error']) {
    expect(contrast(dark[`--mantine-color-${name}`], card), name).toBeGreaterThanOrEqual(4.5)
  }
})

test('chữ trắng trên nút chính đạt 4.5:1', () => {
  const shade = typeof merged.primaryShade === 'number' ? merged.primaryShade : 8
  expect(contrast(white, colors[merged.primaryColor][shade])).toBeGreaterThanOrEqual(4.5)
})
