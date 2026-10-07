import { notifications } from '@mantine/notifications'

import i18n from '../i18n'

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : i18n.t('common.unknownError')
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'teal', message })
}

export function notifyError(error: unknown, title = i18n.t('common.actionFailed')): void {
  notifications.show({ color: 'red', title, message: errorMessage(error), autoClose: 8000 })
}
