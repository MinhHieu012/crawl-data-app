import { useNavigate } from 'react-router'

import { ApiError } from '../api/client'
import { useCreateJob } from '../api/queries'
import type { JobCreate } from '../api/types'
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
        notifySuccess(`Đã tạo job #${job.id}`)
        navigate(`/jobs/${job.id}`)
      },
      onError: (error) => {
        notifyError(error, 'Không tạo được job')
        if (error instanceof ApiError && error.jobId) navigate(`/jobs/${error.jobId}`)
      },
    })

  return { start, isPending: createJob.isPending }
}
