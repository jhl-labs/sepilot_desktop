import type { DaemonConfigProvider } from '@sepilotd/api-client'

export const REDACTED_SECRET = '***redacted***'

export const PROVIDER_TYPE_SUGGESTIONS = [
  'openai',
  'anthropic',
  'ollama',
  'opencode',
  'codex',
  'gemini',
  'groq',
  'together',
  'deepseek',
  'openrouter',
  'custom',
] as const

const API_KEY_PROVIDER_TYPES = new Set([
  'openai',
  'anthropic',
  'gemini',
  'groq',
  'together',
  'deepseek',
  'openrouter',
])

const DISCOVERABLE_PROVIDER_TYPES = new Set([
  'openai',
  'anthropic',
  'ollama',
  'opencode',
  'codex',
  'custom',
])

const CAPABILITY_KEYS = new Set([
  'vision',
  'toolUse',
  'streaming',
  'embedding',
  'thinking',
  'adaptivePromptReact',
  'promptReactPreferred',
  'deepCoderAnalysis',
])

export interface ProviderHeaderDraft {
  key: string
  value: string
  stored: boolean
}

export interface ProviderDraft {
  isNew: boolean
  originalId?: string
  originalType?: string
  originalBaseUrl?: string
  id: string
  type: string
  baseUrl: string
  apiKey: string
  apiKeyStored: boolean
  models: string[]
  modelInput: string
  headers: ProviderHeaderDraft[]
  defaultContextWindow: string
  defaultMaxOutputTokens: string
  disableDefaultPlugins: boolean
  capabilitiesText: string
  modelOverridesText: string
  legacyDefault: boolean
}

export function providerTypeRequiresApiKey(type: string): boolean {
  return API_KEY_PROVIDER_TYPES.has(type.trim().toLowerCase())
}

export function providerTypeSupportsDiscovery(type: string): boolean {
  return DISCOVERABLE_PROVIDER_TYPES.has(type.trim().toLowerCase())
}

export function createEmptyProviderDraft(): ProviderDraft {
  return {
    isNew: true,
    id: '',
    type: 'openai',
    baseUrl: '',
    apiKey: '',
    apiKeyStored: false,
    models: [],
    modelInput: '',
    headers: [],
    defaultContextWindow: '',
    defaultMaxOutputTokens: '',
    disableDefaultPlugins: true,
    capabilitiesText: '',
    modelOverridesText: '',
    legacyDefault: false,
  }
}

export function providerToDraft(provider: DaemonConfigProvider): ProviderDraft {
  return {
    isNew: false,
    originalId: provider.id,
    originalType: provider.type,
    originalBaseUrl: provider.baseUrl ?? '',
    id: provider.id,
    type: provider.type,
    baseUrl: provider.baseUrl ?? '',
    apiKey: provider.apiKey && provider.apiKey !== REDACTED_SECRET ? provider.apiKey : '',
    apiKeyStored: provider.apiKey === REDACTED_SECRET,
    models: [...provider.models],
    modelInput: '',
    headers: Object.entries(provider.headers ?? {}).map(([key, value]) => ({
      key,
      value: value === REDACTED_SECRET ? '' : value,
      stored: value === REDACTED_SECRET,
    })),
    defaultContextWindow: provider.defaultContextWindow?.toString() ?? '',
    defaultMaxOutputTokens: provider.defaultMaxOutputTokens?.toString() ?? '',
    disableDefaultPlugins: provider.disableDefaultPlugins ?? true,
    capabilitiesText: provider.capabilities ? JSON.stringify(provider.capabilities, null, 2) : '',
    modelOverridesText: provider.modelOverrides?.length
      ? JSON.stringify(provider.modelOverrides, null, 2)
      : '',
    legacyDefault: Boolean(provider.default),
  }
}

function parsePositiveInteger(value: string, label: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label}은 양의 정수여야 합니다.`)
  }
  return parsed
}

function parseCapabilities(value: string): DaemonConfigProvider['capabilities'] | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Capabilities는 JSON 객체여야 합니다.')
  }
  validateCapabilitiesObject(parsed, 'Capabilities')
  return parsed as DaemonConfigProvider['capabilities']
}

function validateCapabilitiesObject(value: unknown, label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}는 JSON 객체여야 합니다.`)
  }
  for (const [key, capability] of Object.entries(value)) {
    if (!CAPABILITY_KEYS.has(key) || typeof capability !== 'boolean') {
      throw new Error(`${label}의 '${key}' 값은 지원되는 boolean 필드여야 합니다.`)
    }
  }
}

function validateCompatibilityObject(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Model override compatibility는 JSON 객체여야 합니다.')
  }
  const compatibility = value as Record<string, unknown>
  const unknownKey = Object.keys(compatibility).find(
    (key) => !['toolTransport', 'answerProtocol', 'notes'].includes(key),
  )
  if (unknownKey) {
    throw new Error(`Model override compatibility의 '${unknownKey}' 필드는 지원되지 않습니다.`)
  }
  if (
    compatibility.toolTransport !== undefined
    && !['auto', 'native', 'prompt-react', 'adaptive'].includes(String(compatibility.toolTransport))
  ) {
    throw new Error('Model override compatibility의 toolTransport 값이 올바르지 않습니다.')
  }
  if (
    compatibility.answerProtocol !== undefined
    && !['auto', 'repair-left-truncated-answer-stem'].includes(String(compatibility.answerProtocol))
  ) {
    throw new Error('Model override compatibility의 answerProtocol 값이 올바르지 않습니다.')
  }
  if (
    compatibility.notes !== undefined
    && (
      !Array.isArray(compatibility.notes)
      || compatibility.notes.some((note) => typeof note !== 'string' || !note.trim())
    )
  ) {
    throw new Error('Model override compatibility의 notes는 비어 있지 않은 문자열 배열이어야 합니다.')
  }
}

function parseModelOverrides(value: string): DaemonConfigProvider['modelOverrides'] | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Model overrides는 JSON 배열이어야 합니다.')
  }
  const ids = new Set<string>()
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Model overrides의 각 항목은 JSON 객체여야 합니다.')
    }
    const values = entry as Record<string, unknown>
    const unknownKey = Object.keys(values).find(
      (key) => !['id', 'contextWindow', 'maxOutputTokens', 'capabilities', 'compatibility'].includes(key),
    )
    if (unknownKey) {
      throw new Error(`Model overrides의 '${unknownKey}' 필드는 지원되지 않습니다.`)
    }
    if (typeof values.id !== 'string' || !values.id.trim()) {
      throw new Error("Model overrides의 각 항목에는 비어 있지 않은 문자열 'id'가 필요합니다.")
    }
    if (ids.has(values.id.trim())) {
      throw new Error(`Model override ID '${values.id.trim()}'가 중복되었습니다.`)
    }
    ids.add(values.id.trim())
    for (const key of ['contextWindow', 'maxOutputTokens'] as const) {
      const tokenValue = values[key]
      if (
        tokenValue !== undefined &&
        (typeof tokenValue !== 'number' || !Number.isInteger(tokenValue) || tokenValue <= 0)
      ) {
        throw new Error(`Model overrides의 '${key}' 값은 양의 정수여야 합니다.`)
      }
    }
    if (values.capabilities !== undefined) {
      validateCapabilitiesObject(values.capabilities, 'Model override capabilities')
    }
    if (values.compatibility !== undefined) {
      validateCompatibilityObject(values.compatibility)
    }
  }
  return parsed as DaemonConfigProvider['modelOverrides']
}

export function buildProviderConfig(draft: ProviderDraft): DaemonConfigProvider {
  const id = draft.id.trim()
  const type = draft.type.trim()
  if (!id || !type) throw new Error('Provider ID와 Type을 입력하세요.')
  if (draft.originalId && draft.originalId !== id) {
    throw new Error('저장된 provider ID는 변경할 수 없습니다.')
  }
  if (type === 'custom' && !draft.baseUrl.trim()) {
    throw new Error('custom provider에는 Base URL이 필요합니다.')
  }
  const credentialTargetChanged =
    !draft.isNew &&
    (type !== draft.originalType || draft.baseUrl.trim() !== (draft.originalBaseUrl ?? '').trim())
  if (credentialTargetChanged && draft.apiKeyStored && !draft.apiKey.trim()) {
    throw new Error('Provider type 또는 Base URL 변경 시 API Key를 다시 입력해야 합니다.')
  }
  if (
    credentialTargetChanged &&
    draft.headers.some((header) => header.stored && !header.value)
  ) {
    throw new Error('Provider type 또는 Base URL 변경 시 저장된 header 값을 다시 입력해야 합니다.')
  }
  if (providerTypeRequiresApiKey(type) && !draft.apiKey.trim() && !draft.apiKeyStored) {
    throw new Error(`${type} provider에는 API Key가 필요합니다.`)
  }

  const headers = Object.fromEntries(
    draft.headers.flatMap((entry) => {
      const key = entry.key.trim()
      if (!key) return []
      const value = entry.value || (entry.stored ? REDACTED_SECRET : '')
      return [[key, value] as const]
    }),
  )
  const provider: DaemonConfigProvider = {
    id,
    type,
    models: Array.from(new Set(draft.models.map((model) => model.trim()).filter(Boolean))),
    headers,
    default: draft.legacyDefault,
  }
  const apiKey = draft.apiKey.trim() || (draft.apiKeyStored ? REDACTED_SECRET : '')
  if (apiKey) provider.apiKey = apiKey
  if (draft.baseUrl.trim()) provider.baseUrl = draft.baseUrl.trim()

  const contextWindow = parsePositiveInteger(draft.defaultContextWindow, 'Context window')
  if (contextWindow) provider.defaultContextWindow = contextWindow
  const maxOutputTokens = parsePositiveInteger(draft.defaultMaxOutputTokens, 'Max output tokens')
  if (maxOutputTokens) provider.defaultMaxOutputTokens = maxOutputTokens
  if (type === 'opencode') provider.disableDefaultPlugins = draft.disableDefaultPlugins
  const capabilities = parseCapabilities(draft.capabilitiesText)
  if (capabilities) provider.capabilities = capabilities
  const modelOverrides = parseModelOverrides(draft.modelOverridesText)
  if (modelOverrides) provider.modelOverrides = modelOverrides
  return provider
}

export function addDraftModel(draft: ProviderDraft): ProviderDraft {
  const model = draft.modelInput.trim()
  if (!model) return draft
  return {
    ...draft,
    models: draft.models.includes(model) ? draft.models : [...draft.models, model],
    modelInput: '',
  }
}
