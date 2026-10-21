import {
  DaemonClient,
  type DaemonConfig,
  type DaemonConfigProvider,
  type DaemonModelSnapshot,
  type DaemonModelSwitchInput,
  type DaemonModelSwitchResult,
  type DaemonProviderDiscoverModelsInput,
  type DaemonProviderDiscoverModelsResult,
  type DaemonProviderInfo,
  type DaemonProviderMutationResult,
  type DaemonProviderRefreshModelsResult,
  type DaemonProviderValidationInput,
  type DaemonProviderValidationResult,
} from '@sepilotd/api-client'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface ModelSettingsSnapshot {
  config: DaemonConfig
  providers: DaemonProviderInfo[]
  model: DaemonModelSnapshot
}

export interface ModelSettingsApi {
  snapshot(): Promise<ModelSettingsSnapshot>
  upsertProvider(
    provider: DaemonConfigProvider,
    mode: 'create' | 'update',
  ): Promise<DaemonProviderMutationResult>
  deleteProvider(providerId: string): Promise<void>
  validateProvider(input: DaemonProviderValidationInput): Promise<DaemonProviderValidationResult>
  discoverProviderModels(
    input: DaemonProviderDiscoverModelsInput,
  ): Promise<DaemonProviderDiscoverModelsResult>
  refreshProviderModels(providerId: string): Promise<DaemonProviderRefreshModelsResult>
  switchDefaultModel(input: DaemonModelSwitchInput): Promise<DaemonModelSwitchResult>
}

export async function createModelSettingsApi(transport: Transport): Promise<ModelSettingsApi> {
  const config = await transport.getConfig()
  const client = new DaemonClient({
    baseUrl: config.daemonOrigin,
    token: config.daemonToken,
    surface: 'desktop',
  })

  return {
    async snapshot() {
      const [daemonConfig, providers, model] = await Promise.all([
        client.config(),
        client.providers(),
        client.model(),
      ])
      return { config: daemonConfig, providers, model }
    },
    upsertProvider: (provider, mode) => client.upsertProvider(provider, mode),
    deleteProvider: (providerId) => client.deleteProvider(providerId),
    validateProvider: (input) => client.validateProvider(input),
    discoverProviderModels: (input) => client.discoverProviderModels(input),
    refreshProviderModels: (providerId) => client.refreshProviderModels(providerId),
    switchDefaultModel: (input) => client.switchDefaultModel(input),
  }
}
