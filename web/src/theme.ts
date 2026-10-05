import {
  Badge,
  createTheme,
  type CSSVariablesResolver,
  Input,
  luminance,
  NumberInput,
  Switch,
  toRgba,
} from '@mantine/core'

const PLACEHOLDER = 'var(--mantine-color-placeholder)'

/**
 * Theme của ứng dụng: vẫn là bảng màu mặc định của Mantine, chỉ chỉnh những chỗ mặc định đó chưa
 * đọc được (chữ phải tương phản với nền từ 4.5:1 — WCAG AA), vùng bấm quá nhỏ, hoặc làm các ô
 * nhập đứng cạnh nhau bị lệch hàng.
 * Đổi màu thương hiệu: sửa `primaryColor`; màu chữ đủ tương phản tự tính lại từ bảng màu.
 */
export const theme = createTheme({
  primaryColor: 'blue',
  // Bậc 6 mặc định: chữ trắng trên nút chính chỉ đạt 3.6:1. Bậc 8 đạt 5.1:1.
  primaryShade: 8,
  cursorType: 'pointer',
  components: {
    // Nhãn tiếng Việt có dấu viết IN HOA cỡ 11px rất khó đọc → chữ thường 12px.
    Badge: Badge.extend({ defaultProps: { tt: 'none', fz: 'xs', fw: 600 } }),
    // Mặc định công tắc cao 20px và nút tăng/giảm của ô số cao 17px: dưới mức 24px bấm được bằng
    // ngón tay. Ô số vẫn gõ trực tiếp và nhận phím ↑ ↓.
    Switch: Switch.extend({ defaultProps: { size: 'md' } }),
    NumberInput: NumberInput.extend({ defaultProps: { hideControls: true } }),
    // Ô đang báo lỗi: placeholder giữ màu xám thường, không tô đỏ kẻo trông như một giá trị gõ sai.
    Input: Input.extend({
      styles: { input: { ['--input-placeholder-color' as string]: PLACEHOLDER } },
    }),
    // Lỗi và mô tả nằm dưới ô nhập thay vì chen giữa nhãn và ô: hai ô đứng cạnh nhau luôn thẳng hàng
    // dù mô tả của chúng dài ngắn khác nhau hay một ô không có mô tả.
    InputWrapper: Input.Wrapper.extend({
      defaultProps: { inputWrapperOrder: ['label', 'input', 'error', 'description'] },
    }),
  },
})

const MIN_CONTRAST = 4.6 // ngưỡng WCAG AA là 4.5; dư một chút cho sai số làm tròn

function contrast(a: string, b: string): number {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (high + 0.05) / (low + 0.05)
}

/** Phủ `amount` (0–1) màu `top` lên `base`, trả về màu đặc. */
function mix(top: string, amount: number, base: string): string {
  const a = toRgba(top)
  const b = toRgba(base)
  const channel = (x: number, y: number) => Math.round(x * amount + y * (1 - amount))
  return `rgb(${channel(a.r, b.r)}, ${channel(a.g, b.g)}, ${channel(a.b, b.b)})`
}

/** Đẩy `color` dần về phía đen (nền sáng) hoặc trắng (nền tối) tới khi đọc được trên `background`. */
function readable(color: string, background: string): string {
  const toward = luminance(background) > 0.5 ? '#000' : '#fff'
  let result = color
  for (
    let amount = 0.04;
    contrast(result, background) < MIN_CONTRAST && amount < 1;
    amount += 0.04
  ) {
    result = mix(toward, amount, color)
  }
  return result
}

/**
 * Các biến màu chữ của Mantine được tính lại để đạt `MIN_CONTRAST` ở ca xấu nhất mà giao diện này
 * có: chữ màu nằm trên nền nhạt cùng màu (badge, alert) của một dòng bảng đang rê chuột.
 */
export const cssVariablesResolver: CSSVariablesResolver = ({ colors, white, primaryColor }) => {
  const light: Record<string, string> = {
    '--mantine-color-dimmed': colors.gray[7],
    '--mantine-color-placeholder': readable(colors.gray[6], white),
  }
  for (const name of Object.keys(colors)) {
    const tint = mix(colors[name][8], 0.1, colors.gray[1])
    const text = readable(colors[name][9], tint)
    for (const role of ['text', 'light-color', 'outline']) {
      light[`--mantine-color-${name}-${role}`] = text
    }
  }
  light['--mantine-color-anchor'] = light[`--mantine-color-${primaryColor}-text`]
  light['--mantine-color-error'] = light['--mantine-color-red-text']

  const hoveredRow = colors.dark[5]
  const dark = {
    '--mantine-color-dimmed': readable(colors.dark[2], hoveredRow),
    '--mantine-color-placeholder': readable(colors.dark[3], colors.dark[6]),
    '--mantine-color-error': readable(colors.red[6], hoveredRow),
  }

  return { variables: {}, light, dark }
}
