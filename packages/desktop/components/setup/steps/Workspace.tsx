'use client'

import { useEffect, useState } from 'react'
import { Check, FolderOpen, HardDrive, Info, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createSettingsApi } from '@/lib/api/settings'
import { useSettingsStore } from '@/lib/store/settings-store'
import { getDesktopApi } from '@/lib/electron/bridge'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function Workspace() {
  const transport = useOptionalTransport()
  const general = useSettingsStore((state) => state.general)
  const setGeneral = useSettingsStore((state) => state.setGeneral)
  const [workingDirInput, setWorkingDirInput] = useState(general.workingDir ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const canBrowseForDirectory = Boolean(getDesktopApi()?.selectDirectory)

  useEffect(() => {
    setWorkingDirInput(general.workingDir ?? '')
  }, [general.workingDir])

  async function persistWorkingDir(next: string | null) {
    const normalized = next?.trim() || null
    if (normalized === (general.workingDir ?? null)) return

    setSaving(true)
    setSaved(false)
    setGeneral({ workingDir: normalized })
    try {
      if (transport && !(await isBrowserPreviewTransport(transport))) {
        const api = await createSettingsApi(transport)
        await api.setGeneral({ workingDir: normalized })
      }
      setSaved(true)
    } catch (error) {
      toast.error('작업 폴더를 저장하지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setSaving(false)
    }
  }

  async function browseWorkingDirectory() {
    const nextDirectory = await getDesktopApi()?.selectDirectory(
      workingDirInput || general.workingDir || undefined,
    )
    if (typeof nextDirectory !== 'string') return
    setWorkingDirInput(nextDirectory)
    await persistWorkingDir(nextDirectory)
  }

  const hasCustomDirectory = workingDirInput.trim().length > 0

  return (
    <section className="space-y-5" aria-label="기본 작업 폴더 설정">
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <HardDrive className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="setup-working-directory" className="text-sm font-semibold">
              기본 작업 폴더
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              자주 작업하는 프로젝트나 저장소의 최상위 폴더를 지정하세요.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Input
            id="setup-working-directory"
            value={workingDirInput}
            onChange={(event) => {
              setWorkingDirInput(event.target.value)
              setSaved(false)
            }}
            onBlur={() => void persistWorkingDir(workingDirInput)}
            placeholder={'예: C:\\projects\\my-app'}
            className="h-10 font-mono text-xs"
          />
          <Button
            variant="outline"
            className="h-10 rounded-lg"
            onClick={() => void persistWorkingDir(workingDirInput)}
            disabled={saving}
          >
            {saved ? (
              <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? '저장 중…' : saved ? '저장됨' : '적용'}
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-lg"
            onClick={() => void browseWorkingDirectory()}
            disabled={!canBrowseForDirectory || saving}
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            폴더 선택
          </Button>
        </div>

        {!canBrowseForDirectory ? (
          <p className="mt-2 text-xs text-muted-foreground">
            브라우저 미리보기에서는 폴더 경로를 직접 입력해 주세요.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground">현재 기준 위치</p>
          <p
            className="mt-2 truncate font-mono text-xs font-medium"
            title={workingDirInput || undefined}
          >
            {hasCustomDirectory ? workingDirInput : '로컬 실행 환경의 기본 폴더'}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground">나중에 변경</p>
          <p className="mt-2 text-xs leading-5">설정 → 일반 → 작업 공간</p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        폴더를 비워두면 로컬 실행 환경의 기본 위치를 사용합니다. 대화마다 다른 폴더를 선택할 수도
        있습니다.
      </div>
    </section>
  )
}
