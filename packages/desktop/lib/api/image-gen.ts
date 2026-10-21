import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type {
  ImageCanvasOperation,
  ImageCanvasOutputKind,
  ImageCanvasRecommendedModel,
} from '@sepilotd/api-client/daemon/image-canvas'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type MediaOperation = ImageCanvasOperation

export interface ImageJob {
  id: string
  providerId?: string
  prompt: string
  status: JobStatus
  progress: number
  outputs: { id: string; mime?: string; kind?: ImageCanvasOutputKind }[]
  error: string | null
  createdAt: number
}

export interface ImageProvider {
  id: string
  label: string
  enabled: boolean
  operations?: MediaOperation[]
  recommendedModels?: ImageCanvasRecommendedModel[]
  hardware?: {
    supportsDeviceSelection?: boolean
    devicesEndpoint?: string
  }
}

export interface ImageGenHardwareDevice {
  id: string
  label: string
  kind: 'cuda' | 'mps' | 'cpu'
  index?: number
  name: string
  memoryTotalMiB: number | null
  memoryFreeMiB: number | null
  available: boolean
}

export interface ImageGenHardwareSnapshot {
  collectedAt: string
  devices: ImageGenHardwareDevice[]
  gpuAvailable: boolean
  reason?: string
}

export interface ImageModelCacheStatus {
  modelId: string
  cached: boolean
  cachePath?: string
  dependencies?: Array<{
    kind: 'lora'
    modelId: string
    cached: boolean
    cachePath?: string
  }>
}

export type ImageModelStatusSnapshot = Record<string, Record<string, ImageModelCacheStatus>>

export interface ImageProviderEnvironmentStatus {
  providerId: string
  ready: boolean
  code?:
    | 'python_unavailable'
    | 'venv_module_unavailable'
    | 'venv_broken'
    | 'venv_pip_unavailable'
    | 'venv_packages_broken'
  message: string
  python: {
    ok: boolean
    command: string
    version?: string
    error?: string
  }
  venv: {
    ok: boolean
    path: string
    pythonPath: string
    state: 'missing' | 'needs-install' | 'ready' | 'broken'
    packagesInstalled: boolean
    error?: string
  }
}

export type ImageEnvironmentStatusSnapshot = Record<string, ImageProviderEnvironmentStatus>

export interface ImageGenApi {
  providers: () => Promise<ImageProvider[]>
  environmentStatus: (providerId?: string) => Promise<ImageEnvironmentStatusSnapshot>
  modelStatus: (providerId?: string) => Promise<ImageModelStatusSnapshot>
  list: (limit?: number) => Promise<ImageJob[]>
  enqueue: (input: {
    providerId: string
    prompt: string
    params?: Record<string, unknown>
  }) => Promise<ImageJob>
  cancel: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  hardware: () => Promise<ImageGenHardwareSnapshot>
  fileUrl: (fileId: string) => string
  fileFetch: (fileId: string) => Promise<Blob>
  events: (h: { onJob: (job: ImageJob) => void; onError: (e: Error) => void }) => () => void
}

export async function createImageGenApi(transport: Transport): Promise<ImageGenApi> {
  const cfg = await transport.getConfig()
  const http = await makeHttp(transport)
  const wsBase = cfg.daemonOrigin.replace(/^http/, 'ws')
  const tokenQuery = cfg.daemonToken ? `?token=${encodeURIComponent(cfg.daemonToken)}` : ''
  return {
    providers: () => getJson<ImageProvider[]>(http, '/image-gen/providers', 'image-gen'),
    environmentStatus: (providerId) =>
      getJson<ImageEnvironmentStatusSnapshot>(
        http,
        `/image-gen/environment${
          providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''
        }`,
        'image-gen',
      ),
    modelStatus: (providerId) =>
      getJson<ImageModelStatusSnapshot>(
        http,
        `/image-gen/model-status${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`,
        'image-gen',
      ),
    hardware: () => getJson<ImageGenHardwareSnapshot>(http, '/image-gen/hardware', 'image-gen'),
    list: (limit = 200) => getJson<ImageJob[]>(http, `/image-gen/jobs?limit=${limit}`, 'image-gen'),
    enqueue: (input) => sendJson<ImageJob>(http, 'POST', '/image-gen/jobs', input, 'image-gen'),
    cancel: (id) =>
      sendJson<void>(
        http,
        'POST',
        `/image-gen/jobs/${encodeURIComponent(id)}/cancel`,
        {},
        'image-gen',
      ),
    remove: (id) =>
      sendJson<void>(http, 'DELETE', `/image-gen/jobs/${encodeURIComponent(id)}`, {}, 'image-gen'),
    fileUrl: (fileId) =>
      `${cfg.daemonOrigin}/image-gen/files/${encodeURIComponent(fileId)}${tokenQuery}`,
    async fileFetch(fileId) {
      const url = `${cfg.daemonOrigin}/image-gen/files/${encodeURIComponent(fileId)}${tokenQuery}`
      const r = await fetch(url, {
        headers: cfg.daemonToken ? { authorization: `Bearer ${cfg.daemonToken}` } : undefined,
      })
      if (!r.ok) throw new Error(`file ${fileId} failed (${r.status})`)
      return r.blob()
    },
    events: (h) => {
      try {
        const ws = new WebSocket(`${wsBase}/image-gen/events${tokenQuery}`)
        ws.onmessage = (ev) => {
          try {
            h.onJob(JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ImageJob)
          } catch (err) {
            h.onError(err as Error)
          }
        }
        ws.onerror = () => h.onError(new Error('image-gen event stream error'))
        return () => ws.close()
      } catch (err) {
        h.onError(err as Error)
        return () => {}
      }
    },
  }
}
