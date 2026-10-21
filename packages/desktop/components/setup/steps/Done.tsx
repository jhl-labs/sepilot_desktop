'use client'

import { Cpu, FolderKanban, MessageSquareText, Settings2 } from 'lucide-react'
import { useSettingsStore } from '@/lib/store/settings-store'

export function Done() {
  const llm = useSettingsStore((state) => state.llm)
  const general = useSettingsStore((state) => state.general)
  const modelSummary = llm.providerId
    ? llm.modelId
      ? `${llm.providerId} · ${llm.modelId}`
      : llm.providerId
    : '기본값 없이 시작'
  const workspaceSummary = general.workingDir || '로컬 실행 환경의 기본 폴더'

  return (
    <section className="space-y-5" aria-label="시작 설정 요약">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold">기본 AI 모델</p>
          </div>
          <p className="mt-3 truncate font-mono text-xs font-medium" title={modelSummary}>
            {modelSummary}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold">기본 작업 폴더</p>
          </div>
          <p className="mt-3 truncate font-mono text-xs font-medium" title={workspaceSummary}>
            {workspaceSummary}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-teal-500/20 bg-teal-500/[0.06] p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold">첫 대화에서 하고 싶은 일을 알려주세요</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              파일 수정, 조사, 문서 작성처럼 원하는 결과를 설명하면 SE Pilot이 필요한 단계를 함께
              정리합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Settings2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        방금 선택한 값은 설정에서 언제든 다시 바꿀 수 있습니다.
      </div>
    </section>
  )
}
