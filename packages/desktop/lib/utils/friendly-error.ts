export interface FriendlyError {
  title: string
  description: string
  code?: string
  status?: number
  requestId?: string
}

const DAEMON_CODE_COPY: Record<string, FriendlyError> = {
  AGENT_INACTIVITY: {
    title: '에이전트가 일정 시간 응답하지 않아 중단되었습니다',
    description:
      '더 작고 구체적인 질문으로 나눠서 다시 시도하거나, 잠시 후 새 실행을 시작해보세요.',
  },
  AGENT_CAPACITY_EXHAUSTED: {
    title: 'daemon의 실행 슬롯이 모두 사용 중입니다',
    description: '잠시 후 다시 시도하거나 다른 세션의 실행을 종료하세요.',
  },
  SERVICE_UNAVAILABLE: {
    title: 'daemon이 아직 준비되지 않았습니다',
    description:
      'daemon이 부팅 중이거나 프로바이더가 설정되지 않았을 수 있습니다. 설정 화면에서 상태를 확인하세요.',
  },
  PROVIDER_CIRCUIT_OPEN: {
    title: '현재 프로바이더가 일시 차단되었습니다',
    description:
      '연속 실패로 인해 자동으로 차단된 상태입니다. 다른 프로바이더로 전환하거나 잠시 기다려 보세요.',
  },
  RUNTIME_NOT_INITIALIZED: {
    title: 'daemon 런타임이 초기화되지 않았습니다',
    description: 'daemon을 다시 시작하거나 잠시 후 재시도하세요.',
  },
  NO_RUN_SLOTS: {
    title: '실행 슬롯이 모두 사용 중입니다',
    description: '진행 중인 다른 실행이 끝날 때까지 기다리거나 중단하세요.',
  },
  UNAUTHORIZED: {
    title: 'daemon 인증에 실패했습니다',
    description:
      'bearer token이 만료되었거나 잘못되었을 수 있습니다. 설정의 Connections에서 확인하세요.',
  },
  MODE_PROMOTION_REQUIRED: {
    title: '이 Skill은 도구 실행 모드가 필요합니다',
    description:
      '이번 요청의 ‘알아서 선택’ 승격과 감독(HITL) 실행을 승인하거나, 도구를 사용할 수 있는 모드로 전환해 다시 시도하세요.',
  },
}

const KNOWN_CODES = new Set(Object.keys(DAEMON_CODE_COPY))

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return ''
}

function extractRequestId(message: string): string | undefined {
  const jsonMatch = /"requestId"\s*:\s*"([^"]+)"/.exec(message)
  if (jsonMatch) return jsonMatch[1]
  const textMatch = /\brequest(?:Id| ID)?[=:]\s*([A-Za-z0-9._:-]+)/.exec(message)
  return textMatch?.[1]
}

function extractHttpStatus(message: string): number | undefined {
  const httpMatch = /^(\d{3})[:\s]/.exec(message) ?? /\((\d{3})\)/.exec(message)
  if (!httpMatch) return undefined
  const status = Number.parseInt(httpMatch[1], 10)
  return Number.isFinite(status) ? status : undefined
}

function readErrorMetadata(err: unknown, message: string): { status?: number; requestId?: string } {
  const record =
    err && typeof err === 'object' ? (err as { status?: unknown; requestId?: unknown }) : null
  const status = typeof record?.status === 'number' ? record.status : extractHttpStatus(message)
  const requestId =
    typeof record?.requestId === 'string' ? record.requestId : extractRequestId(message)
  return { status, requestId }
}

function attachTraceMetadata(
  friendly: FriendlyError,
  metadata: { status?: number; requestId?: string },
): FriendlyError {
  if (!metadata.status && !metadata.requestId) return friendly

  const traceSuffix = metadata.requestId ? `요청 ID: ${metadata.requestId}` : null
  return {
    ...friendly,
    status: metadata.status,
    requestId: metadata.requestId,
    description:
      traceSuffix && !friendly.description.includes(metadata.requestId ?? '')
        ? `${friendly.description} ${traceSuffix}`
        : friendly.description,
  }
}

function extractDaemonErrorCode(message: string): string | null {
  const envelope = /"code"\s*:\s*"([A-Z][A-Z0-9_]+)"/.exec(message)
  if (envelope && KNOWN_CODES.has(envelope[1])) return envelope[1]
  const bracket = /\bError\s*\[([A-Z][A-Z0-9_]+)\]/.exec(message)
  if (bracket && KNOWN_CODES.has(bracket[1])) return bracket[1]
  const bareToken = /\b([A-Z][A-Z0-9_]{3,})\b/.exec(message)
  if (bareToken && KNOWN_CODES.has(bareToken[1])) return bareToken[1]
  return null
}

function classifyByMessage(message: string): FriendlyError {
  if (/Daemon chat stream ended before completion/i.test(message)) {
    return {
      title: '응답이 완료되기 전에 스트림이 종료되었습니다',
      description:
        'daemon 또는 모델 연결이 중간에 닫혀 최종 응답을 받지 못했습니다. 같은 세션에서 다시 시도하고, 반복되면 daemon 로그를 확인하세요.',
    }
  }
  if (/stream-idle-timeout|operation was aborted/i.test(message) && !/user/i.test(message)) {
    return {
      title: 'daemon 응답이 중단되었습니다',
      description:
        '일정 시간 내 새 데이터가 오지 않아 스트림을 중단했습니다. 다시 시도하거나 더 큰 작업이라면 단계를 나눠보세요.',
    }
  }
  if (/^terminated$/i.test(message) || /ECONNRESET|UND_ERR_SOCKET/i.test(message)) {
    return {
      title: 'daemon과의 연결이 끊겼습니다',
      description:
        'daemon이 timeout에 걸렸거나 모델이 과부하 상태일 수 있습니다. 잠시 후 같은 세션으로 다시 시도하세요.',
    }
  }
  if (/fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(message)) {
    return {
      title: 'daemon에 연결할 수 없습니다',
      description: 'daemon이 실행 중인지 확인한 뒤 다시 시도하세요.',
    }
  }
  const httpMatch = /^(\d{3})[:\s]/.exec(message)
  if (httpMatch) {
    const status = Number.parseInt(httpMatch[1], 10)
    if (status === 401 || status === 403) {
      return {
        title: 'daemon 인증에 실패했습니다',
        description: 'bearer token을 확인하거나 설정의 Connections에서 상태를 확인하세요.',
      }
    }
    if (status === 503) {
      return {
        title: 'daemon이 현재 요청을 처리할 수 없습니다 (503)',
        description:
          '모든 프로바이더가 사용 중이거나 일시적으로 차단된 상태입니다. 잠시 후 다시 시도하세요.',
      }
    }
    if (status >= 500) {
      return {
        title: `daemon 오류 (${status})`,
        description: message,
      }
    }
    if (status >= 400) {
      return {
        title: `요청이 거부되었습니다 (${status})`,
        description: message,
      }
    }
  }
  return {
    title: '오류가 발생했습니다',
    description: message || '알 수 없는 오류',
  }
}

function isProviderAuthenticationFailure(message: string, code: string | null): boolean {
  if (code !== 'UNAUTHORIZED' && !/\b(?:401|403)\b/u.test(message)) return false
  return /\b(?:upstream|invalid[_ ]api[_ ]key|authentication_error|validation failed for)\b|Provider\s+\S+\/\S+/iu.test(
    message,
  )
}

export function explainChatStreamError(err: unknown): FriendlyError {
  const message = rawMessage(err)
  const metadata = readErrorMetadata(err, message)
  const directCode = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : null
  const code = directCode && KNOWN_CODES.has(directCode)
    ? directCode
    : extractDaemonErrorCode(message)
  if (isProviderAuthenticationFailure(message, code)) {
    return attachTraceMetadata({
      title: 'LLM 프로바이더 인증에 실패했습니다',
      description:
        'daemon token이 아니라 선택한 LLM 프로바이더의 API key 또는 upstream 인증 설정을 확인하세요.',
      ...(code ? { code } : {}),
    }, metadata)
  }
  if (code) {
    return attachTraceMetadata({ ...DAEMON_CODE_COPY[code], code }, metadata)
  }
  return attachTraceMetadata(classifyByMessage(message), metadata)
}
