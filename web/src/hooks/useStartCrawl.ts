import { useNavigate } from 'react-router'

import { ApiError } from '../api/client'
import { useCreateJob } from '../api/queries'
import type { JobCreate } from '../api/types'
import i18n from '../i18n'
import { notifyError, notifySuccess } from '../utils/notify'

/**
 * Tạo job từ một nút bấm (trang truyện, trang đọc chương) rồi chuyển sang màn hình theo dõi.
 * Truyện đang được crawl sẵn thì đưa người dùng tới job đang chạy đó.
 */
export function useStartCrawl() {
  const createJob = useCreateJob()
  const navigate = useNavigate()

  const start = (request: JobCreate) =>
    createJob.mutate(request, {
      onSuccess: (job) => {
        notifySuccess(i18n.t('crawl.created', { id: job.id }))
        navigate(`/jobs/${job.id}`)
      },
      onError: (error) => {
        notifyError(error, i18n.t('crawl.createFailed'))
        if (error instanceof ApiError && error.jobId) navigate(`/jobs/${error.jobId}`)
      },
    })

  return { start, isPending: createJob.isPending }
}
