'use client'

import { useChatStore } from '@/lib/store/chat-store'
import { BrowserExtensionInstaller } from './BrowserExtensionInstaller'
import { useEffect, useRef, useState } from 'react'
import { Globe, Pause, Play, Unplug } from 'lucide-react'
import { useTransport } from '@/components/providers/transport-provider'
import { invokeDesktop } from '@/lib/electron/bridge'
import {
  createRemoteBrowserApi,
  type BrowserCdpStatus,
  type BrowserCdpTab,
  type BrowserConnection,
} from '@/lib/api/browser-remote'

type RemoteBrowserApi = Awaited<ReturnType<typeof createRemoteBrowserApi>>

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function RemoteBrowserPanel({ sessionId }: { sessionId: string }) {
  const transport = useTransport()
  const messages = useChatStore((state) => state.messages)
  const latestUserIndex = messages.findLastIndex((message) => message.role === 'user')
  const prerequisite = messages
    .slice(latestUserIndex + 1)
    .findLast((message) => message.userActionRequiredCode)
  const handledPrerequisite = useRef<string | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [connections, setConnections] = useState<BrowserConnection[]>([])
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const revision = useRef(0)
  const [token, setToken] = useState<{ id: string; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [cdpStatus, setCdpStatus] = useState<BrowserCdpStatus | null>(null)
  const [picker, setPicker] = useState<{ id: string; tabs: BrowserCdpTab[] } | null>(null)
  const attached = connections.find((connection) => connection.sessionId === sessionId)
  const frame = attached?.frame
  useEffect(() => {
    if (!prerequisite || handledPrerequisite.current === prerequisite.id) return
    handledPrerequisite.current = prerequisite.id
    setOpen(true)
  }, [prerequisite])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const startedAt = revision.current
      try {
        const items = await (await createRemoteBrowserApi(transport)).list()
        if (!disposed && startedAt % 2 === 0 && startedAt === revision.current) {
          setConnections(items)
          setConnectionError('')
        }
      } catch (err) {
        if (!disposed && startedAt % 2 === 0 && startedAt === revision.current) {
          setConnections([])
          setConnectionError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 1000)
      }
    }
    void poll()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [transport, sessionId])
  useEffect(() => {
    if (!open || attached) return
    let disposed = false
    void (async () => {
      try {
        const status = await (await createRemoteBrowserApi(transport)).cdpStatus()
        if (!disposed) setCdpStatus(status)
      } catch {
        if (!disposed) setCdpStatus({ available: false, reason: 'invalid_endpoint' })
      }
    })()
    return () => {
      disposed = true
    }
  }, [open, attached?.id, transport])
  const act = async (action: (api: RemoteBrowserApi) => Promise<unknown>) => {
    if (revision.current % 2 !== 0) return
    revision.current += 1
    setBusy(true)
    try {
      const api = await createRemoteBrowserApi(transport)
      await action(api)
      setConnections(await api.list())
      setConnectionError('')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      revision.current += 1
      setBusy(false)
    }
  }
  const connectChrome = () =>
    act(async (api) => {
      setPicker(await api.cdpConnect('Chrome'))
    })
  const attachTab = (tab: BrowserCdpTab) =>
    act(async (api) => {
      if (!picker) return
      const { id } = await api.cdpAttach(picker.id, tab.targetId)
      setPicker(null)
      await api.control(id, sessionId, 'human')
    })
  const cancelPicker = () =>
    act(async (api) => {
      if (!picker) return
      await api.cdpCancel(picker.id)
      setPicker(null)
    })
  const openChromeInspect = async () => {
    try {
      const opened = await invokeDesktop<{ browserOpened: boolean }>('sepilot:browser/open-chrome-inspect')
      if (!opened) throw new Error('SEPilot Desktop에서만 Chrome 설정 페이지를 열 수 있습니다.')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const transportLabel =
    attached?.transport === 'cdp' ? 'Chrome 직접 연결' : attached?.transport === 'extension' ? '브라우저 확장' : ''
  return (
    <section
      className="shrink-0 border-b border-border bg-muted/20"
      aria-label="브라우저 공동 탐색"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-xs"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Globe className="h-4 w-4" /> 브라우저 공동 탐색
        {attached ? (
          <span>
            {attached.label} · {attached.mode === 'agent' ? '에이전트 제어 중' : '직접 조작 중'}
          </span>
        ) : (
          <span className="text-muted-foreground">브라우저 연결 시작 · Chrome / Edge</span>
        )}
      </button>
      {open && (
        <div className="max-h-[45vh] space-y-3 overflow-y-auto px-4 pb-3 text-xs">
          {(error || connectionError) && (
            <p role="alert" className="text-destructive">
              {error ||
                `브라우저 연결 상태를 확인할 수 없습니다. 자동으로 다시 연결합니다. ${connectionError}`}
            </p>
          )}
          {!attached && picker && (
            <>
              <p className="font-medium">공유할 탭을 선택하세요</p>
              <p className="text-muted-foreground">
                선택한 탭 하나만 에이전트에게 보입니다. 다른 탭은 열어 두어도 괜찮습니다.
              </p>
              {picker.tabs.length === 0 && <p>공유할 수 있는 웹 페이지 탭이 없습니다. Chrome에서 페이지를 연 뒤 다시 시도하세요.</p>}
              <ul className="space-y-1">
                {picker.tabs.map((tab) => (
                  <li key={tab.targetId}>
                    <button
                      disabled={busy}
                      className="w-full truncate rounded border px-3 py-2 text-left"
                      onClick={() => void attachTab(tab)}
                    >
                      {(tab.title || hostOf(tab.url)) + ' · ' + hostOf(tab.url)}
                    </button>
                  </li>
                ))}
              </ul>
              <button disabled={busy} className="rounded border px-3 py-2" onClick={() => void cancelPicker()}>
                취소
              </button>
            </>
          )}
          {!attached && !picker && (
            <>
              <p className="font-medium">브라우저 연결을 함께 준비해요</p>
              {cdpStatus?.available && (
                <>
                  <p>
                    Chrome 탭을 확장 설치 없이 바로 연결합니다. Chrome이 연결 허용을 물어보면 “허용”을
                    누르세요.
                  </p>
                  <button
                    disabled={busy}
                    className="rounded border bg-primary px-3 py-2 text-primary-foreground"
                    onClick={() => void connectChrome()}
                  >
                    Chrome 연결 (확장 없음)
                  </button>
                </>
              )}
              {cdpStatus && !cdpStatus.available && cdpStatus.reason === 'not_enabled' && (
                <>
                  <p>
                    Chrome에서 chrome://inspect/#remote-debugging 을 열고 원격 디버깅을 켠 뒤 다시
                    시도하세요. (Chrome 144 이상)
                  </p>
                  <button disabled={busy} className="rounded border px-3 py-2" onClick={() => void openChromeInspect()}>
                    설정 페이지 열기
                  </button>
                </>
              )}
              {cdpStatus && !cdpStatus.available && cdpStatus.reason === 'disabled' && (
                <p className="text-muted-foreground">
                  Chrome 직접 연결이 설정에서 꺼져 있습니다 (browser.cdp.enabled). 아래 확장 방식을
                  사용하세요.
                </p>
              )}
              {cdpStatus &&
                !cdpStatus.available &&
                (cdpStatus.reason === 'unsupported_platform' || cdpStatus.reason === 'invalid_endpoint') && (
                  <p className="text-muted-foreground">
                    이 환경에서는 Chrome 직접 연결을 사용할 수 없습니다. 아래 확장 방식을 사용하세요.
                  </p>
                )}
              {connections
                .filter((connection) => !connection.sessionId)
                .map((connection) => (
                  <button
                    key={connection.id}
                    disabled={busy}
                    className="mr-2 rounded border px-3 py-2"
                    onClick={() =>
                      void act((api) => api.control(connection.id, sessionId, 'human'))
                    }
                  >
                    {connection.label} 연결
                  </button>
                ))}
              <details>
                <summary className="cursor-pointer">다른 방법: 브라우저 확장 사용</summary>
                <div className="mt-2 space-y-2">
                  <p>Edge나 Chrome 143 이하에서는 Browser Companion 확장으로 탭 하나를 공유합니다.</p>
                  <p className="font-medium">1. 확장 준비</p>
                  <BrowserExtensionInstaller />
                  <p className="font-medium">2. 공유할 탭 연결</p>
                  <p>
                    아래 연결 토큰을 만들고 복사한 뒤, Chrome 또는 Edge에서 공유할 웹 페이지를 열어
                    주세요. 확장 아이콘을 눌러 토큰을 붙여넣고 “이 탭 연결”을 누르면 위 목록에
                    나타납니다.
                  </p>
                </div>
              </details>
            </>
          )}
          {attached && (
            <>
              <p role="status">
                {attached.mode === 'agent'
                  ? '브라우저가 준비됐어요. 대화에 “이어서 진행해 줘”라고 입력해 주세요.'
                  : '3. 연결됐어요. “에이전트 제어 허용”을 누르면 이 탭에서 작업할 수 있어요.'}
              </p>
              {transportLabel && (
                <p className="text-muted-foreground">연결 방식: {transportLabel}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 truncate">{frame?.title || attached.label}</span>
                <button
                  disabled={busy}
                  className="flex items-center gap-1 rounded border px-2 py-1"
                  onClick={() =>
                    void act((api) =>
                      api.control(
                        attached.id,
                        sessionId,
                        attached.mode === 'agent' ? 'human' : 'agent',
                      ),
                    )
                  }
                >
                  {attached.mode === 'agent' ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  {attached.mode === 'agent' ? '직접 조작하기' : '에이전트 제어 허용'}
                </button>
                <button
                  disabled={busy}
                  aria-label="브라우저 연결 해제"
                  className="rounded border p-1"
                  onClick={() => void act((api) => api.disconnect(attached.id))}
                >
                  <Unplug className="h-4 w-4" />
                </button>
              </div>
              <p className="truncate text-muted-foreground">{frame?.url}</p>
              <p aria-live="polite">{attached.activity}</p>
              {attached.mode === 'human' && (
                <p>
                  직접 조작 중에는 에이전트가 기다립니다. 조작을 마치면 “에이전트 제어 허용”을
                  누르고 대화에 이어서 진행하라고 알려주세요.
                </p>
              )}
              <p className="text-muted-foreground">
                {attached.transport === 'cdp'
                  ? '화면은 실시간 미리보기입니다. 실제 탭에서 직접 입력하면 제어권이 자동으로 돌아옵니다. 실행 중이던 동작은 일부 반영됐을 수 있습니다.'
                  : '화면은 약 1초 간격의 미리보기입니다. 직접 조작하려면 제어권을 가져온 뒤 실제 브라우저 탭에서 입력하세요. 실행 중이던 동작은 일부 반영됐을 수 있습니다.'}
              </p>
            </>
          )}
          <details key={attached?.id ?? 'setup'} open={!attached || undefined}>
            <summary className="cursor-pointer">연결 토큰 관리</summary>
            <ol className="ml-5 mt-2 list-decimal space-y-1 text-muted-foreground">
              <li>확장 방식에서만 필요합니다. Chrome 직접 연결에는 토큰이 필요 없습니다.</li>
              <li>
                아래에서 토큰을 만들고, 공유할 웹 탭에서 확장 아이콘을 눌러 daemon 주소와 토큰을
                입력하세요.
              </li>
              <li>“이 탭 연결”을 누른 뒤 이 패널에서 대화에 연결하세요.</li>
            </ol>
            <p className="mt-2">로컬 daemon 연결용입니다. 연결 토큰은 24시간 후 만료됩니다.</p>
            <button
              disabled={busy || Boolean(token)}
              className="mt-2 rounded border px-2 py-1"
              onClick={() => void act(async (api) => setToken((await api.issueToken()).data))}
            >
              연결 토큰 만들기
            </button>
            {token && (
              <div className="mt-2 space-y-2">
                <input
                  aria-label="브라우저 연결 토큰"
                  type="password"
                  readOnly
                  value={token.token}
                  className="w-full rounded border bg-background p-2"
                  onFocus={(event) => event.target.select()}
                />
                <button
                  className="rounded border px-2 py-1"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(token.token)
                      .catch(() => setError('토큰 입력란을 선택해 직접 복사하세요.'))
                  }}
                >
                  토큰 복사
                </button>{' '}
                <button
                  disabled={busy}
                  className="rounded border px-2 py-1"
                  onClick={() =>
                    void act(async (api) => {
                      await api.revokeToken(token.id)
                      setToken(null)
                    })
                  }
                >
                  토큰 폐기
                </button>
              </div>
            )}
          </details>
        </div>
      )}
    </section>
  )
}
