import type { Transport } from '@/lib/transport/transport-adapter'
import { createHttpError, makeHttp } from './_http'

export type ContextUsageCategoryId =
  | 'system'
  | 'tools'
  | 'memory'
  | 'skills'
  | 'workspace'
  | 'document'
  | 'conversation'
  | 'draft'

export interface ContextUsageCategory {
  id: ContextUsageCategoryId
  label: string
  estimatedTokens: number
  detail?: string
}

export interface ContextUsageSnapshot {
  estimatedAt: string
  model: {
    providerId: string
    modelId: string
    contextWindow: number
    contextWindowSource: 'catalog' | 'fallback'
  }
  estimator: {
    charsPerToken: number
    calibrated: boolean
  }
  categories: ContextUsageCategory[]
  usedTokens: number
  contextWindow: number
  reservedOutputTokens: number
  freeTokens: number
  percentage: number
  dynamicContext: string[]
  compatibilityMode?: 'legacy-get'
}

export interface ContextUsageRequest {
  sessionId?: string
  mode?: string
  provider?: string
  model?: string
  maxOutputTokens?: number
  input?: string
}

export interface ContextUsageApi {
  inspect(input: ContextUsageRequest): Promise<ContextUsageSnapshot>
}

export async function createContextUsageApi(transport: Transport): Promise<ContextUsageApi> {
  const http = await makeHttp(transport, { memoryScope: true })
  return {
    async inspect(input) {
      const path = '/api/v1/context-usage'
      const response = await fetch(http.url(path), {
        method: 'POST',
        headers: http.headers(),
        body: JSON.stringify(input),
      })
      if (response.ok) return unwrapSnapshot(await response.json())
      if (response.status !== 404) throw await createHttpError(path, response)

      const params = new URLSearchParams()
      if (input.sessionId) params.set('sessionId', input.sessionId)
      if (input.mode) params.set('mode', input.mode)
      if (input.provider) params.set('provider', input.provider)
      if (input.model) params.set('model', input.model)
      if (input.maxOutputTokens && input.maxOutputTokens > 0) {
        params.set('maxOutputTokens', String(input.maxOutputTokens))
      }
      const legacyPath = `${path}${params.size > 0 ? `?${params.toString()}` : ''}`
      const legacyResponse = await fetch(http.url(legacyPath), { headers: http.headers() })
      if (legacyResponse.ok) {
        return {
          ...unwrapSnapshot(await legacyResponse.json()),
          compatibilityMode: 'legacy-get',
        }
      }
      if (legacyResponse.status !== 404) {
        throw await createHttpError(legacyPath, legacyResponse)
      }
      throw new Error(
        '연결된 daemon이 컨텍스트 조회 API를 제공하지 않습니다. daemon을 최신 빌드로 재시작하세요.',
      )
    },
  }
}

function unwrapSnapshot(
  body: unknown,
): ContextUsageSnapshot {
  const candidate = body && typeof body === 'object' && 'data' in body
    ? (body as { data: ContextUsageSnapshot }).data
    : body
  return candidate as ContextUsageSnapshot
}

export function includeDraftInContextUsage(
  snapshot: ContextUsageSnapshot,
  draft: string,
): ContextUsageSnapshot {
  const trimmed = draft.trim()
  if (!trimmed) return snapshot
  const ratio = snapshot.estimator.charsPerToken > 0
    ? snapshot.estimator.charsPerToken
    : 4
  const draftTokens = Math.ceil(draft.length / ratio) + 4
  const categories = [
    ...snapshot.categories,
    {
      id: 'draft' as const,
      label: '작성 중',
      estimatedTokens: draftTokens,
      detail: '아직 전송하지 않음',
    },
  ]
  const usedTokens = snapshot.usedTokens + draftTokens
  return {
    ...snapshot,
    categories,
    usedTokens,
    freeTokens: Math.max(
      0,
      snapshot.contextWindow - usedTokens - snapshot.reservedOutputTokens,
    ),
    percentage: Math.min(100, (usedTokens / snapshot.contextWindow) * 100),
  }
}
