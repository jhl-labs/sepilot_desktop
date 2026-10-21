import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface DaemonVoiceStatus {
  transport: 'turn'
  transcription: {
    engine: 'local-whisper'
    configured: boolean
    defaultModel: string
    language: string | null
  }
  synthesis: {
    engine: 'local-piper'
    configured: boolean
    defaultLanguage: string | null
    availableLanguages: string[]
  }
  realtime: {
    protocol: 'sepilotd.voice.v1'
    websocket: { available: boolean; path: string }
    webrtc: { signaling: boolean; media: boolean; reason?: string }
  }
}

export interface DaemonVoiceAudio {
  fileId: string
  url: string
  mimeType: string
  size: number
}

export interface DaemonVoiceTurnResult {
  sessionId: string
  messageId: string
  content: string
  transcript: string
  transcription: {
    model: string | null
    language: string | null
  }
  speech: {
    requested: boolean
    generated: boolean
    language: string | null
    error?: { code: string; message: string }
  }
  audio?: DaemonVoiceAudio
}

export interface DaemonVoiceSpeechResult {
  language: string | null
  truncated: boolean
  inputChars: number
  spokenChars: number
  audio: DaemonVoiceAudio
}

export interface VoiceApi {
  status: () => Promise<DaemonVoiceStatus>
  voiceTurn: (options: {
    fileId?: string
    text?: string
    sessionId?: string
    provider?: string
    model?: string
    inputLanguage?: string
    outputLanguage?: string
    language?: string
    transcriptionModel?: string
    thinkingLevel?: 'auto' | 'off' | 'low' | 'medium' | 'high' | 'max'
    purpose?: 'conversation' | 'meeting_notes'
    tts?: boolean
  }) => Promise<DaemonVoiceTurnResult>
  speech: (options: {
    text: string
    language?: string
    signal?: AbortSignal
  }) => Promise<DaemonVoiceSpeechResult>
  audioBlob: (fileId: string, signal?: AbortSignal) => Promise<Blob>
}

export async function createVoiceApi(transport: Transport): Promise<VoiceApi> {
  const cfg = await transport.getConfig()
  const http = await makeHttp(transport)
  const authHeaders = (): HeadersInit =>
    cfg.daemonToken ? { authorization: `Bearer ${cfg.daemonToken}` } : {}

  return {
    status: async () => {
      const body = await getJson<{ data: DaemonVoiceStatus }>(
        http,
        '/api/v1/voice/status',
        'voice',
      )
      return body.data
    },
    voiceTurn: async (options) => {
      const body = await sendJson<{ data: DaemonVoiceTurnResult }>(
        http,
        'POST',
        '/api/v1/voice/turn',
        options,
        'voice',
      )
      return body.data
    },
    speech: async ({ signal, ...body }) => {
      const res = await fetch(http.url('/api/v1/voice/speech'), {
        method: 'POST',
        headers: http.headers(),
        body: JSON.stringify(body),
        signal,
      })
      if (res.status === 404) throw new Error('voice capability is not available')
      if (!res.ok) throw new Error(`/api/v1/voice/speech failed (${res.status})`)
      const envelope = (await res.json()) as { data: DaemonVoiceSpeechResult }
      return envelope.data
    },
    audioBlob: async (fileId, signal) => {
      const res = await fetch(
        http.url(`/api/v1/files/${encodeURIComponent(fileId)}/download`),
        { headers: authHeaders(), signal },
      )
      if (!res.ok) throw new Error(`voice audio download failed (${res.status})`)
      return res.blob()
    },
  }
}
