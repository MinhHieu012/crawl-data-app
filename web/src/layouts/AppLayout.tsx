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
  IconFileText,
  IconLayoutDashboard,
  IconListCheck,
  IconMoon,
  IconSettings,
  IconSpider,
  IconStack2,
  IconSun,
  type Icon,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigationType } from 'react-router'

import { useJobActivity } from '../api/queries'
import { categoryPath, CRAWLERS_PATH, modulePath } from '../crawlers/paths'
import { CRAWLER_MODULES } from '../crawlers/registry'

interface NavItem {
  /** Đích của mục; với nhóm (có `children`) là tiền tố đường dẫn của cả nhóm. */
  path: string
  label: string
  icon?: Icon
  /** Chỉ sáng khi đúng đường dẫn này, không tính các trang con. */
  exact?: boolean
  /** Nhóm mở sẵn dù chưa ở trang nào bên trong. */
  defaultOpened?: boolean
  children?: NavItem[]
}

// Trang chung của hệ thống khai báo ở đây (kèm route trong App.tsx). Phần crawler sinh từ registry:
// thêm crawler mới không phải sửa menu. Module nhiều loại dữ liệu thành một nhóm con.
const NAVIGATION: NavItem[] = [
  { path: '/', label: 'Tổng quan', icon: IconLayoutDashboard, exact: true },
  {
    path: CRAWLERS_PATH,
    label: 'Crawler',
    icon: IconSpider,
    defaultOpened: true,
    children: [
      { path: CRAWLERS_PATH, label: 'Tất cả crawler', icon: IconStack2, exact: true },
      ...CRAWLER_MODULES.map((crawler) => ({
        path: modulePath(crawler.id),
        label: crawler.name,
        icon: crawler.icon,
        children:
          crawler.categories.length > 1
            ? [
                { path: modulePath(crawler.id), label: 'Tổng quan', exact: true },
                ...crawler.categories.map((category) => ({
                  path: categoryPath(crawler.id, category.id),
                  label: category.name,
                })),
              ]
            : undefined,
      })),
    ],
  },
  { path: '/jobs', label: 'Job', icon: IconListCheck },
  { path: '/logs', label: 'Log', icon: IconFileText },
  { path: '/settings', label: 'Cài đặt', icon: IconSettings },
]

const NAVBAR_ID = 'app-navbar'
const NAV_ITEM_STYLE = { borderRadius: 'var(--mantine-radius-default)' }

function NavItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
  // Nhóm tự mở khi đang ở một trang bên trong; người dùng đã bấm mở/đóng thì theo lựa chọn của họ.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  return items.map((item) => {
    const active = pathname === item.path || (!item.exact && pathname.startsWith(`${item.path}/`))
    const icon = item.icon && <item.icon size={18} stroke={1.6} />

    if (item.children) {
      const opened = toggled[item.path] ?? (active || Boolean(item.defaultOpened))
      return (
        <NavLink
          key={item.label}
          component="button"
          label={item.label}
          leftSection={icon}
          opened={opened}
          onChange={(next) => setToggled((current) => ({ ...current, [item.path]: next }))}
          aria-expanded={opened}
          style={NAV_ITEM_STYLE}
        >
          <NavItems items={item.children} pathname={pathname} />
        </NavLink>
      )
    }
    return (
      <NavLink
        key={item.label}
        component={Link}
        to={item.path}
        label={item.label}
        leftSection={icon}
        active={active}
        aria-current={active ? 'page' : undefined}
        style={NAV_ITEM_STYLE}
      />
    )
  })
}

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
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !menuOpened } }}
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
                <IconSpider size={24} color="var(--mantine-primary-color-filled)" aria-hidden />
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

      <AppShell.Navbar p="xs" id={NAVBAR_ID} aria-label="Menu chính" style={{ overflowY: 'auto' }}>
        <NavItems items={NAVIGATION} pathname={pathname} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="xl" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
