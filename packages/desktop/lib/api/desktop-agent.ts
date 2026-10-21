import type {
  DesktopAgentEvent,
  DesktopAgentId,
  DesktopAgentSession,
  DesktopAgentSshTarget,
} from '@sepilotd/api-client'
import { parseJsonSseStream } from '@sepilotd/api-client/daemon/stream'
import type { Transport } from '@/lib/transport/transport-adapter'
import { makeDaemonRequestContext } from './_daemon'

export function createDesktopAgentApi(transport: Transport) {
  const request = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const context = await makeDaemonRequestContext(transport)
    const response = await fetch(context.url(`/desktop-agents${path}`), {
      method,
      headers: context.headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => null)
      throw new Error(
        typeof result?.error === 'string' ? result.error : `터미널 요청 실패 (${response.status})`,
      )
    }
    return response.json() as Promise<T>
  }
  return {
    list: () => request<{ sessions: DesktopAgentSession[]; agents?: Array<{ id: DesktopAgentId; available: boolean; reason?: string }> }>(''),
    create: (agent: DesktopAgentId, cwd: string, ssh?: DesktopAgentSshTarget) =>
      request<DesktopAgentSession>('/sessions', 'POST', {
        agent,
        cwd,
        executionPolicy: 'external-cli',
        ...(ssh ? { ssh } : {}),
      }),
    close: (id: string) => request(`/sessions/${id}`, 'DELETE'),
    input: (id: string, data: string) => request(`/sessions/${id}/input`, 'POST', { data }),
    resize: (id: string, cols: number, rows: number) =>
      request(`/sessions/${id}/resize`, 'POST', { cols, rows }),
    stream: async (
      id: string,
      signal: AbortSignal,
      onEvent: (event: DesktopAgentEvent) => void | Promise<void>,
    ) => {
      const context = await makeDaemonRequestContext(transport)
      const response = await fetch(context.url(`/desktop-agents/sessions/${id}/events`), {
        headers: context.headers(),
        signal,
      })
      if (!response.ok || !response.body)
        throw new Error(`터미널 연결 실패 (${response.status}). 세션 목록을 새로고침하세요.`)
      let ended = false
      for await (const { data } of parseJsonSseStream<DesktopAgentEvent>(response.body)) {
        if (!data || signal.aborted) continue
        await onEvent(data)
        if (data.type === 'exit') ended = true
      }
      if (!ended && !signal.aborted)
        throw new Error('연결이 끊겼습니다. 다시 연결하면 현재 CLI 화면을 복원합니다.')
    },
  }
}
export type DesktopAgentApi = ReturnType<typeof createDesktopAgentApi>

export function createTerminalInputQueue(
  send: (data: string) => Promise<unknown>,
  onError: (error: unknown) => void,
) {
  let buffer = ''
  let active = false
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = async () => {
    if (active || closed) return
    active = true
    try {
      while (buffer && !closed) {
        let end = Math.min(buffer.length, 16000)
        if (end < buffer.length && /[\uD800-\uDBFF]/.test(buffer[end - 1]!)) end--
        const chunk = buffer.slice(0, end)
        buffer = buffer.slice(end)
        await send(chunk)
      }
    } catch (error) {
      closed = true
      buffer = ''
      onError(error)
    } finally {
      active = false
    }
  }
  return {
    write(data: string) {
      if (closed) return
      if (buffer.length + data.length > 1024 * 1024) {
        closed = true
        buffer = ''
        onError(new Error('붙여넣기 입력이 너무 큽니다 (최대 1 MiB).'))
        return
      }
      buffer += data
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void flush()
      }, 8)
    },
    dispose() {
      closed = true
      buffer = ''
      if (timer) clearTimeout(timer)
    },
  }
}
