import { Center, Image } from '@mantine/core'
import { IconBook } from '@tabler/icons-react'
import { useState } from 'react'

interface CoverProps {
  url: string | null
  width: number
}

const RADIUS = 'var(--mantine-radius-default)'

/** Ảnh bìa tỉ lệ 2:3; không có ảnh hoặc ảnh hỏng thì hiện ô giữ chỗ. */
export function Cover({ url, width }: CoverProps) {
  const [broken, setBroken] = useState(false)
  const height = Math.round(width * 1.5)

  if (!url || broken) {
    return (
      <Center
        w={width}
        h={height}
        bg="var(--mantine-color-default-hover)"
        style={{ borderRadius: RADIUS }}
      >
        <IconBook size={width * 0.45} stroke={1.2} color="var(--mantine-color-dimmed)" />
      </Center>
    )
  }
  return (
    <Image
      src={url}
      alt=""
      w={width}
      h={height}
      radius={RADIUS}
      loading="lazy"
      // Ảnh nằm trên máy chủ của website nguồn: không gửi kèm địa chỉ trang đang xem.
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}
