/**
 * LLM Config Migration Utilities
 * - Migrates from LLMConfig (v1) to LLMConfigV2 (Connection-based architecture)
 */

import { nanoid } from 'nanoid';
import { LLMConfig, LLMConfigV2, LLMConnection, ModelConfig } from '@/types';

/**
 * Migrates LLMConfig (v1) to LLMConfigV2 (v2)
 */
export function migrateLLMConfig(oldConfig: LLMConfig): LLMConfigV2 {
  const connections: LLMConnection[] = [];
  const models: ModelConfig[] = [];

  // Create main connection from base LLM config
  const mainConnectionId = `conn-main-${nanoid()}`;
  connections.push({
    id: mainConnectionId,
    name: 'Main LLM',
    provider: oldConfig.provider,
    baseURL: oldConfig.baseURL,
    apiKey: oldConfig.apiKey,
    customHeaders: oldConfig.customHeaders || {},
    enabled: true,
  });

  // Create base model config
  const baseModelId = `model-base-${nanoid()}`;
  models.push({
    id: baseModelId,
    connectionId: mainConnectionId,
    modelId: oldConfig.model,
    tags: ['base'],
    temperature: oldConfig.temperature,
    maxTokens: oldConfig.maxTokens,
  });

  let activeBaseModelId: string | undefined = baseModelId;
  let activeVisionModelId: string | undefined;
  let activeAutocompleteModelId: string | undefined;

  // Migrate Vision config if exists
  if (oldConfig.vision?.enabled && oldConfig.vision.model) {
    const visionConnectionId =
      oldConfig.vision.provider !== oldConfig.provider ||
      oldConfig.vision.baseURL !== oldConfig.baseURL ||
      oldConfig.vision.apiKey
        ? `conn-vision-${nanoid()}`
        : mainConnectionId;

    // Create separate connection if vision uses different provider/baseURL/apiKey
    if (visionConnectionId !== mainConnectionId) {
      connections.push({
        id: visionConnectionId,
        name: 'Vision LLM',
        provider: oldConfig.vision.provider || oldConfig.provider,
        baseURL: oldConfig.vision.baseURL || oldConfig.baseURL,
        apiKey: oldConfig.vision.apiKey || oldConfig.apiKey,
        customHeaders: oldConfig.customHeaders || {},
        enabled: true,
      });
    }

    const visionModelId = `model-vision-${nanoid()}`;
    models.push({
      id: visionModelId,
      connectionId: visionConnectionId,
      modelId: oldConfig.vision.model,
      tags: ['vision'],
      maxImageTokens: oldConfig.vision.maxImageTokens,
      enableStreaming: oldConfig.vision.enableStreaming,
    });

    activeVisionModelId = visionModelId;
  }

  // Migrate Autocomplete config if exists
  if (oldConfig.autocomplete?.enabled && oldConfig.autocomplete.model) {
    const autocompleteConnectionId =
      oldConfig.autocomplete.provider !== oldConfig.provider ||
      oldConfig.autocomplete.baseURL !== oldConfig.baseURL ||
      oldConfig.autocomplete.apiKey
        ? `conn-autocomplete-${nanoid()}`
        : mainConnectionId;

    // Create separate connection if autocomplete uses different provider/baseURL/apiKey
    if (autocompleteConnectionId !== mainConnectionId) {
      connections.push({
        id: autocompleteConnectionId,
        name: 'Autocomplete LLM',
        provider: oldConfig.autocomplete.provider || oldConfig.provider,
        baseURL: oldConfig.autocomplete.baseURL || oldConfig.baseURL,
        apiKey: oldConfig.autocomplete.apiKey || oldConfig.apiKey,
        customHeaders: oldConfig.customHeaders || {},
        enabled: true,
      });
    }

    const autocompleteModelId = `model-autocomplete-${nanoid()}`;
    models.push({
      id: autocompleteModelId,
      connectionId: autocompleteConnectionId,
      modelId: oldConfig.autocomplete.model,
      tags: ['autocomplete'],
      temperature: oldConfig.autocomplete.temperature,
      maxTokens: oldConfig.autocomplete.maxTokens,
      debounceMs: oldConfig.autocomplete.debounceMs,
    });

    activeAutocompleteModelId = autocompleteModelId;
  }

  return {
    version: 2,
    connections,
    models,
    defaultTemperature: oldConfig.temperature,
    defaultMaxTokens: oldConfig.maxTokens,
    activeBaseModelId,
    activeVisionModelId,
    activeAutocompleteModelId,
  };
}

/**
 * Converts LLMConfigV2 back to LLMConfig for backward compatibility
 * (Used by existing code that expects LLMConfig)
 */
export function convertV2ToV1(configV2: LLMConfigV2): LLMConfig {
  // Find active base model
  const baseModel = configV2.models.find((m) => m.id === configV2.activeBaseModelId);
  const baseConnection = configV2.connections.find((c) => c.id === baseModel?.connectionId);

  if (!baseModel || !baseConnection) {
    throw new Error('No active base model configured');
  }

  const config: LLMConfig = {
    provider: baseConnection.provider,
    baseURL: baseConnection.baseURL,
    apiKey: baseConnection.apiKey,
    model: baseModel.modelId,
    temperature: baseModel.temperature ?? configV2.defaultTemperature,
    maxTokens: baseModel.maxTokens ?? configV2.defaultMaxTokens,
    customHeaders: {
      ...baseConnection.customHeaders,
      ...baseModel.customHeaders,
    },
  };

  // Add Vision config if active vision model exists
  if (configV2.activeVisionModelId) {
    const visionModel = configV2.models.find((m) => m.id === configV2.activeVisionModelId);
    const visionConnection = configV2.connections.find((c) => c.id === visionModel?.connectionId);

    if (visionModel && visionConnection) {
      config.vision = {
        enabled: true,
        provider: visionConnection.provider,
        baseURL: visionConnection.baseURL !== baseConnection.baseURL ? visionConnection.baseURL : undefined,
        apiKey: visionConnection.apiKey !== baseConnection.apiKey ? visionConnection.apiKey : undefined,
        model: visionModel.modelId,
        maxImageTokens: visionModel.maxImageTokens,
        enableStreaming: visionModel.enableStreaming,
      };
    }
  }

  // Add Autocomplete config if active autocomplete model exists
  if (configV2.activeAutocompleteModelId) {
    const autocompleteModel = configV2.models.find((m) => m.id === configV2.activeAutocompleteModelId);
    const autocompleteConnection = configV2.connections.find((c) => c.id === autocompleteModel?.connectionId);

    if (autocompleteModel && autocompleteConnection) {
      config.autocomplete = {
        enabled: true,
        provider: autocompleteConnection.provider,
        baseURL: autocompleteConnection.baseURL !== baseConnection.baseURL ? autocompleteConnection.baseURL : undefined,
        apiKey: autocompleteConnection.apiKey !== baseConnection.apiKey ? autocompleteConnection.apiKey : undefined,
        model: autocompleteModel.modelId,
        temperature: autocompleteModel.temperature,
        maxTokens: autocompleteModel.maxTokens,
        debounceMs: autocompleteModel.debounceMs,
      };
    }
  }

  return config;
}

/**
 * Check if config is v2
 */
export function isLLMConfigV2(config: any): config is LLMConfigV2 {
  return config && config.version === 2;
}
