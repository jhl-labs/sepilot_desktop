'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSettingsJsonApi } from '@/lib/api/settings-json'
import { createVoiceApi, type DaemonVoiceStatus } from '@/lib/api/voice'
import { registerSettingsTab } from './registry'

interface VoiceForm {
  transcription: {
    whisperBin: string
    model: string
    language: string
  }
  synthesis: {
    piperBin: string
    model: string
    language: string
  }
}

const DEFAULTS: VoiceForm = {
  transcription: {
    whisperBin: '',
    model: 'base',
    language: '',
  },
  synthesis: {
    piperBin: '',
    model: '',
    language: '',
  },
}

registerSettingsTab({
  key: 'voice',
  section: 'integrations',
  label: 'Voice',
  search: ['voice', 'speech', 'stt', 'tts', 'whisper', 'piper', 'microphone', 'mic'],
  render: () => <VoiceSettingsTab />,
})

function pickVoiceForm(doc: Record<string, unknown>): VoiceForm {
  const voice =
    typeof doc.voice === 'object' && doc.voice !== null
      ? (doc.voice as Record<string, unknown>)
      : {}
  const transcription =
    typeof voice.transcription === 'object' && voice.transcription !== null
      ? (voice.transcription as Record<string, unknown>)
      : {}
  const synthesis =
    typeof voice.synthesis === 'object' && voice.synthesis !== null
      ? (voice.synthesis as Record<string, unknown>)
      : {}
  return {
    transcription: {
      whisperBin:
        typeof transcription.whisperBin === 'string'
          ? transcription.whisperBin
          : DEFAULTS.transcription.whisperBin,
      model:
        typeof transcription.model === 'string'
          ? transcription.model
          : DEFAULTS.transcription.model,
      language:
        typeof transcription.language === 'string'
          ? transcription.language
          : DEFAULTS.transcription.language,
    },
    synthesis: {
      piperBin:
        typeof synthesis.piperBin === 'string' ? synthesis.piperBin : DEFAULTS.synthesis.piperBin,
      model: typeof synthesis.model === 'string' ? synthesis.model : DEFAULTS.synthesis.model,
      language:
        typeof synthesis.language === 'string' ? synthesis.language : DEFAULTS.synthesis.language,
    },
  }
}

function buildVoiceConfig(form: VoiceForm): Record<string, unknown> {
  const transcription: Record<string, unknown> = {}
  const synthesis: Record<string, unknown> = {}
  if (form.transcription.whisperBin.trim()) {
    transcription.whisperBin = form.transcription.whisperBin.trim()
  }
  if (form.transcription.model.trim()) transcription.model = form.transcription.model.trim()
  if (form.transcription.language.trim()) {
    transcription.language = form.transcription.language.trim()
  }
  if (form.synthesis.piperBin.trim()) synthesis.piperBin = form.synthesis.piperBin.trim()
  if (form.synthesis.model.trim()) synthesis.model = form.synthesis.model.trim()
  if (form.synthesis.language.trim()) synthesis.language = form.synthesis.language.trim()
  return { transcription, synthesis }
}

export function VoiceSettingsTab() {
  const transport = useTransport()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<VoiceForm>(DEFAULTS)
  const [voiceStatus, setVoiceStatus] = useState<DaemonVoiceStatus | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const [settingsApi, voiceApi] = await Promise.all([
        createSettingsJsonApi(transport),
        createVoiceApi(transport),
      ])
      const [nextDoc, nextStatus] = await Promise.all([
        settingsApi.get(),
        voiceApi.status().catch(() => null),
      ])
      setDoc(nextDoc)
      setForm(pickVoiceForm(nextDoc))
      setVoiceStatus(nextStatus)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'voice settings load failed')
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const [settingsApi, voiceApi] = await Promise.all([
          createSettingsJsonApi(transport),
          createVoiceApi(transport),
        ])
        const [nextDoc, nextStatus] = await Promise.all([
          settingsApi.get(),
          voiceApi.status().catch(() => null),
        ])
        if (cancelled) return
        setDoc(nextDoc)
        setForm(pickVoiceForm(nextDoc))
        setVoiceStatus(nextStatus)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'voice settings load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save(): Promise<void> {
    if (!doc) return
    setStatus('saving')
    try {
      const api = await createSettingsJsonApi(transport)
      const nextDoc = {
        ...doc,
        voice: buildVoiceConfig(form),
      }
      const saved = await api.set(nextDoc)
      setDoc(saved)
      setForm(pickVoiceForm(saved))
      setStatus('ready')
      toast.success('Voice 설정을 저장했습니다.')
      const voiceApi = await createVoiceApi(transport)
      setVoiceStatus(await voiceApi.status().catch(() => null))
    } catch (err) {
      setStatus('ready')
      toast.error('Voice 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    }
  }

  if (status === 'loading') return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error') return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Speech To Text</h4>
          <p className="text-xs text-muted-foreground">
            음성 입력과 회의 기록이 사용할 로컬 Whisper 실행 파일입니다. 설정값은 환경 변수보다
            우선합니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Whisper Binary</label>
            <Input
              value={form.transcription.whisperBin}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  transcription: { ...prev.transcription, whisperBin: event.target.value },
                }))
              }
              placeholder="whisper 또는 C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\whisper.exe"
            />
            <p className="text-xs text-muted-foreground">
              비워두면 PATH의 `whisper` 또는 `SEPILOTD_WHISPER_BIN`을 사용합니다.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={form.transcription.model}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  transcription: { ...prev.transcription, model: event.target.value },
                }))
              }
            >
              <option value="tiny">tiny</option>
              <option value="base">base</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <Input
              value={form.transcription.language}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  transcription: { ...prev.transcription, language: event.target.value },
                }))
              }
              placeholder="auto, ko, en"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Text To Speech</h4>
          <p className="text-xs text-muted-foreground">
            답변 음성 재생에 사용할 로컬 Piper 실행 파일과 .onnx voice model입니다. 설정값은 환경
            변수보다 우선합니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Piper Binary</label>
            <Input
              value={form.synthesis.piperBin}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  synthesis: { ...prev.synthesis, piperBin: event.target.value },
                }))
              }
              placeholder="piper 또는 C:\\tools\\piper\\piper.exe"
            />
            <p className="text-xs text-muted-foreground">
              비워두면 PATH의 `piper` 또는 `SEPILOTD_PIPER_BIN`을 사용합니다.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Voice Model (.onnx)</label>
            <Input
              value={form.synthesis.model}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  synthesis: { ...prev.synthesis, model: event.target.value },
                }))
              }
              placeholder="C:\\voices\\ko_KR-kss-medium.onnx"
            />
            <p className="text-xs text-muted-foreground">
              Piper release의 `.onnx` voice model 경로입니다. 비워두면 `SEPILOTD_PIPER_MODEL`을
              사용합니다.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Language</label>
            <Input
              value={form.synthesis.language}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  synthesis: { ...prev.synthesis, language: event.target.value },
                }))
              }
              placeholder="auto, ko, en"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <h4 className="text-sm font-semibold">Current Backend</h4>
        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
          <div>
            <div className="font-medium text-foreground">Transcription</div>
            <div>
              {voiceStatus?.transcription.configured ? 'configured' : 'default / missing binary'}
            </div>
          </div>
          <div>
            <div className="font-medium text-foreground">STT Model</div>
            <div>{voiceStatus?.transcription.defaultModel ?? form.transcription.model}</div>
          </div>
          <div>
            <div className="font-medium text-foreground">TTS</div>
            <div>{voiceStatus?.synthesis.configured ? 'configured' : 'missing voice model'}</div>
          </div>
          <div>
            <div className="font-medium text-foreground">Language</div>
            <div>
              {voiceStatus?.synthesis.defaultLanguage ??
                voiceStatus?.transcription.language ??
                (form.synthesis.language || form.transcription.language || 'auto')}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reload()}
            disabled={status === 'saving'}
          >
            새로고침
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>
            {status === 'saving' ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}
