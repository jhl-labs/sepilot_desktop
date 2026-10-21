'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DaemonConfigProvider } from '@sepilotd/api-client'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { createModelSettingsApi, type ModelSettingsSnapshot } from '@/lib/api/model-settings'
import { invalidateProviderCatalog } from '@/lib/chat/provider-catalog'
import { recordSettingsSave } from '@/lib/store/settings-save-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { confirm } from '@/lib/utils/confirm'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import {
  buildProviderConfig,
  createEmptyProviderDraft,
  providerToDraft,
  type ProviderDraft,
} from './model-settings-view'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: ModelSettingsSnapshot }

export interface SaveProviderDraftOptions {
  validateBeforeSave?: boolean
  validationModel?: string
}

export function useAiModelsController() {
  const transport = useTransport()
  const setLlm = useSettingsStore((state) => state.setLlm)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [preferredModel, setPreferredModel] = useState<{
    providerId: string
    modelId: string
  } | null>(null)
  const [draft, setDraft] = useState<ProviderDraft | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const mutationInFlight = useRef(false)
  const transportRef = useRef(transport)
  transportRef.current = transport

  const load = useCallback(
    async (showLoading = true) => {
      const generation = ++loadGeneration.current
      const activeTransport = transportRef.current
      if (showLoading) setState({ kind: 'loading' })
      try {
        const api = await createModelSettingsApi(activeTransport)
        const snapshot = await api.snapshot()
        if (generation !== loadGeneration.current || activeTransport !== transportRef.current)
          return
        setState({ kind: 'ready', snapshot })
        setLlm({
          providerId: snapshot.model.current?.providerId ?? null,
          modelId: snapshot.model.current?.modelId ?? null,
        })
        setSelectedProviderId((current) => {
          if (current && snapshot.config.providers.some((provider) => provider.id === current)) {
            return current
          }
          return snapshot.model.current?.providerId ?? snapshot.config.providers[0]?.id ?? null
        })
      } catch (error) {
        if (generation !== loadGeneration.current || activeTransport !== transportRef.current)
          return
        const friendly = explainChatStreamError(error)
        setState({ kind: 'error', message: friendly.description })
      }
    },
    [setLlm],
  )

  useEffect(() => {
    setDraft(null)
    setPreferredModel(null)
    void load()
    return () => {
      loadGeneration.current += 1
    }
  }, [load, transport])

  const snapshot = state.kind === 'ready' ? state.snapshot : null
  const selectedProvider = useMemo(
    () => snapshot?.config.providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [selectedProviderId, snapshot],
  )

  const runMutation = useCallback(async (action: string, mutation: () => Promise<void>) => {
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    setBusyAction(action)
    try {
      await mutation()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      mutationInFlight.current = false
      setBusyAction(null)
    }
  }, [])

  const saveDraft = useCallback(
    async (options: SaveProviderDraftOptions = {}) => {
      if (!draft || !snapshot) return
      let built: DaemonConfigProvider
      try {
        built = buildProviderConfig(draft)
      } catch (error) {
        toast.error('Provider 설정을 확인하세요.', {
          description: error instanceof Error ? error.message : '알 수 없는 오류',
        })
        return
      }
      const duplicate = snapshot.config.providers.some(
        (provider) => provider.id === built.id && provider.id !== draft.originalId,
      )
      if (duplicate) {
        toast.error(`Provider ID '${built.id}'가 이미 존재합니다.`)
        return
      }
      const current = snapshot.model.current
      if (current?.providerId === built.id && !built.models.includes(current.modelId)) {
        toast.error('현재 기본 모델은 Provider에서 제거할 수 없습니다.', {
          description: '다른 모델을 기본값으로 전환한 뒤 다시 편집하세요.',
        })
        return
      }
      if (options.validateBeforeSave && built.models.length === 0) {
        toast.warning('연결 확인에 사용할 모델을 하나 이상 추가하세요.')
        return
      }
      const requestedValidationModel = options.validationModel?.trim()
      if (
        options.validateBeforeSave &&
        (!requestedValidationModel || !built.models.includes(requestedValidationModel))
      ) {
        toast.warning('연결 확인에 사용할 채팅 모델을 선택하세요.')
        return
      }

      await runMutation('save', async () => {
        const api = await createModelSettingsApi(transport)
        const validationModel = options.validateBeforeSave
          ? requestedValidationModel
          : !draft.isNew && current?.providerId === built.id
            ? current.modelId
            : undefined
        if (validationModel) {
          await api.validateProvider({ provider: built, model: validationModel })
        }
        await api.upsertProvider(built, draft.isNew ? 'create' : 'update')
        invalidateProviderCatalog()
        recordSettingsSave('llm')
        setDraft(null)
        setSelectedProviderId(built.id)
        if (requestedValidationModel) {
          setPreferredModel({ providerId: built.id, modelId: requestedValidationModel })
        }
        const successMessage = draft.isNew ? 'Provider를 추가했습니다.' : 'Provider를 저장했습니다.'
        if (options.validateBeforeSave) {
          toast.success(successMessage, { description: '실제 모델 연결 확인을 통과했습니다.' })
        } else {
          toast.success(successMessage)
        }
        await load(false)
      })
    },
    [draft, load, runMutation, snapshot, transport],
  )

  const discoverDraftModels = useCallback(async () => {
    if (!draft) return
    await runMutation('discover-draft', async () => {
      const provider = buildProviderConfig({
        ...draft,
        models: draft.models.length > 0 ? draft.models : ['discovery-probe'],
      })
      const api = await createModelSettingsApi(transport)
      const result = await api.discoverProviderModels({
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: provider.headers,
      })
      setDraft((current) => (current ? { ...current, models: result.models } : current))
      if (result.models.length === 0) {
        toast.warning('가져온 모델이 없습니다. 모델 ID를 직접 추가하세요.')
      } else {
        toast.success(`${result.models.length}개 모델을 가져왔습니다.`)
      }
    })
  }, [draft, runMutation, transport])

  const refreshProviderModels = useCallback(
    async (providerId: string) => {
      await runMutation(`refresh:${providerId}`, async () => {
        const api = await createModelSettingsApi(transport)
        const result = await api.refreshProviderModels(providerId)
        invalidateProviderCatalog()
        if (result.models.length === 0) {
          toast.warning('가져온 모델이 없습니다. 기존 카탈로그를 유지합니다.')
        } else {
          toast.success(
            result.updated
              ? `${result.models.length}개 모델로 카탈로그를 갱신했습니다.`
              : '모델 카탈로그가 이미 최신입니다.',
          )
        }
        await load(false)
      })
    },
    [load, runMutation, transport],
  )

  const validateProvider = useCallback(
    async (provider: DaemonConfigProvider, modelId: string) => {
      const requestedModel = modelId.trim()
      if (!requestedModel || !provider.models.includes(requestedModel)) {
        toast.warning('연결 테스트할 모델을 선택하세요.')
        return
      }
      await runMutation(`validate:${provider.id}/${requestedModel}`, async () => {
        const api = await createModelSettingsApi(transport)
        const result = await api.validateProvider({ provider, model: requestedModel })
        toast.success(`${requestedModel} 연결됨 · ${result.latencyMs}ms`, {
          description: result.message,
        })
      })
    },
    [runMutation, transport],
  )

  const switchDefaultModel = useCallback(
    async (providerId: string, modelId: string) => {
      await runMutation(`switch:${providerId}/${modelId}`, async () => {
        const api = await createModelSettingsApi(transport)
        const result = await api.switchDefaultModel({ target: `${providerId}/${modelId}` })
        if (!result.ok) {
          toast.error('모델 연결 테스트에 실패했습니다.', {
            description: result.reason || result.message,
          })
          await load(false)
          return
        }
        invalidateProviderCatalog()
        recordSettingsSave('llm')
        setPreferredModel({ providerId, modelId })
        toast.success(
          result.status === 'no_change'
            ? '이미 기본 모델로 사용 중입니다.'
            : '기본 모델을 변경했습니다.',
          {
            description: result.latencyMs ? `${result.latencyMs}ms self-test 통과` : result.message,
          },
        )
        await load(false)
      })
    },
    [load, runMutation, transport],
  )

  const removeProvider = useCallback(
    async (provider: DaemonConfigProvider) => {
      if (!snapshot) return
      if (snapshot.model.current?.providerId === provider.id) {
        toast.warning('현재 기본 provider는 삭제할 수 없습니다.', {
          description: '다른 모델을 기본값으로 전환한 뒤 다시 시도하세요.',
        })
        return
      }
      if (snapshot.config.memory.embeddingProvider === provider.id) {
        toast.warning('Embedding에 사용 중인 provider는 삭제할 수 없습니다.', {
          description: 'Memory 설정에서 embedding provider를 먼저 변경하세요.',
        })
        return
      }
      if (snapshot.config.agent.intentRouter?.provider === provider.id) {
        toast.warning('Intent Router에 사용 중인 provider는 삭제할 수 없습니다.', {
          description: 'Agent 설정에서 Intent Router provider를 먼저 변경하세요.',
        })
        return
      }
      const accepted = await confirm(`'${provider.id}' provider를 삭제하시겠습니까?`, {
        title: 'Provider 삭제',
        confirmLabel: '삭제',
        destructive: true,
      })
      if (!accepted) return
      await runMutation(`remove:${provider.id}`, async () => {
        const api = await createModelSettingsApi(transport)
        await api.deleteProvider(provider.id)
        invalidateProviderCatalog()
        recordSettingsSave('llm')
        toast.success(`Provider '${provider.id}'를 삭제했습니다.`)
        await load(false)
      })
    },
    [load, runMutation, snapshot, transport],
  )

  return {
    state,
    snapshot,
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId,
    preferredModel,
    draft,
    setDraft,
    busyAction,
    load,
    startCreate: () => setDraft(createEmptyProviderDraft()),
    startEdit: (provider: DaemonConfigProvider) => setDraft(providerToDraft(provider)),
    saveDraft,
    discoverDraftModels,
    refreshProviderModels,
    validateProvider,
    switchDefaultModel,
    removeProvider,
  }
}
