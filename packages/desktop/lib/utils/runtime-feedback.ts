import { CapabilityUnavailableError } from '@/lib/api/_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import { isLoopbackHostname } from '@/lib/transport/web-transport'

export interface RuntimeFeedback {
  title: string
  description: string
}

interface RuntimeFeedbackOptions {
  defaultTitle: string
  browserTitle?: string
  capabilityTitle?: string
}

export async function isBrowserPreviewTransport(transport: Transport): Promise<boolean> {
  if (transport.kind !== 'web' || typeof window === 'undefined') return false
  const cfg = await transport.getConfig()
  const pageHostname = window.location.hostname

  if (!pageHostname || isLoopbackHostname(pageHostname)) return false

  try {
    const daemonHostname = cfg.daemonOrigin.startsWith('/')
      ? pageHostname
      : new URL(cfg.daemonOrigin).hostname
    return isLoopbackHostname(daemonHostname)
  } catch {
    return false
  }
}

export async function explainRuntimeFailure(
  transport: Transport,
  error: unknown,
  options: RuntimeFeedbackOptions,
): Promise<RuntimeFeedback> {
  const cfg = await transport.getConfig()

  if (await isBrowserPreviewTransport(transport)) {
    return {
      title: options.browserTitle ?? '브라우저 renderer가 loopback daemon에 묶여 있습니다',
      description: `현재 브라우저 renderer가 ${cfg.daemonOrigin}로 연결되도록 설정되어 있습니다. Connections에서 현재 접근 가능한 daemon/gateway 주소로 바꾸면 브라우저에서도 대부분 기능을 그대로 사용할 수 있습니다.`,
    }
  }

  if (error instanceof CapabilityUnavailableError) {
    return {
      title: options.capabilityTitle ?? '현재 daemon에서 이 기능을 지원하지 않습니다',
      description: `'${error.capability}' capability가 현재 daemon에 없습니다. daemon 버전과 확장 구성을 확인하세요.`,
    }
  }

  const message = error instanceof Error ? error.message : ''
  const status = message.match(/\((\d{3})\)/)?.[1]
  const requestId =
    error && typeof error === 'object' ? (error as { requestId?: unknown }).requestId : undefined

  return {
    title: options.defaultTitle,
    description: [
      `${cfg.daemonOrigin}에 요청하지 못했습니다.`,
      status ? `HTTP ${status} 응답을 받았습니다.` : null,
      typeof requestId === 'string' ? `요청 ID: ${requestId}` : null,
      'Settings의 Connections에서 상태를 확인하세요.',
    ]
      .filter(Boolean)
      .join(' '),
  }
}
