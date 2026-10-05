import { notifications } from '@mantine/notifications'

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi không xác định.'
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'teal', message })
}

export function notifyError(error: unknown, title = 'Không thực hiện được'): void {
  notifications.show({ color: 'red', title, message: errorMessage(error), autoClose: 8000 })
}
