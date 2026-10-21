'use client'
import { useEffect, useState } from 'react'
import { ArrowRight, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  imageCanvasRecommendedModelsFor,
  type ImageCanvasOperation,
} from '@sepilotd/api-client/daemon/image-canvas'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import {
  createImageGenApi,
  type ImageGenHardwareDevice,
  type ImageProvider,
} from '@/lib/api/image-gen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  IMAGE_GEN_DEFAULT_VALUES,
  IMAGE_GEN_SIZE_PRESETS,
  loadImageGenDefaults,
  resetImageGenDefaults,
  saveImageGenDefaults,
  type ImageGenDefaults,
} from '@/lib/utils/image-gen-defaults'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

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

function recommendedModelLabel(
  model: NonNullable<ImageProvider['recommendedModels']>[number],
  devices: ImageGenHardwareDevice[],
  deviceId: string,
): string {
  const required = model.minVramMiB ?? model.recommendedVramMiB
  const capacity = deviceCapacityMiB(devices, deviceId)
  const fit =
    required && capacity != null
      ? capacity >= required
        ? ` · ${formatVram(required)}+ 가능`
        : ` · ${formatVram(required)}+ 부족`
      : required
        ? ` · ${formatVram(required)}+`
        : ''
  const workflow = model.workflow?.label ? ` · ${model.workflow.label}` : ''
  return `${model.label}${fit}${workflow}`
}

registerSettingsTab({
  key: 'image-gen',
  section: 'integrations',
  label: 'Image Generation',
  search: ['image', 'comfyui', 'sd', 'imagegen'],
  render: () => <ImageGenSettingsTab />,
})

export function ImageGenSettingsTab() {
  const transport = useTransport()
  const state = useCapabilityResource(
    async () => (await createImageGenApi(transport)).providers(),
    [transport],
  )
  const hardware = useCapabilityResource(
    async () => (await createImageGenApi(transport)).hardware(),
    [transport],
  )

  const [defaults, setDefaults] = useState<ImageGenDefaults>(IMAGE_GEN_DEFAULT_VALUES)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setDefaults(loadImageGenDefaults())
    setHydrated(true)
  }, [])

  if (state.kind === 'unavailable') return <UnimplementedBanner what="Image Generation" />

  const selectedProvider =
    state.kind === 'ready'
      ? (state.data.find((p) => p.id === defaults.providerId) ??
        state.data.find((p) => p.enabled && p.id !== 'dummy') ??
        state.data.find((p) => p.enabled) ??
        state.data[0])
      : undefined
  const hardwareDevices =
    hardware.kind === 'ready' ? hardware.data.devices.filter((device) => device.available) : []
  const supportsDeviceSelection = selectedProvider?.hardware?.supportsDeviceSelection === true
  const recommendedModels = imageCanvasRecommendedModelsFor(
    selectedProvider,
    defaults.operation as ImageCanvasOperation,
  )
  const selectedRecommendation = recommendedModels.find((model) => model.id === defaults.model)
  const modelSelectValue = selectedRecommendation ? selectedRecommendation.id : '__custom__'
  const showCustomModelInput = recommendedModels.length === 0 || modelSelectValue === '__custom__'

  function handleSave(): void {
    saveImageGenDefaults(defaults)
    toast.success('이미지 생성 기본값을 저장했습니다.')
  }

  function handleReset(): void {
    resetImageGenDefaults()
    setDefaults({ ...IMAGE_GEN_DEFAULT_VALUES })
    toast.success('기본값을 초기화했습니다.')
  }

  function openGalleryView(): void {
    window.dispatchEvent(new CustomEvent('sepilot:open-view', { detail: 'canvas' }))
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Chat의 이미지 생성 토글과 Canvas가 함께 쓰는 기본 실행 환경입니다. 세부 생성값은 Canvas
          고급 패널에서 저장할 수 있습니다.
        </p>
        <Button size="sm" variant="outline" onClick={openGalleryView}>
          <ArrowRight className="mr-1 h-3.5 w-3.5" />
          Canvas 열기
          <span className="sr-only">Gallery 열기</span>
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Providers</h3>
        {state.kind === 'loading' ? (
          <p className="text-xs text-muted-foreground">로딩 중…</p>
        ) : state.kind === 'error' ? (
          <p className="text-xs text-red-500">{state.error.message}</p>
        ) : (
          <ul className="flex flex-col gap-1 rounded-md border border-border p-2">
            {state.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs">
                <span className="font-medium">{p.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{p.id}</span>
                  <span
                    className={
                      p.enabled
                        ? 'text-[10px] text-emerald-600 dark:text-emerald-400'
                        : 'text-[10px] text-muted-foreground'
                    }
                  >
                    {p.enabled ? '활성' : '비활성'}
                  </span>
                </div>
              </li>
            ))}
            {state.data.length === 0 && (
              <li className="text-xs text-muted-foreground">
                등록된 image-gen provider가 없습니다. ~/.sepilotd/config.yaml의 imageGen 섹션에서
                추가하세요.
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">기본값</h3>
        <p className="text-[11px] text-muted-foreground">
          일반 Chat에서 이미지를 만들 때 주로 사용할 provider, 모델, GPU, 기본 크기입니다.
        </p>
        <div className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            기본 Provider
            <select
              className="h-8 rounded border border-border bg-transparent px-2 text-xs"
              value={defaults.providerId ?? ''}
              onChange={(e) =>
                setDefaults((d) => ({
                  ...d,
                  providerId: e.target.value || null,
                  deviceId: 'auto',
                }))
              }
              disabled={!hydrated}
            >
              <option value="">(첫 번째 활성 provider 사용)</option>
              {state.kind === 'ready' &&
                state.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.enabled ? '' : ' (비활성)'}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            기본 작업
            <select
              className="h-8 rounded border border-border bg-transparent px-2 text-xs"
              value={defaults.operation}
              onChange={(e) =>
                setDefaults((d) => ({
                  ...d,
                  operation: e.target.value,
                  model: '',
                }))
              }
              disabled={!hydrated}
            >
              <option value="text-to-image">이미지 생성</option>
              <option value="image-to-image">이미지 편집</option>
              <option value="inpaint">마스크 편집</option>
              <option value="text-to-video">텍스트→비디오</option>
              <option value="image-to-video">이미지→비디오</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            GPU
            <select
              className="h-8 rounded border border-border bg-transparent px-2 text-xs"
              value={defaults.deviceId}
              onChange={(e) => setDefaults((d) => ({ ...d, deviceId: e.target.value }))}
              disabled={!hydrated || !supportsDeviceSelection}
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
            {!supportsDeviceSelection ? (
              <span className="text-[11px] text-muted-foreground">
                선택한 provider는 GPU 선택을 지원하지 않습니다.
              </span>
            ) : null}
          </label>
          {recommendedModels.length > 0 ? (
            <label className="flex flex-col gap-1 text-xs">
              추천 모델
              <select
                className="h-8 rounded border border-border bg-transparent px-2 text-xs"
                value={modelSelectValue}
                onChange={(e) =>
                  setDefaults((d) => ({
                    ...d,
                    model: e.target.value === '__custom__' ? '' : e.target.value,
                  }))
                }
                disabled={!hydrated}
              >
                {recommendedModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {recommendedModelLabel(model, hardwareDevices, defaults.deviceId)}
                  </option>
                ))}
                <option value="__custom__">직접 입력...</option>
              </select>
            </label>
          ) : null}
          {showCustomModelInput ? (
            <label className="flex flex-col gap-1 text-xs">
              기본 모델
              <Input
                value={defaults.model}
                onChange={(e) => setDefaults((d) => ({ ...d, model: e.target.value }))}
                placeholder="비우면 provider 기본 추천 모델"
                disabled={!hydrated}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs">
            사이즈 프리셋
            <select
              className="h-8 rounded border border-border bg-transparent px-2 text-xs"
              value={defaults.sizePreset}
              onChange={(e) => setDefaults((d) => ({ ...d, sizePreset: e.target.value }))}
              disabled={!hydrated}
            >
              {IMAGE_GEN_SIZE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={handleReset} disabled={!hydrated}>
            초기화
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hydrated}>
            저장
          </Button>
        </div>
      </section>
    </div>
  )
}
