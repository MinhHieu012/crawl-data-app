import { useSearchParams } from 'react-router'

/**
 * Bộ lọc / trang hiện tại nằm ngay trên URL (query string) thay vì trong state của component:
 * tải lại trang, bấm Back hay gửi link cho người khác đều giữ nguyên những gì đang xem.
 * Giá trị trùng mặc định thì không ghi lên URL; đổi bộ lọc bất kỳ sẽ đưa về trang 1.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams()

  const state = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = searchParams.get(key)
    if (value !== null) state[key] = value as T[typeof key]
  }

  const update = (changes: Partial<T>) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (!('page' in changes)) next.delete('page')
        for (const [key, value] of Object.entries(changes)) {
          if (!value || value === defaults[key]) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  return [state, update] as const
}
