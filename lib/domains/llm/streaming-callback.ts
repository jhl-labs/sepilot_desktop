import { logger } from '@/lib/utils/logger';
/**
 * Conversation-specific streaming callbacks for LLM responses
 * Supports multiple concurrent conversations with isolated streaming
 */

import type { GraphConfig } from '@/lib/domains/agent/types';
import type { ComfyUIConfig, NetworkConfig, ImageGenConfig } from '@/types';

type StreamingCallback = (chunk: string) => void;
type ImageProgressCallback = (progress: ImageGenerationProgress) => void;

export interface ImageGenerationProgress {
  status: 'queued' | 'executing' | 'completed' | 'error';
  message: string;
  progress?: number; // 0-100
  currentStep?: number;
  totalSteps?: number;
}

// Map of conversationId -> callback for concurrent streaming support
const streamingCallbacks = new Map<string, StreamingCallback>();
const imageProgressCallbacks = new Map<string, ImageProgressCallback>();

// Map of conversationId -> AbortSignal for checking if streaming should stop
const abortSignals = new Map<string, AbortSignal>();

// Current active conversation ID (for nodes that don't have access to conversationId)
let currentConversationId: string | null = null;

// Current graph config (for nodes that need access to config settings)
let currentGraphConfig: GraphConfig | null = null;
const graphConfigs = new Map<string, GraphConfig | null>();

// Current ComfyUI config (for image generation in Main Process) - deprecated, use imageGenConfig
let currentComfyUIConfig: ComfyUIConfig | null = null;
let currentNetworkConfig: NetworkConfig | null = null;

// Current ImageGen config (unified image generation config)
let currentImageGenConfig: ImageGenConfig | null = null;

// Conversation-specific configs for concurrent streams
const comfyUIConfigs = new Map<string, ComfyUIConfig | null>();
const networkConfigs = new Map<string, NetworkConfig | null>();
const imageGenConfigs = new Map<string, ImageGenConfig | null>();

// Current working directory (for Coding Agent file operations)
let currentWorkingDirectory: string | null = null;
const workingDirectories = new Map<string, string | null>();

/**
 * Set the current conversation ID for streaming context
 */
export function setCurrentConversationId(conversationId: string | null): void {
  currentConversationId = conversationId;
}

/**
 * Get the current conversation ID
 */
export function getCurrentConversationId(): string | null {
  return currentConversationId;
}

/**
 * Set the current graph config for nodes that need it
 */
export function setCurrentGraphConfig(config: GraphConfig | null, conversationId?: string): void {
  currentGraphConfig = config;

  const id = conversationId || currentConversationId;
  if (!id) {
    return;
  }

  // Store explicit null to avoid falling back to global config in concurrent streams.
  graphConfigs.set(id, config);
}

/**
 * Get the current graph config
 */
export function getCurrentGraphConfig(conversationId?: string): GraphConfig | null {
  const id = conversationId || currentConversationId;
  if (id) {
    if (graphConfigs.has(id)) {
      return graphConfigs.get(id) ?? null;
    }
    return currentGraphConfig;
  }
  return currentGraphConfig;
}

/**
 * Set the current ComfyUI config for image generation
 */
export function setCurrentComfyUIConfig(
  config: ComfyUIConfig | null,
  conversationId?: string
): void {
  currentComfyUIConfig = config;

  const id = conversationId || currentConversationId;
  if (!id) {
    return;
  }

  // Store explicit null to avoid falling back to global config in concurrent streams.
  comfyUIConfigs.set(id, config);
}

/**
 * Get the current ComfyUI config
 */
export function getCurrentComfyUIConfig(conversationId?: string): ComfyUIConfig | null {
  const id = conversationId || currentConversationId;
  if (id) {
    if (comfyUIConfigs.has(id)) {
      return comfyUIConfigs.get(id) ?? null;
    }
    return currentComfyUIConfig;
  }
  return currentComfyUIConfig;
}

/**
 * Set the current network config
 */
export function setCurrentNetworkConfig(
  config: NetworkConfig | null,
  conversationId?: string
): void {
  currentNetworkConfig = config;

  const id = conversationId || currentConversationId;
  if (!id) {
    return;
  }

  // Store explicit null to avoid falling back to global config in concurrent streams.
  networkConfigs.set(id, config);
}

/**
 * Get the current network config
 */
export function getCurrentNetworkConfig(conversationId?: string): NetworkConfig | null {
  const id = conversationId || currentConversationId;
  if (id) {
    if (networkConfigs.has(id)) {
      return networkConfigs.get(id) ?? null;
    }
    return currentNetworkConfig;
  }
  return currentNetworkConfig;
}

/**
 * Set the current working directory for Coding Agent
 */
export function setCurrentWorkingDirectory(
  directory: string | null,
  conversationId?: string
): void {
  currentWorkingDirectory = directory;

  const id = conversationId || currentConversationId;
  if (!id) {
    return;
  }

  // Store explicit null to avoid falling back to global value in concurrent streams.
  workingDirectories.set(id, directory);
}

/**
 * Get the current working directory
 */
export function getCurrentWorkingDirectory(conversationId?: string): string | null {
  const id = conversationId || currentConversationId;
  if (id) {
    if (workingDirectories.has(id)) {
      return workingDirectories.get(id) ?? null;
    }
    return currentWorkingDirectory;
  }
  return currentWorkingDirectory;
}

/**
 * Set the current ImageGen config for image generation
 */
export function setCurrentImageGenConfig(
  config: ImageGenConfig | null,
  conversationId?: string
): void {
  currentImageGenConfig = config;

  const id = conversationId || currentConversationId;
  if (!id) {
    return;
  }

  // Store explicit null to avoid falling back to global config in concurrent streams.
  imageGenConfigs.set(id, config);
}

/**
 * Get the current ImageGen config
 */
export function getCurrentImageGenConfig(conversationId?: string): ImageGenConfig | null {
  const id = conversationId || currentConversationId;
  if (id) {
    if (imageGenConfigs.has(id)) {
      return imageGenConfigs.get(id) ?? null;
    }
    return currentImageGenConfig;
  }
  return currentImageGenConfig;
}

/**
 * Set streaming callback for a specific conversation
 */
export function setStreamingCallback(
  callback: StreamingCallback | null,
  conversationId?: string
): void {
  const id = conversationId || currentConversationId;
  if (!id) {
    logger.warn('[StreamingCallback] No conversationId provided');
    return;
  }

  if (callback) {
    streamingCallbacks.set(id, callback);
  } else {
    streamingCallbacks.delete(id);
  }
}

/**
 * Get streaming callback for a specific conversation
 */
export function getStreamingCallback(conversationId?: string): StreamingCallback | null {
  const id = conversationId || currentConversationId;
  if (!id) {
    return null;
  }
  return streamingCallbacks.get(id) || null;
}

/**
 * Emit streaming chunk for the current conversation
 * Returns true if callback was called, false if no callback is set
 * Throws error if streaming was aborted
 */
export function emitStreamingChunk(chunk: string, conversationId?: string): boolean {
  const id = conversationId || currentConversationId;
  if (!id) {
    logger.warn('[StreamingCallback] No conversationId for chunk emission');
    return false;
  }

  // Check if streaming was aborted
  const signal = abortSignals.get(id);
  if (signal?.aborted) {
    logger.warn('[StreamingCallback] Streaming aborted', { conversationId: id });
    throw new Error('Streaming aborted by user');
  }

  const callback = streamingCallbacks.get(id);
  if (callback) {
    callback(chunk);
    return true;
  }
  return false;
}

/**
 * Set image progress callback for a specific conversation
 */
export function setImageProgressCallback(
  callback: ImageProgressCallback | null,
  conversationId?: string
): void {
  const id = conversationId || currentConversationId;
  if (!id) {
    logger.warn('[StreamingCallback] No conversationId provided for image progress');
    return;
  }

  if (callback) {
    imageProgressCallbacks.set(id, callback);
  } else {
    imageProgressCallbacks.delete(id);
  }
}

/**
 * Emit image generation progress for the current conversation
 */
export function emitImageProgress(
  progress: ImageGenerationProgress,
  conversationId?: string
): boolean {
  const id = conversationId || currentConversationId;
  if (!id) {
    return false;
  }

  const callback = imageProgressCallbacks.get(id);
  if (callback) {
    callback(progress);
    return true;
  }
  return false;
}

/**
 * Set abort signal for a specific conversation
 */
export function setAbortSignal(signal: AbortSignal, conversationId?: string): void {
  const id = conversationId || currentConversationId;
  if (!id) {
    logger.warn('[StreamingCallback] No conversationId provided for abort signal');
    return;
  }
  abortSignals.set(id, signal);
  logger.info('[StreamingCallback] Abort signal set', { conversationId: id });
}

/**
 * Check if streaming was aborted for a specific conversation
 */
export function isAborted(conversationId?: string): boolean {
  const id = conversationId || currentConversationId;
  if (!id) {
    return false;
  }
  const signal = abortSignals.get(id);
  return signal?.aborted || false;
}

/**
 * Clear all callbacks for a specific conversation
 */
export function clearConversationCallbacks(conversationId: string): void {
  streamingCallbacks.delete(conversationId);
  imageProgressCallbacks.delete(conversationId);
  abortSignals.delete(conversationId);
  graphConfigs.delete(conversationId);
  comfyUIConfigs.delete(conversationId);
  networkConfigs.delete(conversationId);
  imageGenConfigs.delete(conversationId);
  workingDirectories.delete(conversationId);
  if (currentConversationId === conversationId) {
    currentConversationId = null;
  }
}
