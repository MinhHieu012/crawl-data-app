import { Card, Code, Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const needle = fold(search)
  const crawlers = CRAWLER_MODULES.filter((crawler) =>
    [crawler.name, crawler.description, ...crawler.categories.map((category) => category.name)]
      .map((key) => fold(t(key)))
      .some((text) => text.includes(needle)),
  )

  return (
    <>
      <PageHeader title={t('common.crawlers')} description={t('crawlers.description')} />
      <Group mb="md" maw={420}>
        <SearchInput
          value={search}
          onSearch={setSearch}
          label={t('crawlers.search')}
          placeholder={t('crawlers.searchPlaceholder')}
        />
      </Group>

      {crawlers.length === 0 ? (
        <Card withBorder>
          <EmptyState
            title={t('crawlers.noMatch.title')}
            description={t('crawlers.noMatch.description')}
          />
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
          {crawlers.map((crawler) => (
            <CrawlerCard
              key={crawler.id}
              icon={crawler.icon}
              title={t(crawler.name)}
              description={t(crawler.description)}
              to={modulePath(crawler.id)}
              ready={crawler.categories.some((category) => category.sections)}
            >
              {/* Nhiều loại dữ liệu: mỗi loại một dòng "tên + số liệu" để biết số nào của loại nào. */}
              {crawler.categories.map((category) =>
                crawler.categories.length > 1 ? (
                  <div key={category.id}>
                    <Text size="sm" fw={600}>
                      {t(category.name)}
                    </Text>
                    {category.Summary && <category.Summary />}
                  </div>
                ) : (
                  category.Summary && <category.Summary key={category.id} />
                ),
              )}
            </CrawlerCard>
          ))}
          {!search && (
            <Card withBorder padding="lg" bg="transparent" style={{ borderStyle: 'dashed' }}>
              <Stack align="center" justify="center" gap={6} h="100%" mih={140}>
                <ThemeIcon size={40} radius="xl" variant="light" color="gray" aria-hidden>
                  <IconPlus size={22} stroke={1.6} />
                </ThemeIcon>
                <Text fw={600}>{t('crawlers.more.title')}</Text>
                <Text size="sm" c="dimmed" ta="center">
                  <Trans i18nKey="crawlers.more.description" components={{ code: <Code /> }} />
                </Text>
              </Stack>
            </Card>
          )}
        </SimpleGrid>
      )}
    </>
  )
}
