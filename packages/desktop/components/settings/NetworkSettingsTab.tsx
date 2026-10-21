'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  CapabilityUnavailableError,
  createNetworkApi,
  type NetworkConfig,
  type NetworkProbeResult,
  type NetworkStatus,
} from '@/lib/api/network'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDirtyTracker } from '@/lib/hooks/use-dirty-tracker'
import { confirm } from '@/lib/utils/confirm'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  proxyMode: 'environment',
  proxyUrl: null,
  noProxy: null,
  customCaPath: null,
  tlsRejectUnauthorized: true,
  timeoutMs: 900_000,
  maxConcurrency: 4,
}

const PROXY_MODES: Array<{
  value: NetworkConfig['proxyMode']
  label: string
  description: string
}> = [
  {
    value: 'direct',
    label: '직접 연결',
    description: '환경 프록시를 무시하고 daemon 요청을 바로 연결',
  },
  {
    value: 'environment',
    label: '환경 프록시',
    description: 'HTTP_PROXY · HTTPS_PROXY · NO_PROXY 사용',
  },
  {
    value: 'manual',
    label: '사용자 지정',
    description: '아래에 입력한 HTTP(S) 프록시만 사용',
  },
]

const DEGRADED_REASON_COPY: Record<string, string> = {
  CUSTOM_CA_UNAVAILABLE:
    '설정된 CA 파일을 읽거나 검증할 수 없습니다. 유효한 PEM 경로로 수정하거나 CA 경로를 지운 뒤 저장하세요.',
  LEGACY_PROXY_UNSAFE:
    '이전 설정의 프록시 URL에 지원하지 않는 형식 또는 인증 정보가 포함되어 있습니다. 안전한 HTTP(S) 프록시 URL로 다시 저장하세요.',
  NETWORK_PROXY_UNAVAILABLE:
    '환경 프록시 값의 형식 또는 프로토콜을 사용할 수 없습니다. 환경 변수를 수정하거나 직접 연결·사용자 지정 모드로 저장하세요.',
}

registerSettingsTab({
  key: 'network',
  section: 'system',
  label: 'Network',
  search: ['proxy', '프록시', 'direct', 'timeout', 'concurrency', 'TLS', 'CA', '인증서'],
  render: () => <NetworkSettingsTab />,
})

export function NetworkSettingsTab() {
  const transport = useTransport()
  const [form, setForm] = useState<NetworkConfig>(DEFAULT_NETWORK_CONFIG)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const [probeUrl, setProbeUrl] = useState('https://api.github.com')
  const [probeResult, setProbeResult] = useState<NetworkProbeResult | null>(null)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null)
  const [probing, setProbing] = useState(false)
  const [savedForm, setSavedForm] = useState<NetworkConfig | null>(null)

  useDirtyTracker('network', form, savedForm)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const api = await createNetworkApi(transport)
        const next = await api.get()
        const effectiveStatus = await api.getStatus().catch(() => null)
        if (!cancelled) {
          const normalized: NetworkConfig = {
            ...DEFAULT_NETWORK_CONFIG,
            ...next,
            proxyMode:
              next.proxyMode ?? (next.proxyUrl ? 'manual' : DEFAULT_NETWORK_CONFIG.proxyMode),
          }
          setForm(normalized)
          setSavedForm(normalized)
          setNetworkStatus(effectiveStatus)
          setStatus('ready')
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof CapabilityUnavailableError) {
          setStatus('unavailable')
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'network load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save(): Promise<void> {
    try {
      if (
        !form.tlsRejectUnauthorized &&
        savedForm?.tlsRejectUnauthorized !== false &&
        !(await confirm(
          'TLS 인증서 검증을 끄면 LLM 연결이 위조된 서버로 전송될 수 있습니다. 그래도 저장할까요?',
          {
            title: '인증서 검증 끄기',
            confirmLabel: '검증 끄기',
            destructive: true,
          },
        ))
      ) {
        return
      }
      const api = await createNetworkApi(transport)
      const saved = await api.set(form)
      const effectiveStatus = await api.getStatus().catch(() => null)
      setForm(saved)
      setSavedForm(saved)
      setNetworkStatus(effectiveStatus)
      toast.success('Network 설정을 저장했습니다.')
    } catch (err) {
      toast.error('Network 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    }
  }

  async function probe(): Promise<void> {
    if (probing) return
    setProbing(true)
    setProbeResult(null)
    try {
      const api = await createNetworkApi(transport)
      setProbeResult(await api.probe(probeUrl))
    } catch (err) {
      setProbeResult({
        ok: false,
        reason: err instanceof Error ? err.message : 'probe failed',
      })
    } finally {
      setProbing(false)
    }
  }

  if (status === 'unavailable')
    return <UnimplementedBanner what="Network" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>
  const activeOverrideSources = networkStatus
    ? Object.values(networkStatus.overrides).filter((source) => source !== null)
    : []
  const ignoredOverrideSources = networkStatus?.ignoredOverrides
    ? Object.values(networkStatus.ignoredOverrides).filter((source) => source !== null)
    : []
  const degradedReason = networkStatus?.effective.degradedReason ?? null
  const degradedCopy = degradedReason
    ? DEGRADED_REASON_COPY[degradedReason] ?? `적용 중인 네트워크 정책이 안전하게 구성되지 않았습니다. (${degradedReason})`
    : null
  return (
    <div className="space-y-3 text-[13px]">
      <div className="rounded-lg border border-border p-3">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Daemon 연결 경로</h4>
          <p className="text-xs text-muted-foreground">
            모델 provider를 포함한 daemon HTTP 요청의 프록시 정책입니다. 저장하면 새 연결부터 바로 적용됩니다.
          </p>
        </div>

        {degradedCopy && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] leading-4 text-red-700 dark:text-red-300"
          >
            <strong className="block text-xs">외부 네트워크 송신이 차단되었습니다</strong>
            <span>{degradedCopy}</span>
            <span className="mt-1 block text-muted-foreground">
              문제가 해결되기 전까지 LLM 및 daemon 외부 HTTP 요청은 직접 연결로 우회되지 않습니다.
            </span>
          </div>
        )}

        {activeOverrideSources.length > 0 && (
          <div
            role="status"
            className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300"
          >
            <strong className="block text-xs">환경 변수가 저장값보다 우선 적용됩니다</strong>
            <span>
              {activeOverrideSources.join(' · ')} 값을 제거하고 daemon을 다시 시작해야 아래 저장값이 적용됩니다.
            </span>
            <span className="mt-1 block text-muted-foreground">
              실제 적용: 제한 시간 {networkStatus?.effective.timeoutMs.toLocaleString()}ms · TLS 검증 {networkStatus?.effective.tlsRejectUnauthorized ? '사용' : '해제'} · CA {networkStatus?.effective.customCaPath ?? '기본 신뢰 저장소'}
            </span>
          </div>
        )}
        {ignoredOverrideSources.length > 0 && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300"
          >
            <strong className="block text-xs">환경 변수가 선언됐지만 적용되지 않았습니다</strong>
            <span>
              {ignoredOverrideSources.join(' · ')} 값의 형식이 잘못됐거나 참조 파일을 읽을 수 없어 저장된 설정과 기본 신뢰 저장소를 유지합니다.
            </span>
            <span className="mt-1 block text-muted-foreground">
              환경 변수를 수정하거나 제거한 뒤 daemon을 다시 시작하세요. 실제 적용: 제한 시간 {networkStatus?.effective.timeoutMs.toLocaleString()}ms · CA {networkStatus?.effective.customCaPath ?? '기본 신뢰 저장소'}
            </span>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="LLM 프록시 모드">
          {PROXY_MODES.map((mode) => {
            const selected = form.proxyMode === mode.value
            return (
              <button
                key={mode.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setForm((prev) => ({ ...prev, proxyMode: mode.value }))}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <span className="block text-xs font-semibold">{mode.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4">{mode.description}</span>
              </button>
            )
          })}
        </div>

        <p className="mt-2 rounded-md bg-muted/35 px-2.5 py-1.5 text-[11px] leading-4 text-muted-foreground">
          GitHub 등은 프록시를 유지하고 LLM만 우회하려면 <strong className="font-medium text-foreground">환경 프록시</strong>를 선택한 뒤 LLM host를 NO_PROXY에 추가하세요.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {form.proxyMode === 'manual' && (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium" htmlFor="network-proxy-url">
                HTTP(S) Proxy URL
              </label>
              <Input
                id="network-proxy-url"
                value={form.proxyUrl ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    proxyUrl: event.target.value.trim() || null,
                  }))
                }
                placeholder="http://proxy.internal:8080"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                보안을 위해 URL에 사용자 이름이나 비밀번호를 포함할 수 없습니다.
              </p>
            </div>
          )}

          {form.proxyMode !== 'direct' && (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium" htmlFor="network-no-proxy">
                프록시 제외 주소 (NO_PROXY)
              </label>
              <Input
                id="network-no-proxy"
                value={form.noProxy ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    noProxy: event.target.value.trim() || null,
                  }))
                }
                placeholder="127.0.0.1, localhost, *.internal"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                로컬·사내 LLM 주소처럼 프록시를 거치면 안 되는 host를 쉼표로 구분하세요.
              </p>
            </div>
          )}

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium" htmlFor="network-custom-ca-path">
              사용자 지정 CA 인증서
            </label>
            <Input
              id="network-custom-ca-path"
              value={form.customCaPath ?? ''}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  customCaPath: event.target.value.trim() || null,
                }))
              }
              placeholder="C:/certs/company-ca.pem"
            />
            <p className="text-[11px] text-muted-foreground">
              daemon이 읽을 수 있는 PEM 인증서 경로입니다. 기본 신뢰 저장소에 추가로 신뢰합니다.
            </p>
          </div>

          <label className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2 md:col-span-2">
            <input
              type="checkbox"
              checked={form.tlsRejectUnauthorized}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  tlsRejectUnauthorized: event.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block text-xs font-medium">TLS 인증서 검증</span>
              <span className="block text-[11px] leading-4 text-muted-foreground">
                켜두는 것이 안전합니다. 사설 인증서는 위 CA 경로로 신뢰시키세요.
              </span>
            </span>
          </label>

          {!form.tlsRejectUnauthorized && (
            <div
              role="alert"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300 md:col-span-2"
            >
              인증서 검증을 끄면 중간자 공격을 탐지할 수 없습니다. 임시 진단 외에는 사용하지 마세요.
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="network-timeout">
              요청 제한 시간 (ms)
            </label>
            <Input
              id="network-timeout"
              type="number"
              min={1_000}
              max={3_600_000}
              value={form.timeoutMs}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  timeoutMs: Number.parseInt(event.target.value || '0', 10),
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="network-concurrency">
              Origin당 최대 연결 수
            </label>
            <Input
              id="network-concurrency"
              type="number"
              min={1}
              max={64}
              value={form.maxConcurrency}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  maxConcurrency: Number.parseInt(
                    event.target.value || '0',
                    10,
                  ),
                }))
              }
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            저장값: {PROXY_MODES.find((mode) => mode.value === form.proxyMode)?.label}
            {networkStatus && ` · 실제: ${PROXY_MODES.find((mode) => mode.value === networkStatus.effective.proxyMode)?.label ?? networkStatus.effective.proxyMode} (${networkStatus.effective.useProxy ? '프록시 사용' : '프록시 없음'})`}
          </p>
          <Button
            size="sm"
            disabled={form.proxyMode === 'manual' && !form.proxyUrl}
            onClick={() => void save()}
          >
            저장
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">연결 진단</h4>
          <p className="text-xs text-muted-foreground">
            저장된 네트워크 정책으로 endpoint 접근이 가능한지 확인합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={probeUrl}
            onChange={(event) => setProbeUrl(event.target.value)}
            placeholder="https://api.github.com"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={probing || probeUrl.trim().length === 0}
            aria-busy={probing}
            onClick={() => void probe()}
          >
            {probing ? '테스트 중…' : '테스트'}
          </Button>
        </div>
        {probeResult && (
          <div className="mt-2 rounded-md border border-border bg-muted/20 p-2.5 text-[13px]">
            <div
              className={(probeResult.reachable ?? probeResult.ok)
                ? probeResult.ok
                  ? 'text-green-600'
                  : 'text-amber-600 dark:text-amber-300'
                : 'text-red-500'}
            >
              {(probeResult.reachable ?? probeResult.ok)
                ? probeResult.ok
                  ? '연결 성공'
                  : '서버 도달 · HTTP 응답 확인'
                : '연결 실패'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {probeResult.status ? `HTTP ${probeResult.status}` : probeResult.reason ?? '응답 수신'}
              {probeResult.latencyMs ? ` · ${probeResult.latencyMs}ms` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
