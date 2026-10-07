import i18n from '../../i18n'

/** Các ô chung của mọi loại góp ý. */
export interface CommonFields {
  title: string
  description: string
  contact: string
}

// Cùng giới hạn với backend (`_FeedbackCreate` trong schemas.py); backend vẫn là nơi quyết định.
export const commonRules = (titleMessage: string) => ({
  title: (value: string) =>
    value.trim().length >= 3 && value.trim().length <= 200 ? null : titleMessage,
  description: (value: string) =>
    value.trim().length >= 10 && value.trim().length <= 5000
      ? null
      : i18n.t('feedback.validation.description'),
})

/** Ô tuỳ chọn để trống → null (backend không lưu chuỗi rỗng). */
export const blankToNull = (value: string) => value.trim() || null
