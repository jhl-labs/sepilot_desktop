'use client'

import { useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createSessionsApi } from '@/lib/api/sessions'
import { useChatStore } from '@/lib/store/chat-store'
import { useSessionStore } from '@/lib/store/session-store'
import { confirm } from '@/lib/utils/confirm'

export function SessionExecutionBoundary() {
  const transport = useOptionalTransport()
  const session = useSessionStore((s) => s.sessions.find((item) => item.id === s.activeId))
  const pending = useChatStore((s) => s.pending)
  const [saving, setSaving] = useState(false)
  const policy = session?.workspaceIsolation === 'policy'
  const disabled = saving || pending || session?.isRunning || !transport || !session?.cwd || session.isDraft

  async function changeBoundary() {
    if (disabled || !session || !transport) return
    const target = session
    const next = policy ? 'strict' : 'policy'
    setSaving(true)
    try {
      const approved = await confirm(
        policy
          ? `“${target.title}” 대화에 폴더 격리를 적용합니다. 격리 실행을 지원하지 않는 환경에서는 명령 실행 도구를 사용할 수 없습니다. 기존 실행 재개 상태는 초기화됩니다.`
          : `“${target.title}” 대화에서 로컬 명령 실행을 허용할까요? 작업 디렉터리는 ${target.cwd}입니다. OS 수준 폴더 격리가 없어 명령이 다른 파일이나 네트워크에 접근할 수 있습니다. 기존 도구 승인 정책은 유지되며, 다른 대화에는 적용되지 않습니다. 기존 실행 재개 상태는 초기화됩니다.`,
        { title: policy ? '폴더 격리로 변경' : '이 대화의 로컬 실행 허용', confirmLabel: policy ? '격리 적용' : '이 대화에 허용', cancelLabel: '취소' },
      )
      if (!approved) return
      const updated = await (await createSessionsApi(transport)).updateWorkspaceIsolation(target.id, next)
      useSessionStore.getState().upsertSession(updated)
      toast.success(policy ? '이 대화에 폴더 격리를 적용했습니다.' : '이 대화에만 로컬 실행을 허용했습니다.')
    } catch (error) {
      toast.error('실행 범위를 변경하지 못했습니다.', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <button type="button" disabled={Boolean(disabled)} onClick={() => void changeBoundary()}
      aria-label="이 대화의 실행 범위 변경"
      title={pending || session?.isRunning ? '실행이 끝난 후 변경할 수 있습니다.'
        : !session?.cwd || session.isDraft ? '작업공간이 연결된 저장된 대화에서 변경할 수 있습니다.'
          : policy ? '로컬 실행: OS 폴더 격리 없음. 기존 도구 승인 정책 적용. 클릭하여 폴더 격리로 변경.'
            : '폴더 격리: 격리 런타임이 없으면 명령 실행 불가. 클릭하여 이 대화만 로컬 실행 허용.'}
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 disabled:opacity-50 ${policy ? 'border-amber-500/40 text-amber-700 dark:text-amber-300' : 'border-border text-muted-foreground'}`}>
      {policy ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {saving ? '변경 중…' : policy ? '로컬 실행' : '폴더 격리'}
    </button>
  )
}
