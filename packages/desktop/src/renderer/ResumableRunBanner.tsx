import React from 'react'
import {
  resumableRunActionLabel,
  resumableRunCopy,
  type DaemonResumableRun,
} from '@sepilotd/api-client'
import { useLocale } from './useLocale'

const RESUMABLE_BANNER_COPY = {
  en: 'Interrupted run available',
  ko: '중단된 실행이 있습니다',
} as const

interface ResumableRunBannerProps {
  resumableRun: DaemonResumableRun
  onResume: () => void | Promise<void>
}

export function ResumableRunBanner({
  resumableRun,
  onResume,
}: ResumableRunBannerProps) {
  const { locale } = useLocale()
  return (
    <div className="chat-resume-banner">
      <div className="chat-resume-copy">
        <strong>{RESUMABLE_BANNER_COPY[locale] ?? RESUMABLE_BANNER_COPY.en}</strong>
        <span>{resumableRunCopy(resumableRun)}</span>
      </div>
      <button
        className="message-tool-action message-tool-action-primary"
        onClick={() => void onResume()}
      >
        {resumableRunActionLabel(resumableRun)}
      </button>
    </div>
  )
}
