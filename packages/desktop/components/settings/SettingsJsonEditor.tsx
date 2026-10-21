'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTransport } from '@/components/providers/transport-provider'
import { createSettingsJsonApi } from '@/lib/api/settings-json'
import { recordSettingsSave } from '@/lib/store/settings-save-store'
import { Button } from '@/components/ui/button'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'settings-json',
  section: 'system',
  label: 'JSON Editor',
  search: ['json', 'raw', 'advanced', 'config.yaml'],
  render: () => <SettingsJsonEditor />,
})

export function SettingsJsonEditor() {
  const transport = useTransport()
  const [text, setText] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const api = await createSettingsJsonApi(transport)
        const json = await api.get()
        if (!cancelled) setText(JSON.stringify(json, null, 2))
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save(): Promise<void> {
    setErr(null)
    setSaving(true)
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const api = await createSettingsJsonApi(transport)
      await api.set(parsed)
      recordSettingsSave('settings-json')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] p-3 text-xs text-amber-700 dark:text-amber-300"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Advanced — 직접 편집은 위험합니다.</p>
          <p className="mt-0.5 text-amber-700/80 dark:text-amber-300/80">
            여기서 변경한 값은 schema 검증을 거치지만, 다른 탭에서 다루지 않는
            키를 직접 바꿉니다. 잘못된 값은 daemon 재시작을 막을 수 있습니다.
            가능한 한 전용 탭(Models / Tools / Notifications…)을 먼저 사용하세요.
          </p>
          {!acknowledged ? (
            <button
              type="button"
              onClick={() => setAcknowledged(true)}
              className="mt-1.5 rounded px-2 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline"
            >
              위험을 이해했습니다 — 편집 활성화
            </button>
          ) : null}
        </div>
      </div>

      <textarea
        className="min-h-[420px] w-full rounded-md border border-border bg-transparent p-2 font-mono text-xs disabled:opacity-50"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!acknowledged}
        spellCheck={false}
      />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          disabled={saving || !acknowledged}
          onClick={() => void save()}
        >
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}
