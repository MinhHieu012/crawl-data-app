import { Alert, Button, Card, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { IconAlertTriangle, IconLock, IconLogout } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useAdminLogin } from '../../api/queries'
import { setAdminToken, useAdminToken } from '../../hooks/useAdminToken'
import { notifySuccess } from '../../utils/notify'

function AdminLogin() {
  const { t } = useTranslation()
  const login = useAdminLogin()
  const form = useForm({
    initialValues: { token: '' },
    validate: { token: (value) => (value.trim() ? null : t('admin.login.required')) },
  })

  return (
    <Card withBorder maw={480}>
      <form onSubmit={form.onSubmit(({ token }) => login.mutate(token.trim()))} noValidate>
        <Stack gap="md">
          <Title order={2} size="h4">
            {t('admin.login.title')}
          </Title>
          <PasswordInput
            label={t('admin.login.token')}
            autoComplete="current-password"
            required
            disabled={login.isPending}
            {...form.getInputProps('token')}
          />
          {login.isError && (
            <Alert
              color="red"
              icon={<IconAlertTriangle size={18} />}
              title={t('admin.login.failed')}
              role="alert"
            >
              <Text size="sm">{login.error.message}</Text>
            </Alert>
          )}
          <Button
            type="submit"
            loading={login.isPending}
            leftSection={<IconLock size={16} />}
            style={{ alignSelf: 'flex-start' }}
          >
            {t('admin.login.submit')}
          </Button>
        </Stack>
      </form>
    </Card>
  )
}

/**
 * Chưa có mã quản trị thì hiện form nhập mã thay cho nội dung. Chỉ là lối vào cho tiện: dữ liệu quản
 * trị chỉ đến từ API `/admin/*`, và backend trả 403 nếu mã không đúng.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const token = useAdminToken()
  return token ? children : <AdminLogin />
}

export function LogoutButton() {
  const { t } = useTranslation()
  return (
    <Button
      variant="default"
      leftSection={<IconLogout size={16} />}
      onClick={() => {
        setAdminToken(null)
        notifySuccess(t('admin.loggedOut'))
      }}
    >
      {t('admin.logout')}
    </Button>
  )
}
