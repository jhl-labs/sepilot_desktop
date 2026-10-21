'use client'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { confirm } from '@/lib/utils/confirm'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  DownloadCloud,
  HelpCircle,
  Loader2,
  Maximize2,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  IMAGE_CANVAS_OPERATIONS,
  imageCanvasOperationIsVideo,
  imageCanvasOperationNeedsImage,
  imageCanvasOperationNeedsMask,
  imageCanvasRecommendedModelsFor,
} from '@sepilotd/api-client/daemon/image-canvas'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import { useImageGenStore } from '@/lib/store/image-gen-store'
import {
  createImageGenApi,
  type ImageEnvironmentStatusSnapshot,
  type ImageProviderEnvironmentStatus,
  type ImageGenHardwareDevice,
  type ImageJob,
  type ImageModelStatusSnapshot,
  type ImageProvider,
  type JobStatus,
  type MediaOperation,
} from '@/lib/api/image-gen'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import {
  IMAGE_GEN_SIZE_PRESETS,
  loadImageGenDefaults,
  resolveImageGenSizePreset,
  saveImageGenDefaults,
} from '@/lib/utils/image-gen-defaults'
import { ImageDetailDialog } from './ImageDetailDialog'
import { ImageJobCard } from './ImageJobCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnimplementedBanner } from '@/components/settings/_shared/UnimplementedBanner'

interface FormState {
  operation: MediaOperation
  model: string
  negativePrompt: string
  steps: number
  cfgScale: number
  seed: number
  batchSize: number
  sizePreset: string
  strength: number
  frames: number
  fps: number
  outputFormat: 'mp4' | 'gif'
  imageDataUrl: string
  maskDataUrl: string
  loraPath: string
  loraScale: number
  customParamsJson: string
}

const DEFAULT_FORM: FormState = {
  operation: 'text-to-image',
  model: 'stabilityai/sd-turbo',
  negativePrompt: '',
  steps: 2,
  cfgScale: 0,
  seed: -1,
  batchSize: 1,
  sizePreset: 'sd-512',
  strength: 0.8,
  frames: 16,
  fps: 8,
  outputFormat: 'mp4',
  imageDataUrl: '',
  maskDataUrl: '',
  loraPath: '',
  loraScale: 1,
  customParamsJson: '',
}

const OPERATION_LABELS: Record<MediaOperation, string> = {
  'text-to-image': '이미지 생성',
  'image-to-image': '이미지 편집',
  inpaint: '마스크 편집',
  'text-to-video': '텍스트→비디오',
  'image-to-video': '이미지→비디오',
}

const OPERATIONS = IMAGE_CANVAS_OPERATIONS.map((id) => ({
  id,
  label: OPERATION_LABELS[id],
  needsImage: imageCanvasOperationNeedsImage(id),
  needsMask: imageCanvasOperationNeedsMask(id),
  isVideo: imageCanvasOperationIsVideo(id),
}))

const LOCAL_PYTHON_DEFAULT_MODELS: Partial<Record<MediaOperation, string>> = {
  'text-to-image': 'stabilityai/sd-turbo',
  'image-to-image': 'timbrooks/instruct-pix2pix',
  inpaint: 'runwayml/stable-diffusion-inpainting',
  'text-to-video': 'cerspense/zeroscope_v2_576w',
  'image-to-video': 'stabilityai/stable-video-diffusion-img2vid-xt',
}

type GalleryStatusFilter = JobStatus | 'all' | 'active'
type RecommendedModel = NonNullable<ImageProvider['recommendedModels']>[number]
type GalleryViewMode = 'gallery' | 'canvas'
type ModelAvailabilityKind =
  | 'downloaded'
  | 'needs-download'
  | 'unavailable'
  | 'checking'
  | 'unknown'

interface ModelAvailability {
  kind: ModelAvailabilityKind
  label: string
  detail: string
}

interface GalleryViewProps {
  mode?: GalleryViewMode
}

interface CanvasInput {
  id: string
  label: string
  dataUrl: string
  fileId?: string
  jobId?: string
  outputIndex?: number
  prompt?: string
  mime?: string
}

interface PreviewState {
  job: ImageJob
  urls: string[]
  index: number
}

function operationMeta(operation: MediaOperation) {
  return OPERATIONS.find((item) => item.id === operation) ?? OPERATIONS[0]!
}

function readBlobAsDataUrl(blob: Blob | null): Promise<string> {
  if (!blob) return Promise.resolve('')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'))
    reader.readAsDataURL(blob)
  })
}

function isWindowsBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Win/i.test(`${navigator.platform} ${navigator.userAgent}`)
}

function pickDefaultProvider(
  providers: Array<{ id: string; enabled: boolean }>,
): { id: string; enabled: boolean } | undefined {
  return providers.find((p) => p.enabled && p.id !== 'dummy') ?? providers.find((p) => p.enabled)
}

function localPythonModelFor(operation: MediaOperation): string | undefined {
  return LOCAL_PYTHON_DEFAULT_MODELS[operation]
}

function formatVram(mib: number | null | undefined): string {
  if (!mib) return 'VRAM ?'
  return `${Math.round(mib / 1024)}GB`
}

function deviceCapacityMiB(devices: ImageGenHardwareDevice[], deviceId: string): number | null {
  if (deviceId === 'auto') {
    return devices
      .filter((device) => device.kind !== 'cpu')
      .reduce<number | null>((best, device) => {
        if (!device.memoryTotalMiB) return best
        return best == null ? device.memoryTotalMiB : Math.max(best, device.memoryTotalMiB)
      }, null)
  }
  return devices.find((device) => device.id === deviceId)?.memoryTotalMiB ?? null
}

function modelDeviceStatus(
  model: RecommendedModel,
  devices: ImageGenHardwareDevice[],
  deviceId: string,
): { available: boolean | null; label: string } {
  const selectedDevice =
    deviceId === 'auto' ? null : (devices.find((device) => device.id === deviceId) ?? null)
  const selectedKind = selectedDevice?.kind
  if (selectedKind && model.deviceKinds?.length && !model.deviceKinds.includes(selectedKind)) {
    return { available: false, label: `${selectedKind.toUpperCase()} 미지원` }
  }

  const required = model.minVramMiB ?? model.recommendedVramMiB
  if (!required)
    return { available: true, label: model.workflow?.label ?? model.notes ?? model.label }
  if (deviceId === 'cpu') {
    const cpuSupported = !model.deviceKinds?.length || model.deviceKinds.includes('cpu')
    return {
      available: cpuSupported,
      label: cpuSupported ? `${formatVram(required)}+ · CPU` : 'CPU 미지원',
    }
  }
  const capacity = deviceCapacityMiB(devices, deviceId)
  if (capacity == null) return { available: null, label: `${formatVram(required)}+` }
  return capacity >= required
    ? { available: true, label: `${formatVram(required)}+ · 가능` }
    : { available: false, label: `${formatVram(required)}+ · 부족` }
}

function modelFitLabel(
  model: RecommendedModel,
  devices: ImageGenHardwareDevice[],
  deviceId: string,
): string {
  return modelDeviceStatus(model, devices, deviceId).label
}

function modelCacheSnapshot(
  snapshot: ImageModelStatusSnapshot | null,
  providerId: string,
  model: RecommendedModel,
) {
  return snapshot?.[providerId]?.[model.id] ?? null
}

function modelAvailability(
  model: RecommendedModel,
  providerId: string,
  statusSnapshot: ImageModelStatusSnapshot | null,
  statusLoading: boolean,
  devices: ImageGenHardwareDevice[],
  deviceId: string,
): ModelAvailability {
  const device = modelDeviceStatus(model, devices, deviceId)
  if (device.available === false) {
    return { kind: 'unavailable', label: '사용 불가', detail: device.label }
  }
  if (providerId !== 'local-python') {
    return {
      kind: 'unknown',
      label: '외부 provider',
      detail: '로컬 다운로드 상태를 확인하지 않습니다.',
    }
  }
  if (statusLoading) {
    return { kind: 'checking', label: '확인 중', detail: '로컬 모델 캐시 확인 중' }
  }
  const cached = modelCacheSnapshot(statusSnapshot, providerId, model)
  if (!cached) {
    return { kind: 'unknown', label: '상태 미확인', detail: '모델 캐시 정보를 찾지 못했습니다.' }
  }
  const missingDependency = cached.dependencies?.find((dependency) => !dependency.cached)
  if (cached.cached && !missingDependency) {
    return {
      kind: 'downloaded',
      label: '다운로드됨',
      detail: `로컬 캐시: ${cached.cachePath ?? cached.modelId}`,
    }
  }
  if (cached.cached && missingDependency) {
    return {
      kind: 'needs-download',
      label: 'LoRA 다운로드 필요',
      detail: `${missingDependency.modelId} 캐시가 없습니다.`,
    }
  }
  return {
    kind: 'needs-download',
    label: '다운로드 필요',
    detail: `${cached.modelId} 첫 실행 시 다운로드`,
  }
}

function modelAvailabilityTone(kind: ModelAvailabilityKind): string {
  if (kind === 'downloaded') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  if (kind === 'needs-download') return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  if (kind === 'unavailable') return 'border-red-500/40 bg-red-500/10 text-red-300'
  return 'border-border bg-muted/40 text-muted-foreground'
}

function ModelAvailabilityIcon({ kind }: { kind: ModelAvailabilityKind }) {
  const className = 'h-3.5 w-3.5'
  if (kind === 'downloaded') return <CheckCircle2 className={className} />
  if (kind === 'needs-download') return <DownloadCloud className={className} />
  if (kind === 'unavailable') return <AlertTriangle className={className} />
  if (kind === 'checking') return <Loader2 className={`${className} animate-spin`} />
  return <HelpCircle className={className} />
}

function modelOptionLabel(
  model: RecommendedModel,
  devices: ImageGenHardwareDevice[],
  deviceId: string,
  availability?: ModelAvailability,
): string {
  const workflow = model.workflow?.label ? ` · ${model.workflow.label}` : ''
  const status = availability ? `${availability.label} · ` : ''
  return `${status}${model.label} · ${modelFitLabel(model, devices, deviceId)}${workflow}`
}

function patchFormFromParams(params: Record<string, unknown> | undefined): Partial<FormState> {
  if (!params) return {}
  const patch: Partial<FormState> = {}
  if (typeof params.steps === 'number') patch.steps = params.steps
  if (typeof params.guidanceScale === 'number') patch.cfgScale = params.guidanceScale
  if (typeof params.cfgScale === 'number') patch.cfgScale = params.cfgScale
  if (typeof params.strength === 'number') patch.strength = params.strength
  if (typeof params.frames === 'number') patch.frames = params.frames
  if (typeof params.numFrames === 'number') patch.frames = params.numFrames
  if (typeof params.fps === 'number') patch.fps = params.fps
  if (typeof params.negativePrompt === 'string') patch.negativePrompt = params.negativePrompt
  if (typeof params.loraPath === 'string') patch.loraPath = params.loraPath
  if (typeof params.loraScale === 'number') patch.loraScale = params.loraScale
  return patch
}

function parseParamsJson(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON object만 입력할 수 있습니다.')
  }
  return parsed as Record<string, unknown>
}

function workflowParamsPreview(params: Record<string, unknown> | undefined): string | null {
  if (!params) return null
  const keys = Object.keys(params)
  if (keys.length === 0) return null
  return JSON.stringify(params)
}

interface CanvasEnvironmentBlock {
  title: string
  description: string
  details: string[]
}

function canvasEnvironmentBlockFor(
  providerId: string,
  status: ImageProviderEnvironmentStatus | null,
  loadError: Error | null,
): CanvasEnvironmentBlock | null {
  if (providerId !== 'local-python') return null
  if (loadError) {
    return {
      title: 'Canvas 환경을 확인할 수 없습니다.',
      description: loadError.message,
      details: ['daemon의 image-gen 환경 상태 API가 응답하지 않았습니다.'],
    }
  }
  if (!status || status.ready) return null
  return {
    title: 'Canvas를 사용할 수 없습니다.',
    description: status.message,
    details: [
      `Python: ${status.python.version ?? status.python.command}`,
      `venv: ${status.venv.path}`,
      status.python.error ? `Python 오류: ${status.python.error}` : '',
      status.venv.error ? `venv 오류: ${status.venv.error}` : '',
    ].filter(Boolean),
  }
}

export function GalleryView({ mode = 'canvas' }: GalleryViewProps = {}) {
  const transport = useTransport()
  const canvasMode = mode === 'canvas'
  const jobs = useImageGenStore((s) => s.jobs)
  const setJobs = useImageGenStore((s) => s.setJobs)
  const upsertJob = useImageGenStore((s) => s.upsertJob)
  const removeJob = useImageGenStore((s) => s.removeJob)
  const [prompt, setPrompt] = useState('')
  const [providerId, setProviderId] = useState('')
  const [deviceId, setDeviceId] = useState('auto')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [enqueuing, setEnqueuing] = useState(false)
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  const [statusFilter, setStatusFilter] = useState<GalleryStatusFilter>('active')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [canvasInput, setCanvasInput] = useState<CanvasInput | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const previewRevokeUrls = useRef<string[]>([])

  const provs = useCapabilityResource(
    async () => (await createImageGenApi(transport)).providers(),
    [transport],
  )
  const hardware = useCapabilityResource(
    async () => (await createImageGenApi(transport)).hardware(),
    [transport],
  )
  const modelStatuses = useCapabilityResource(
    async () => (providerId ? (await createImageGenApi(transport)).modelStatus(providerId) : {}),
    [transport, providerId],
  )
  const environmentStatuses = useCapabilityResource<ImageEnvironmentStatusSnapshot>(
    async () =>
      providerId ? (await createImageGenApi(transport)).environmentStatus(providerId) : {},
    [transport, providerId],
  )

  useEffect(() => {
    let cancelled = false
    let unsub = () => {}
    void (async () => {
      const api = await createImageGenApi(transport)
      try {
        const list = await api.list()
        if (!cancelled) setJobs(list)
      } catch {
        if (!cancelled) setJobs([])
      }
      unsub = api.events({
        onJob: (j) => upsertJob(j),
        onError: () => {},
      })
    })()
    return () => {
      cancelled = true
      unsub()
    }
  }, [transport, setJobs, upsertJob])

  useEffect(() => {
    const saved = loadImageGenDefaults()
    setForm({
      operation: (saved.operation as MediaOperation) || 'text-to-image',
      model: saved.model,
      negativePrompt: saved.negativePrompt,
      steps: saved.steps,
      cfgScale: saved.cfgScale,
      seed: saved.seed,
      batchSize: saved.batchSize,
      sizePreset: saved.sizePreset,
      strength: saved.strength,
      frames: saved.frames,
      fps: saved.fps,
      outputFormat: 'mp4',
      imageDataUrl: '',
      maskDataUrl: '',
      loraPath: '',
      loraScale: 1,
      customParamsJson: '',
    })
    if (saved.providerId && saved.providerId !== 'dummy') setProviderId(saved.providerId)
    setDeviceId(saved.deviceId)
    setDefaultsLoaded(true)
  }, [])

  useEffect(() => {
    if (!defaultsLoaded) return
    if (provs.kind === 'ready' && !providerId) {
      const first = pickDefaultProvider(provs.data) ?? provs.data[0]
      if (first) setProviderId(first.id)
    }
  }, [provs, providerId, defaultsLoaded])

  const selectedProvider =
    provs.kind === 'ready' ? provs.data.find((p) => p.id === providerId) : undefined
  const hardwareDevices =
    hardware.kind === 'ready' ? hardware.data.devices.filter((d) => d.available) : []
  const supportsDeviceSelection = selectedProvider?.hardware?.supportsDeviceSelection === true
  const recommendedModels = useMemo(
    () => imageCanvasRecommendedModelsFor(selectedProvider, form.operation),
    [selectedProvider, form.operation],
  )
  const selectedRecommendation = recommendedModels.find((model) => model.id === form.model.trim())
  const recommendedModel = recommendedModels[0]?.id
  const modelPlaceholder = recommendedModel ? `모델: ${recommendedModel}` : '모델: provider 기본값'
  const modelSelectValue = selectedRecommendation ? selectedRecommendation.id : '__custom__'
  const showCustomModelInput = recommendedModels.length === 0 || modelSelectValue === '__custom__'
  const meta = operationMeta(form.operation)
  const selectedDevice = hardwareDevices.find((device) => device.id === deviceId)
  const workflowLabel = selectedRecommendation?.workflow?.label
  const workflowParams = workflowParamsPreview(selectedRecommendation?.params)
  const modelStatusSnapshot = modelStatuses.kind === 'ready' ? modelStatuses.data : null
  const environmentStatusSnapshot =
    environmentStatuses.kind === 'ready' ? environmentStatuses.data : null
  const selectedEnvironmentStatus =
    providerId && environmentStatusSnapshot ? (environmentStatusSnapshot[providerId] ?? null) : null
  const environmentLoadError =
    environmentStatuses.kind === 'error' ? environmentStatuses.error : null
  const canvasEnvironmentBlock = canvasEnvironmentBlockFor(
    providerId,
    selectedEnvironmentStatus,
    environmentLoadError,
  )
  const canvasEnvironmentChecking =
    canvasMode && providerId === 'local-python' && environmentStatuses.kind === 'loading'
  const selectedAvailability = selectedRecommendation
    ? modelAvailability(
        selectedRecommendation,
        providerId,
        modelStatusSnapshot,
        modelStatuses.kind === 'loading',
        hardwareDevices,
        deviceId,
      )
    : null
  const deviceSummary =
    selectedDevice?.label ??
    (hardware.kind === 'ready'
      ? `Auto · ${formatVram(deviceCapacityMiB(hardwareDevices, 'auto'))}`
      : 'Auto')

  const canvasEnvironmentWarningKey = canvasEnvironmentBlock
    ? `${canvasEnvironmentBlock.title}:${canvasEnvironmentBlock.description}`
    : null
  const warnedEnvironmentRef = useRef<string | null>(null)

  useEffect(() => {
    if (!canvasMode || !canvasEnvironmentWarningKey || !canvasEnvironmentBlock) {
      warnedEnvironmentRef.current = null
      return
    }
    if (warnedEnvironmentRef.current === canvasEnvironmentWarningKey) return
    warnedEnvironmentRef.current = canvasEnvironmentWarningKey
    toast.warning(canvasEnvironmentBlock.title, {
      description: canvasEnvironmentBlock.description,
    })
  }, [canvasMode, canvasEnvironmentBlock, canvasEnvironmentWarningKey])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!canvasMode) return
      const items = Array.from(event.clipboardData?.items ?? [])
      const imageItem = items.find((item) => item.type.startsWith('image/'))
      const file = imageItem?.getAsFile()
      if (!file) return
      event.preventDefault()
      void readBlobAsDataUrl(file)
        .then((dataUrl) => {
          const next: CanvasInput = {
            id: `clipboard-${Date.now()}`,
            label: 'Clipboard image',
            dataUrl,
            mime: file.type,
          }
          setCanvasInput(next)
          setForm((current) => ({
            ...current,
            operation: 'image-to-image',
            imageDataUrl: dataUrl,
          }))
          toast.success('클립보드 이미지를 Canvas에 올렸습니다.')
        })
        .catch((error) =>
          toast.error('클립보드 이미지를 읽지 못했습니다.', {
            description: error instanceof Error ? error.message : String(error),
          }),
        )
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canvasMode])

  useEffect(
    () => () => {
      previewRevokeUrls.current.forEach((url) => URL.revokeObjectURL(url))
      previewRevokeUrls.current = []
    },
    [],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<GalleryStatusFilter, number> = {
      all: jobs.length,
      active: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    }
    for (const job of jobs) {
      counts[job.status] += 1
      if (job.status === 'queued' || job.status === 'running' || job.status === 'succeeded') {
        counts.active += 1
      }
    }
    return counts
  }, [jobs])

  const visibleJobs = useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? jobs
        : statusFilter === 'active'
          ? jobs.filter((j) => ['queued', 'running', 'succeeded'].includes(j.status))
          : jobs.filter((j) => j.status === statusFilter)
    return filtered
      .slice()
      .sort((a, b) =>
        sortOrder === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
      )
  }, [jobs, statusFilter, sortOrder])

  if (provs.kind === 'unavailable')
    return (
      <div className="p-4">
        <UnimplementedBanner what="Image Generation" />
      </div>
    )

  if (canvasEnvironmentChecking || (canvasMode && canvasEnvironmentBlock)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex w-full max-w-2xl flex-col gap-4 rounded-md border border-border bg-background p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md border border-border bg-muted/40 p-2">
              {canvasEnvironmentChecking ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">
                {canvasEnvironmentChecking
                  ? 'Canvas 환경을 확인하는 중입니다.'
                  : canvasEnvironmentBlock?.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {canvasEnvironmentChecking
                  ? '로컬 Python과 image-gen venv 상태를 검사하고 있습니다.'
                  : canvasEnvironmentBlock?.description}
              </p>
            </div>
          </div>
          {canvasEnvironmentBlock?.details.length ? (
            <div className="rounded-md border border-border/70 bg-muted/25 p-3 font-mono text-[11px] text-muted-foreground">
              {canvasEnvironmentBlock.details.map((detail) => (
                <div key={detail} className="truncate" title={detail}>
                  {detail}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  function applyOperation(next: MediaOperation): void {
    const recommended = imageCanvasRecommendedModelsFor(selectedProvider, next)[0]
    setForm((current) => ({
      ...current,
      operation: next,
      model: recommended?.id ?? localPythonModelFor(next) ?? current.model,
      ...(recommended?.params ? patchFormFromParams(recommended.params) : {}),
    }))
  }

  function applyModel(value: string): void {
    const recommended = recommendedModels.find((model) => model.id === value)
    setForm((current) => ({
      ...current,
      model: value,
      ...(recommended?.params ? patchFormFromParams(recommended.params) : {}),
    }))
  }

  function applyModelSelection(value: string): void {
    if (value === '__custom__') {
      setForm((current) => ({
        ...current,
        model: selectedRecommendation ? '' : current.model,
      }))
      return
    }
    applyModel(value)
  }

  function useCanvasInputFor(operation: MediaOperation): void {
    if (!canvasInput) return
    const recommended = imageCanvasRecommendedModelsFor(selectedProvider, operation)[0]
    setForm((current) => ({
      ...current,
      operation,
      model: recommended?.id ?? localPythonModelFor(operation) ?? current.model,
      imageDataUrl: canvasInput.dataUrl,
      ...(recommended?.params ? patchFormFromParams(recommended.params) : {}),
    }))
  }

  function saveCurrentDefaults(): void {
    saveImageGenDefaults({
      providerId: providerId || null,
      deviceId,
      operation: form.operation,
      model: form.model,
      sizePreset: form.sizePreset,
      steps: form.steps,
      cfgScale: form.cfgScale,
      seed: form.seed,
      batchSize: form.batchSize,
      strength: form.strength,
      frames: form.frames,
      fps: form.fps,
      negativePrompt: form.negativePrompt,
    })
    toast.success('현재 Canvas 값을 기본값으로 저장했습니다.')
  }

  function submitPromptFromInput(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (enqueuing || !providerId || !prompt.trim()) return
    void enqueue()
  }

  function replacePreview(next: PreviewState | null, revokeUrls: string[] = []): void {
    previewRevokeUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewRevokeUrls.current = revokeUrls
    setPreview(next)
  }

  async function setInputFromFile(file: File | null): Promise<void> {
    const dataUrl = await readBlobAsDataUrl(file)
    if (!dataUrl) return
    const next: CanvasInput = {
      id: `file-${Date.now()}`,
      label: file?.name || 'Input image',
      dataUrl,
      mime: file?.type,
    }
    setCanvasInput(next)
    setForm((current) => ({
      ...current,
      operation: 'image-to-image',
      imageDataUrl: dataUrl,
    }))
  }

  async function selectOutput(job: ImageJob, outputIndex: number): Promise<void> {
    const output = job.outputs[outputIndex]
    if (!output) return
    const isVideo = output.kind === 'video' || output.mime?.startsWith('video/')
    if (isVideo) {
      toast.error('비디오는 Canvas 입력 이미지로 사용할 수 없습니다.')
      return
    }
    try {
      const api = await createImageGenApi(transport)
      const blob = await api.fileFetch(output.id)
      if (blob.type && !blob.type.startsWith('image/')) {
        toast.error('이미지 출력만 Canvas 입력으로 사용할 수 있습니다.')
        return
      }
      const dataUrl = await readBlobAsDataUrl(blob)
      const next: CanvasInput = {
        id: `${job.id}:${output.id}`,
        label: job.prompt || 'Generated image',
        dataUrl,
        fileId: output.id,
        jobId: job.id,
        outputIndex,
        prompt: job.prompt,
        mime: blob.type || output.mime,
      }
      setCanvasInput(next)
      setForm((current) => ({
        ...current,
        operation: 'image-to-image',
        imageDataUrl: dataUrl,
      }))
      if (!prompt.trim() && job.prompt) setPrompt(job.prompt)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    }
  }

  async function openCanvasPreview(): Promise<void> {
    if (!canvasInput) return
    if (!selectedCanvasJob) {
      replacePreview({
        job: {
          id: canvasInput.id,
          providerId: 'canvas',
          prompt: canvasInput.prompt ?? canvasInput.label,
          status: 'succeeded',
          progress: 1,
          outputs: [{ id: '', mime: canvasInput.mime ?? 'image/png', kind: 'image' }],
          error: null,
          createdAt: Date.now(),
        },
        urls: [canvasInput.dataUrl],
        index: 0,
      })
      return
    }

    try {
      const api = await createImageGenApi(transport)
      const blobs = await Promise.all(
        selectedCanvasJob.outputs.map((output) => api.fileFetch(output.id).catch(() => null)),
      )
      const ownedUrls = blobs.map((blob) => (blob ? URL.createObjectURL(blob) : ''))
      if (!ownedUrls.some(Boolean)) {
        toast.error('전체 화면 미리보기를 불러오지 못했습니다.')
        return
      }
      replacePreview(
        {
          job: selectedCanvasJob,
          urls: ownedUrls,
          index: Math.min(canvasInput.outputIndex ?? 0, Math.max(ownedUrls.length - 1, 0)),
        },
        ownedUrls.filter(Boolean),
      )
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    }
  }

  async function enqueue(): Promise<void> {
    if (!providerId || !prompt.trim()) return
    const currentMeta = operationMeta(form.operation)
    if (currentMeta.needsImage && !form.imageDataUrl) {
      toast.error('입력 이미지를 선택하세요.')
      return
    }
    if (currentMeta.needsMask && !form.maskDataUrl) {
      toast.error('마스크 이미지를 선택하세요.')
      return
    }

    let customParams: Record<string, unknown>
    try {
      customParams = parseParamsJson(form.customParamsJson)
    } catch (error) {
      toast.error('고급 JSON 파라미터가 올바르지 않습니다.', {
        description: error instanceof Error ? error.message : String(error),
      })
      return
    }

    const presetParams = selectedRecommendation?.params ?? {}
    const size = resolveImageGenSizePreset(form.sizePreset)
    const effectiveSize =
      form.sizePreset === DEFAULT_FORM.sizePreset &&
      typeof presetParams.width === 'number' &&
      typeof presetParams.height === 'number'
        ? { width: presetParams.width, height: presetParams.height }
        : size
    const effectiveSteps =
      form.steps === DEFAULT_FORM.steps && typeof presetParams.steps === 'number'
        ? presetParams.steps
        : form.steps
    const effectiveCfg =
      form.cfgScale === DEFAULT_FORM.cfgScale && typeof presetParams.guidanceScale === 'number'
        ? presetParams.guidanceScale
        : form.cfgScale
    const effectiveStrength =
      form.strength === DEFAULT_FORM.strength && typeof presetParams.strength === 'number'
        ? presetParams.strength
        : form.strength
    const params: Record<string, unknown> = {
      ...presetParams,
      operation: form.operation,
      width: effectiveSize.width,
      height: effectiveSize.height,
      steps: effectiveSteps,
      guidanceScale: effectiveCfg,
      cfgScale: effectiveCfg,
      strength: effectiveStrength,
      frames: form.frames,
      numFrames: form.frames,
      fps: form.fps,
      outputFormat: form.outputFormat,
      count: form.batchSize,
      batchSize: form.batchSize,
    }
    const selectedModelId = selectedRecommendation?.modelId ?? form.model.trim()
    if (selectedModelId) params.model = selectedModelId
    else if (providerId === 'local-python') {
      const model = localPythonModelFor(form.operation)
      if (model) params.model = model
    }
    if (providerId === 'local-python' && isWindowsBrowser()) {
      params.python = 'python'
    }
    if (supportsDeviceSelection) {
      if (deviceId === 'auto') {
        params.device = 'auto'
      } else {
        const device = hardwareDevices.find((item) => item.id === deviceId)
        if (device) {
          params.device = device.kind
          if (device.kind === 'cuda' && device.index != null) params.gpuIndex = device.index
          if (device.kind === 'cpu') params.allowCpu = true
        }
      }
      const capacity = deviceCapacityMiB(hardwareDevices, deviceId)
      if (
        selectedRecommendation?.minVramMiB &&
        capacity &&
        capacity < selectedRecommendation.minVramMiB
      ) {
        toast.warning('선택한 장치의 VRAM이 모델 권장치보다 낮습니다.')
      }
    }
    if (form.seed >= 0) params.seed = form.seed
    if (form.negativePrompt.trim()) params.negativePrompt = form.negativePrompt.trim()
    if (form.imageDataUrl) params.imageDataUrl = form.imageDataUrl
    if (form.maskDataUrl) params.maskDataUrl = form.maskDataUrl
    if (form.loraPath.trim()) {
      params.loraPath = form.loraPath.trim()
      params.loraScale = form.loraScale
    }
    Object.assign(params, customParams)

    if (selectedAvailability?.kind === 'unavailable') {
      toast.error('선택한 모델은 현재 장치에서 사용할 수 없습니다.', {
        description: selectedAvailability.detail,
      })
      return
    }
    if (selectedAvailability?.kind === 'needs-download') {
      toast.warning('첫 실행에서 모델 다운로드가 필요합니다.', {
        description: selectedAvailability.detail,
      })
    }

    setEnqueuing(true)
    try {
      const api = await createImageGenApi(transport)
      const job = await api.enqueue({
        providerId,
        prompt: prompt.trim(),
        params,
      })
      upsertJob(job)
      toast.success('이미지 생성 큐에 등록되었습니다.')
      setPrompt('')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setEnqueuing(false)
    }
  }

  async function cancel(jobId: string): Promise<void> {
    try {
      const api = await createImageGenApi(transport)
      await api.cancel(jobId)
      toast.success('작업을 취소했습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    }
  }

  async function deleteJob(job: ImageJob): Promise<void> {
    if (!(await confirm('이 생성 작업과 출력 파일을 삭제할까요?', { destructive: true }))) return
    try {
      const api = await createImageGenApi(transport)
      await api.remove(job.id)
      removeJob(job.id)
      if (canvasInput?.jobId === job.id) {
        setCanvasInput(null)
        setForm((current) => ({ ...current, imageDataUrl: '' }))
      }
      toast.success('생성 이미지를 삭제했습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    }
  }

  async function download(fileId: string, jobPrompt: string): Promise<void> {
    try {
      const api = await createImageGenApi(transport)
      const blob = await api.fileFetch(fileId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const safeName = (jobPrompt || 'image').replace(/[\\/:*?"<>|]/g, '-').slice(0, 40) || 'image'
      const ext =
        blob.type === 'video/mp4'
          ? 'mp4'
          : blob.type === 'image/gif'
            ? 'gif'
            : blob.type === 'image/webp'
              ? 'webp'
              : 'png'
      link.download = `${safeName}.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    }
  }

  const selectedCanvasJob = canvasInput?.jobId
    ? jobs.find((job) => job.id === canvasInput.jobId)
    : undefined

  return (
    <div className="flex h-full flex-col">
      {canvasMode ? (
        <footer className="order-last flex flex-col gap-2 border-t border-border bg-background p-2">
          <div className="flex min-h-[76px] items-stretch overflow-hidden rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={submitPromptFromInput}
              placeholder="프롬프트"
              aria-label={meta.isVideo ? '비디오 프롬프트' : '이미지 프롬프트'}
              rows={2}
              className="min-h-[76px] min-w-0 flex-1 resize-y bg-transparent px-3 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="sm"
              disabled={enqueuing || !providerId || !prompt.trim()}
              onClick={() => void enqueue()}
              className="min-h-[76px] w-28 rounded-none border-l border-border px-3"
              title="프롬프트 실행"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {enqueuing ? '큐 등록' : '생성'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
              value={form.operation}
              onChange={(e) => applyOperation(e.target.value as MediaOperation)}
              aria-label="작업 유형"
            >
              {OPERATIONS.map((operation) => (
                <option key={operation.id} value={operation.id}>
                  {operation.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 max-w-[150px] rounded-md border border-border bg-transparent px-2 text-sm"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              aria-label="Provider"
            >
              {provs.kind === 'ready' &&
                provs.data.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.enabled}>
                    {p.label}
                  </option>
                ))}
            </select>
            {recommendedModels.length > 0 ? (
              <select
                className="h-9 max-w-[260px] rounded-md border border-border bg-transparent px-2 text-xs"
                value={modelSelectValue}
                onChange={(e) => applyModelSelection(e.target.value)}
                aria-label="모델"
                title={form.model || recommendedModel || 'provider 기본값'}
              >
                {recommendedModels.map((model) => {
                  const availability = modelAvailability(
                    model,
                    providerId,
                    modelStatusSnapshot,
                    modelStatuses.kind === 'loading',
                    hardwareDevices,
                    deviceId,
                  )
                  return (
                    <option
                      key={model.id}
                      value={model.id}
                      disabled={availability.kind === 'unavailable'}
                    >
                      {modelOptionLabel(model, hardwareDevices, deviceId, availability)}
                    </option>
                  )
                })}
                <option value="__custom__">직접 입력...</option>
              </select>
            ) : null}
            {showCustomModelInput ? (
              <Input
                value={form.model}
                onChange={(e) => applyModel(e.target.value)}
                placeholder={modelPlaceholder}
                aria-label={recommendedModels.length > 0 ? '모델 직접 입력' : '모델'}
                title={form.model || recommendedModel || 'provider 기본값'}
                className="h-9 w-[190px] min-w-[150px] text-xs md:w-[260px]"
              />
            ) : null}
            {supportsDeviceSelection ? (
              <select
                className="h-9 max-w-[180px] rounded-md border border-border bg-transparent px-2 text-xs"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                aria-label="GPU"
                title={deviceSummary}
              >
                <option value="auto">
                  Auto · {formatVram(deviceCapacityMiB(hardwareDevices, 'auto'))}
                </option>
                {hardwareDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.kind.toUpperCase()} {device.index ?? ''} ·{' '}
                    {formatVram(device.memoryTotalMiB)}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="ml-auto"
            >
              {advancedOpen ? '간단히' : '고급'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={saveCurrentDefaults}
              disabled={!providerId}
              title="현재 Canvas 값을 기본값으로 저장"
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              기본값 저장
            </Button>
          </div>
          {canvasInput || workflowLabel || recommendedModels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {canvasInput ? (
                <span className="rounded border border-border px-2 py-0.5 text-foreground">
                  입력: {canvasInput.label}
                </span>
              ) : null}
              {workflowLabel ? <span>Workflow preset: {workflowLabel}</span> : null}
              {selectedRecommendation ? (
                <span>{modelFitLabel(selectedRecommendation, hardwareDevices, deviceId)}</span>
              ) : recommendedModels.length > 0 ? (
                <span>{recommendedModels.length}개 모델 제안</span>
              ) : null}
              {selectedAvailability ? (
                <span
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${modelAvailabilityTone(
                    selectedAvailability.kind,
                  )}`}
                  title={selectedAvailability.detail}
                >
                  <ModelAvailabilityIcon kind={selectedAvailability.kind} />
                  {selectedAvailability.label}
                </span>
              ) : null}
            </div>
          ) : null}
          {meta.needsImage || meta.needsMask ? (
            <div className="flex flex-wrap items-center gap-2">
              {meta.needsImage ? (
                <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs">
                  <span className="text-muted-foreground">입력 이미지</span>
                  <Input
                    type="file"
                    accept="image/*"
                    className="h-8 flex-1 text-xs"
                    aria-label="입력 이미지 파일"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      void setInputFromFile(file).catch((error) =>
                        toast.error('이미지를 읽지 못했습니다.', {
                          description: error instanceof Error ? error.message : String(error),
                        }),
                      )
                    }}
                  />
                </label>
              ) : null}
              {meta.needsMask ? (
                <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs">
                  <span className="text-muted-foreground">마스크 이미지</span>
                  <Input
                    type="file"
                    accept="image/*"
                    className="h-8 flex-1 text-xs"
                    aria-label="마스크 이미지 파일"
                    onChange={(event) => {
                      void readBlobAsDataUrl(event.target.files?.[0] ?? null)
                        .then((maskDataUrl) => setForm((f) => ({ ...f, maskDataUrl })))
                        .catch((error) =>
                          toast.error('마스크를 읽지 못했습니다.', {
                            description: error instanceof Error ? error.message : String(error),
                          }),
                        )
                    }}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          {advancedOpen ? (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 p-2 text-xs md:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">사이즈</span>
                <select
                  className="h-8 rounded border border-border bg-transparent px-2 text-xs"
                  value={form.sizePreset}
                  onChange={(e) => setForm((f) => ({ ...f, sizePreset: e.target.value }))}
                >
                  {IMAGE_GEN_SIZE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Steps</span>
                <Input
                  type="number"
                  min={1}
                  max={150}
                  value={form.steps}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      steps: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                    }))
                  }
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">CFG Scale</span>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={form.cfgScale}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cfgScale: Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Seed (-1=랜덤)</span>
                <Input
                  type="number"
                  value={form.seed}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seed: Number.parseInt(e.target.value, 10) || -1,
                    }))
                  }
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Batch</span>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={form.batchSize}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      batchSize: Math.max(1, Math.min(8, Number.parseInt(e.target.value, 10) || 1)),
                    }))
                  }
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Strength</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.strength}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      strength: Math.max(0, Math.min(1, Number.parseFloat(e.target.value) || 0)),
                    }))
                  }
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Frames</span>
                <Input
                  type="number"
                  min={1}
                  max={64}
                  value={form.frames}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      frames: Math.max(1, Math.min(64, Number.parseInt(e.target.value, 10) || 1)),
                    }))
                  }
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">FPS</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={form.fps}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      fps: Math.max(1, Math.min(30, Number.parseInt(e.target.value, 10) || 1)),
                    }))
                  }
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">출력</span>
                <select
                  className="h-8 rounded border border-border bg-transparent px-2 text-xs"
                  value={form.outputFormat}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      outputFormat: e.target.value === 'gif' ? 'gif' : 'mp4',
                    }))
                  }
                >
                  <option value="mp4">MP4</option>
                  <option value="gif">GIF</option>
                </select>
              </label>
              {selectedRecommendation?.workflow ? (
                <div
                  className="col-span-2 rounded-md border border-border/60 bg-muted/20 p-2 md:col-span-4"
                  aria-label="워크플로 프리셋"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {selectedRecommendation.workflow.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {selectedRecommendation.workflow.id}
                    </span>
                  </div>
                  {selectedRecommendation.workflow.description ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {selectedRecommendation.workflow.description}
                    </p>
                  ) : null}
                  {workflowParams ? (
                    <code className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap rounded border border-border/60 bg-background px-1.5 py-1 font-mono text-[11px] text-muted-foreground">
                      {workflowParams}
                    </code>
                  ) : null}
                </div>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">LoRA scale</span>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={form.loraScale}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, loraScale: Number.parseFloat(e.target.value) || 1 }))
                  }
                  className="h-8"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-muted-foreground">LoRA path / repo</span>
                <Input
                  value={form.loraPath}
                  onChange={(e) => setForm((f) => ({ ...f, loraPath: e.target.value }))}
                  className="h-8"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 md:col-span-4">
                <span className="text-muted-foreground">Negative prompt</span>
                <textarea
                  rows={2}
                  value={form.negativePrompt}
                  onChange={(e) => setForm((f) => ({ ...f, negativePrompt: e.target.value }))}
                  placeholder="피하고 싶은 요소 (선택)"
                  className="rounded border border-border bg-transparent p-2 text-xs"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 md:col-span-4">
                <span className="text-muted-foreground">Workflow params JSON</span>
                <textarea
                  rows={2}
                  value={form.customParamsJson}
                  onChange={(e) => setForm((f) => ({ ...f, customParamsJson: e.target.value }))}
                  placeholder='{"pipeline":"qwen-image-edit","dtype":"bfloat16"}'
                  className="rounded border border-border bg-transparent p-2 font-mono text-xs"
                />
              </label>
            </div>
          ) : null}
        </footer>
      ) : null}

      {canvasMode && canvasInput ? (
        <section
          className="flex min-h-[176px] flex-col gap-2 border-b border-border/60 bg-muted/15 p-2 md:flex-row"
          aria-label="Canvas input board"
        >
          <div className="flex aspect-square h-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
            <img src={canvasInput.dataUrl} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {canvasInput?.label ?? 'Canvas input'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {canvasInput?.prompt ?? workflowLabel ?? deviceSummary}
                </p>
              </div>
              {canvasInput ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCanvasInput(null)
                    setForm((current) => ({ ...current, imageDataUrl: '' }))
                  }}
                  aria-label="Canvas 입력 비우기"
                  title="Canvas 입력 비우기"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => void openCanvasPreview()}>
                <Maximize2 className="mr-1 h-3.5 w-3.5" />
                전체 화면 보기
              </Button>
              <Button
                size="sm"
                variant={form.operation === 'image-to-image' ? 'default' : 'outline'}
                onClick={() => useCanvasInputFor('image-to-image')}
              >
                이미지 편집
              </Button>
              <Button
                size="sm"
                variant={form.operation === 'inpaint' ? 'default' : 'outline'}
                onClick={() => useCanvasInputFor('inpaint')}
              >
                마스크 편집
              </Button>
              <Button
                size="sm"
                variant={form.operation === 'image-to-video' ? 'default' : 'outline'}
                onClick={() => useCanvasInputFor('image-to-video')}
              >
                이미지→비디오
              </Button>
              {canvasInput?.fileId ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void download(canvasInput.fileId!, canvasInput.prompt ?? canvasInput.label)
                    }
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    다운로드
                  </Button>
                </>
              ) : null}
              {selectedCanvasJob ? (
                <Button size="sm" variant="ghost" onClick={() => void deleteJob(selectedCanvasJob)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  삭제
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {jobs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2 py-1.5 text-[11px]">
          {(
            [
              ['active', '결과'],
              ['all', '전체'],
              ['queued', '대기'],
              ['running', '진행중'],
              ['succeeded', '성공'],
              ['failed', '실패'],
              ['cancelled', '취소'],
            ] as Array<[GalleryStatusFilter, string]>
          ).map(([key, label]) => {
            const count = statusCounts[key]
            const active = statusFilter === key
            const dim = !active && count === 0
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                disabled={dim}
                className={
                  'rounded-full border px-2 py-0.5 transition-colors ' +
                  (active
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : dim
                      ? 'border-border/50 bg-transparent text-muted-foreground/40'
                      : 'border-border bg-transparent text-muted-foreground hover:bg-accent')
                }
                aria-pressed={active}
              >
                {label}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            )
          })}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            className="ml-auto h-6 rounded border border-border bg-transparent px-2 text-[11px]"
            aria-label="정렬"
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
      ) : null}
      <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 overflow-auto p-2">
        {visibleJobs.map((j) => (
          <ImageJobCard
            key={j.id}
            job={j}
            onCancel={
              j.status === 'queued' || j.status === 'running' ? () => void cancel(j.id) : undefined
            }
            onDelete={() => void deleteJob(j)}
            onDownload={(fid) => void download(fid, j.prompt)}
            onPreview={(job, urls, idx) => {
              if (canvasMode) {
                void selectOutput(job, idx)
                return
              }
              replacePreview({ job, urls, index: idx })
            }}
            previewLabel={canvasMode ? 'Canvas에서 편집' : '이미지 크게 보기'}
          />
        ))}
        {jobs.length === 0 ? (
          <p className="col-span-full text-xs text-muted-foreground">작업 없음</p>
        ) : visibleJobs.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-1 py-4 text-center text-xs text-muted-foreground">
            <p>이 상태의 작업이 없습니다.</p>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="rounded px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
            >
              전체 보기
            </button>
          </div>
        ) : null}
      </div>
      <ImageDetailDialog
        open={preview != null}
        job={preview?.job ?? null}
        urls={preview?.urls ?? []}
        index={preview?.index ?? 0}
        onIndexChange={(next) => setPreview((p) => (p ? { ...p, index: next } : p))}
        onClose={() => replacePreview(null)}
        onDownload={(fileId) => {
          if (preview) void download(fileId, preview.job.prompt)
        }}
      />
    </div>
  )
}
