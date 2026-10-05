import {
  Alert,
  Button,
  Fieldset,
  Group,
  NativeSelect,
  NumberInput,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { IconInfoCircle } from '@tabler/icons-react'

import { ApiError } from '../../api/client'
import { useSettings, useUpdateSettings } from '../../api/queries'
import type { Settings, SettingsUpdate } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { notifyError, notifySuccess } from '../../utils/notify'

function editable(settings: Settings): SettingsUpdate {
  return {
    http: settings.http,
    crawler: { content_format: settings.crawler.content_format },
    log: { level: settings.log.level },
  }
}

/** Ô số bị xoá trắng cho ra chuỗi rỗng, nên phải kiểm tra cả kiểu chứ không chỉ khoảng giá trị. */
const between = (min: number, max: number, message: string) => (value: unknown) =>
  typeof value === 'number' && value >= min && value <= max ? null : message

function SettingsForm({ settings }: { settings: Settings }) {
  const update = useUpdateSettings()
  // Giới hạn ở đây chỉ để báo lỗi sớm; backend mới là nơi quyết định (cùng quy tắc với file .env).
  const form = useForm<SettingsUpdate>({
    initialValues: editable(settings),
    validate: {
      http: {
        user_agent: (value) => (value.trim() ? null : 'Không được để trống'),
        request_timeout: between(0.1, 600, 'Nhập số giây lớn hơn 0'),
        max_retries: between(0, 10, 'Từ 0 đến 10 lần'),
        concurrency: between(1, 8, 'Từ 1 đến 8 request'),
        request_delay: between(
          0.5,
          3600,
          'Tối thiểu 0.5 giây — để không gây quá tải cho website nguồn',
        ),
      },
    },
  })

  const save = form.onSubmit(
    (values) =>
      update.mutate(values, {
        onSuccess: (saved) => {
          // Hiện đúng giá trị backend đang dùng (có thể khác giá trị vừa gửi nếu bị biến môi trường
          // ghi đè). Form bị khoá trong lúc lưu nên không ghi đè lên thứ người dùng đang gõ dở.
          form.setValues(editable(saved))
          form.resetDirty(editable(saved))
          notifySuccess('Đã lưu cấu hình')
        },
        onError: (error) => {
          if (error instanceof ApiError) form.setErrors(error.fields)
          notifyError(error, 'Không lưu được cấu hình')
        },
      }),
    // Còn ô sai thì đưa con trỏ tới ô sai đầu tiên, không chỉ hiện chữ đỏ.
    (errors) => form.getInputNode(Object.keys(errors)[0] ?? '')?.focus(),
  )

  return (
    <form onSubmit={save} noValidate>
      <Stack gap="lg" maw={860}>
        <Alert color="blue" icon={<IconInfoCircle size={18} />}>
          Cấu hình được ghi vào file <b style={{ overflowWrap: 'anywhere' }}>{settings.env_file}</b>{' '}
          và áp dụng cho các job bắt đầu sau khi mọi job đang chạy đã kết thúc. Biến môi trường của
          hệ điều hành (nếu có) vẫn được ưu tiên hơn file này.
        </Alert>

        <Fieldset legend="HTTP client" disabled={update.isPending}>
          <Stack gap="md">
            <TextInput
              label="User-Agent"
              description="Nên tự nhận là bot và để lại cách liên hệ, ví dụ: crawl-data-app/0.1 (+mailto:ban@example.com)"
              {...form.getInputProps('http.user_agent')}
            />
            {/* Hai cột từ `md`: hẹp hơn thì nhãn dài xuống dòng, đẩy lệch ô nhập bên cạnh. */}
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <NumberInput
                label="Khoảng nghỉ giữa hai request (giây)"
                description="Tối thiểu 0.5. Tốc độ tối đa của crawler là 1 request mỗi khoảng nghỉ."
                min={0.5}
                step={0.5}
                {...form.getInputProps('http.request_delay')}
              />
              <NumberInput
                label="Request đồng thời tối đa"
                description="Từ 1 đến 8. Chỉ có tác dụng khi website trả lời chậm hơn khoảng nghỉ."
                min={1}
                max={8}
                allowDecimal={false}
                {...form.getInputProps('http.concurrency')}
              />
              <NumberInput
                label="Timeout mỗi request (giây)"
                min={1}
                {...form.getInputProps('http.request_timeout')}
              />
              <NumberInput
                label="Số lần thử lại"
                description="Khi lỗi tạm thời (timeout, HTTP 429/5xx); thời gian chờ tăng gấp đôi mỗi lần."
                min={0}
                max={10}
                allowDecimal={false}
                {...form.getInputProps('http.max_retries')}
              />
            </SimpleGrid>
          </Stack>
        </Fieldset>

        <Fieldset legend="Crawler và log" disabled={update.isPending}>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <NativeSelect
              label="Định dạng lưu nội dung chương"
              description="Chỉ áp dụng cho chương tải từ nay về sau."
              data={[
                { value: 'html', label: 'HTML (mỗi đoạn một thẻ <p>)' },
                { value: 'markdown', label: 'Markdown' },
              ]}
              {...form.getInputProps('crawler.content_format')}
            />
            <NativeSelect
              label="Mức log"
              description="DEBUG ghi lại từng request."
              data={['DEBUG', 'INFO', 'WARNING', 'ERROR']}
              {...form.getInputProps('log.level')}
            />
          </SimpleGrid>
        </Fieldset>

        <Fieldset legend="Chỉ xem">
          <Text size="sm" c="dimmed" mb="sm">
            Muốn đổi hai mục này thì sửa trong file .env rồi khởi động lại server.
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TextInput
              label="Database"
              description="Mật khẩu (nếu có) đã được che."
              value={settings.database_url}
              readOnly
            />
            <TextInput label="Thư mục log" value={settings.log.dir} readOnly />
          </SimpleGrid>
        </Fieldset>

        <Group justify="flex-end">
          {form.isDirty() && (
            <Text size="sm" c="dimmed">
              Có thay đổi chưa lưu
            </Text>
          )}
          <Button variant="default" disabled={!form.isDirty()} onClick={form.reset}>
            Hoàn tác
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!form.isDirty()}>
            Lưu cấu hình
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export function SettingsPage() {
  const settings = useSettings()

  return (
    <>
      <PageHeader
        title="Cài đặt"
        description="Các thông số của crawler. Giới hạn về tốc độ là có chủ đích để không gây quá tải cho website nguồn."
      />
      {/* Mỗi nhóm cài đặt đã là một khung (Fieldset) nên không bọc thêm Card: hai lớp viền chỉ tốn chỗ. */}
      <QueryState query={settings} skeleton={<Skeleton height={420} radius="md" />}>
        {(data) => <SettingsForm settings={data} />}
      </QueryState>
    </>
  )
}
