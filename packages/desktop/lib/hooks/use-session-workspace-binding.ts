'use client'

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import type { Transport } from '@/lib/transport/transport-adapter'
import { createSessionsApi } from '@/lib/api/sessions'
import { getDesktopApi } from '@/lib/electron/bridge'
import { useSessionStore } from '@/lib/store/session-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { confirm } from '@/lib/utils/confirm'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'

export type WorkspaceBindingSource = 'session' | 'default' | 'unset'

interface SessionWorkspaceBinding {
  workspacePath: string | null
  source: WorkspaceBindingSource
  bindWorkspace: (path: string | null) => Promise<boolean>
  selectWorkspace: () => Promise<boolean>
  clearWorkspace: () => Promise<boolean>
}

function normalizedWorkspace(path: string | null | undefined): string | null {
  return path?.trim() || null
}

export function useSessionWorkspaceBinding(
  transport: Transport | null | undefined,
): SessionWorkspaceBinding {
  const activeId = useSessionStore((state) => state.activeId)
  const activeSession = useSessionStore((state) =>
    state.sessions.find((session) => session.id === state.activeId) ?? null,
  )
  const upsertSession = useSessionStore((state) => state.upsertSession)
  const defaultWorkspace = useSettingsStore((state) => state.general.workingDir)

  const sessionWorkspace = normalizedWorkspace(activeSession?.cwd)
  const normalizedDefault = normalizedWorkspace(defaultWorkspace)
  const workspacePath = sessionWorkspace ?? (!activeSession ? normalizedDefault : null)
  const source: WorkspaceBindingSource = sessionWorkspace
    ? 'session'
    : !activeSession && normalizedDefault
      ? 'default'
      : 'unset'

  const bindWorkspace = useCallback(
    async (path: string | null): Promise<boolean> => {
      if (!activeSession || !activeId) {
        toast.error('워크스페이스를 연결할 대화가 없습니다.')
        return false
      }

      const next = normalizedWorkspace(path)
      const currentBinding = normalizedWorkspace(activeSession.cwd)
      if (currentBinding === next && source === 'session') return true

      const approved = await confirm(
        [
          '이 대화에서 파일을 읽고 변경할 기준 폴더를 바꿉니다.',
          '',
          `현재: ${workspacePath ?? '연결되지 않음'}`,
          `변경: ${next ?? '세션 연결 해제'}`,
          '',
          '선택한 폴더가 이 대화의 workspace root가 되며, 그 밖의 파일 접근은 차단됩니다.',
        ].filter(Boolean).join('\n'),
        {
          title: next ? '이 대화의 워크스페이스를 변경할까요?' : '세션 워크스페이스를 해제할까요?',
          confirmLabel: next ? '이 폴더에 연결' : '세션 연결 해제',
          cancelLabel: '취소',
        },
      )
      if (!approved) return false

      try {
        if (transport && !activeSession.isDraft && !(await isBrowserPreviewTransport(transport))) {
          const updated = await (await createSessionsApi(transport)).updateWorkspace(activeId, next)
          upsertSession(updated)
        } else {
          upsertSession({ ...activeSession, cwd: next ?? undefined, updatedAt: Date.now() })
        }
        return true
      } catch (error) {
        toast.error('워크스페이스를 변경하지 못했습니다.', {
          description: error instanceof Error ? error.message : '알 수 없는 오류',
        })
        return false
      }
    }, [
      activeId,
      activeSession,
      source,
      transport,
      upsertSession,
      workspacePath,
    ],
  )

  const selectWorkspace = useCallback(async (): Promise<boolean> => {
    const selected = await getDesktopApi()?.selectDirectory(
      workspacePath ?? normalizedDefault ?? undefined,
    )
    if (typeof selected !== 'string' || !selected.trim()) return false
    return bindWorkspace(selected)
  }, [bindWorkspace, normalizedDefault, workspacePath])

  const clearWorkspace = useCallback(async (): Promise<boolean> => {
    if (source !== 'session') return true
    return bindWorkspace(null)
  }, [bindWorkspace, source])

  return useMemo(
    () => ({ workspacePath, source, bindWorkspace, selectWorkspace, clearWorkspace }),
    [bindWorkspace, clearWorkspace, selectWorkspace, source, workspacePath],
  )
}
