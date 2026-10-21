'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invokeDesktop } from '@/lib/electron/bridge'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { CLI_MODEL_BACKENDS, isCliModelBackend, validateCliModel, type CliModel, type CliModelBackend } from '@/lib/chat/cli-models'
import { type ChatBackendId } from '@/lib/chat/chat-backends'

const STORAGE_KEY = 'sepilot.cli-models.v1'
export function CliModelPicker({ backend, cwd, disabled = false }: { backend: CliModelBackend; cwd?: string; disabled?: boolean }) {
  const { t } = useTranslation()
  const selected = useChatModeStore((s) => s.backendModels[backend]) ?? ''
  const setModel = useChatModeStore((s) => s.setBackendModel)
  const [catalog, setCatalog] = useState<{ backend: string; cwd?: string; models: CliModel[]; error?: string } | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      if (saved && typeof saved === 'object') {
        for (const id of CLI_MODEL_BACKENDS) {
          const value = validateCliModel((saved as Record<string, unknown>)[id])
          if (value) setModel(id, value)
        }
      }
    } catch {}
  }, [setModel])
  useEffect(() => {
    let active = true
    setLoading(true)
    void invokeDesktop<CliModel[]>('sepilot:cli/models', backend, cwd).then((models) => {
      if (!models) throw new Error('Desktop CLI model discovery is unavailable')
      if (active) setCatalog({ backend, cwd, models })
    }).catch((error: unknown) => {
      if (active) setCatalog({ backend, cwd, models: [], error: error instanceof Error ? error.message : String(error) })
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [backend, cwd, revision])
  const current = catalog?.backend === backend && catalog.cwd === cwd ? catalog : null
  const models = current?.models ?? []
  return <span className="inline-flex flex-wrap items-center gap-1">
    <select aria-label={t('chatBackend.model')} value={selected} disabled={disabled || loading}
      className="max-w-64 rounded border bg-background px-1 py-0.5"
      onChange={(event) => {
        const model = event.target.value
        setModel(backend, model)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(useChatModeStore.getState().backendModels)) } catch {}
      }}>
      <option value="">{t('chatBackend.defaultModel')}</option>
      {selected && !models.some((model) => model.id === selected) ? <option value={selected}>{selected} — {t('chatBackend.unverifiedModel')}</option> : null}
      {models.map((model) => <option key={model.id} value={model.id}>{model.label} ({model.id})</option>)}
    </select>
    <button type="button" disabled={disabled || loading} onClick={() => setRevision((value) => value + 1)}>{t('chatBackend.refreshModels')}</button>
    {loading ? <span role="status">{t('chatBackend.loadingModels')}</span> : null}
    {current?.error ? <span role="alert">{t('chatBackend.modelLoadFailed')}: {current.error}</span> : null}
    {models.find((model) => model.id === selected)?.description ? <span>{models.find((model) => model.id === selected)?.description}</span> : null}
  </span>
}

export function CliModelSettings({ backend, cwd, disabled }: { backend: ChatBackendId; cwd?: string; disabled: boolean }) {
  return isCliModelBackend(backend)
    ? <CliModelPicker backend={backend} cwd={cwd} disabled={disabled} />
    : null
}
