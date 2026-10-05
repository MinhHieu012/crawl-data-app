import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Container,
  Group,
  NavLink,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconBooks,
  IconFileText,
  IconLayoutDashboard,
  IconListCheck,
  IconMoon,
  IconPlayerPlay,
  IconSettings,
  IconSun,
  IconWorld,
} from '@tabler/icons-react'
import { useEffect } from 'react'
import { Link, Outlet, useLocation, useNavigationType } from 'react-router'

import { useJobActivity } from '../api/queries'

// Thêm màn hình mới: khai báo route trong App.tsx và (nếu cần hiện trên menu) thêm một dòng ở đây.
const NAVIGATION = [
  { to: '/', label: 'Tổng quan', icon: IconLayoutDashboard },
  { to: '/crawl', label: 'Crawl truyện', icon: IconPlayerPlay },
  { to: '/jobs', label: 'Job crawl', icon: IconListCheck },
  { to: '/novels', label: 'Truyện', icon: IconBooks },
  { to: '/sources', label: 'Nguồn', icon: IconWorld },
  { to: '/logs', label: 'Log', icon: IconFileText },
  { to: '/settings', label: 'Cài đặt', icon: IconSettings },
]

const NAVBAR_ID = 'app-navbar'

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const current = useComputedColorScheme('light')
  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label={current === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      onClick={() => setColorScheme(current === 'dark' ? 'light' : 'dark')}
    >
      {current === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  )
}

/** Khung chung của mọi trang: thanh trên cùng, menu bên trái (thu gọn trên màn hình hẹp), nội dung. */
export function AppLayout() {
  const [menuOpened, { toggle, close }] = useDisclosure()
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const running = useJobActivity()

  useEffect(close, [pathname, close]) // màn hình hẹp: chọn xong một mục thì đóng menu

  // Sang trang khác thì về đầu trang (đọc hết chương, bấm "Chương sau" là thấy đầu chương mới).
  // Riêng nút Back/Forward của trình duyệt (POP) thì để trình duyệt trả về vị trí cũ.
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navigationType])

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !menuOpened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={menuOpened}
              onClick={toggle}
              hiddenFrom="sm"
              size="md"
              aria-label={menuOpened ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={menuOpened}
              aria-controls={NAVBAR_ID}
            />
            <UnstyledButton
              component={Link}
              to="/"
              p={4}
              aria-label="Crawl Data App, về trang Tổng quan"
            >
              <Group gap="sm" wrap="nowrap">
                <IconBooks size={24} color="var(--mantine-primary-color-filled)" aria-hidden />
                {/* Màn hình điện thoại chỉ đủ chỗ cho logo, nút menu và số job đang chạy. */}
                <Text fw={700} size="lg" visibleFrom="xs" style={{ whiteSpace: 'nowrap' }}>
                  Crawl Data App
                </Text>
              </Group>
            </UnstyledButton>
          </Group>
          <Group gap="sm" wrap="nowrap">
            {running > 0 && (
              <Badge
                component={Link}
                to="/jobs?status=running"
                variant="light"
                size="lg"
                fz="sm"
                aria-label={`${running} job đang chạy`}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              >
                {running}{' '}
                <Box component="span" visibleFrom="xs">
                  job{' '}
                </Box>
                đang chạy
              </Badge>
            )}
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" id={NAVBAR_ID} aria-label="Menu chính">
        {NAVIGATION.map((item) => {
          const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} stroke={1.6} />}
              active={active}
              aria-current={active ? 'page' : undefined}
              style={{ borderRadius: 'var(--mantine-radius-default)' }}
            />
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="xl" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
