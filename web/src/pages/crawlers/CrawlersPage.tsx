import { Card, Code, Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useState } from 'react'

import { SearchInput } from '../../components/ListControls'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/QueryState'
import { modulePath } from '../../crawlers/paths'
import { CRAWLER_MODULES } from '../../crawlers/registry'
import { CrawlerCard } from './CrawlerCard'

/** Bỏ dấu và hoa thường để gõ "san bay" vẫn ra "Sân bay". */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()

/** Trang "Tất cả crawler": mỗi module trong registry một thẻ. */
export function CrawlersPage() {
  const [search, setSearch] = useState('')
  const needle = fold(search)
  const crawlers = CRAWLER_MODULES.filter((crawler) =>
    [crawler.name, crawler.description, ...crawler.categories.map((category) => category.name)]
      .map(fold)
      .some((text) => text.includes(needle)),
  )

  return (
    <>
      <PageHeader
        title="Crawler"
        description="Mỗi crawler là một module độc lập, gồm một hay nhiều loại dữ liệu."
      />
      <Group mb="md" maw={420}>
        <SearchInput
          value={search}
          onSearch={setSearch}
          label="Tìm crawler"
          placeholder="Tên crawler hoặc loại dữ liệu"
        />
      </Group>

      {crawlers.length === 0 ? (
        <Card withBorder>
          <EmptyState
            title="Không có crawler nào khớp"
            description="Thử từ khoá khác, ví dụ tên một loại dữ liệu."
          />
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
          {crawlers.map((crawler) => (
            <CrawlerCard
              key={crawler.id}
              icon={crawler.icon}
              title={crawler.name}
              description={crawler.description}
              to={modulePath(crawler.id)}
              ready={crawler.categories.some((category) => category.sections)}
            >
              {crawler.categories.length > 1 && (
                <Text size="sm">
                  {crawler.categories.map((category) => category.name).join(' · ')}
                </Text>
              )}
              {crawler.categories.map(
                (category) => category.Summary && <category.Summary key={category.id} />,
              )}
            </CrawlerCard>
          ))}
          {!search && (
            <Card withBorder padding="lg" bg="transparent" style={{ borderStyle: 'dashed' }}>
              <Stack align="center" justify="center" gap={6} h="100%" mih={140}>
                <ThemeIcon size={40} radius="xl" variant="light" color="gray" aria-hidden>
                  <IconPlus size={22} stroke={1.6} />
                </ThemeIcon>
                <Text fw={600}>Crawler khác</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Khai báo thêm một module trong <Code>web/src/crawlers/registry.tsx</Code> là có
                  thẻ, menu và route ở đây.
                </Text>
              </Stack>
            </Card>
          )}
        </SimpleGrid>
      )}
    </>
  )
}
