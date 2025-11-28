/**
 * Conversation-specific streaming callbacks for LLM responses
 * Supports multiple concurrent conversations with isolated streaming
 */

import type { GraphConfig } from '@/lib/langgraph/types';
import type { ComfyUIConfig, NetworkConfig } from '@/types';

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

// Current ComfyUI config (for image generation in Main Process)
let currentComfyUIConfig: ComfyUIConfig | null = null;
let currentNetworkConfig: NetworkConfig | null = null;

// Current working directory (for Coding Agent file operations)
let currentWorkingDirectory: string | null = null;

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
export function setCurrentGraphConfig(config: GraphConfig | null): void {
  currentGraphConfig = config;
}

/**
 * Get the current graph config
 */
export function getCurrentGraphConfig(): GraphConfig | null {
  return currentGraphConfig;
}

/**
 * Set the current ComfyUI config for image generation
 */
export function setCurrentComfyUIConfig(config: ComfyUIConfig | null): void {
  currentComfyUIConfig = config;
}

/**
 * Get the current ComfyUI config
 */
export function getCurrentComfyUIConfig(): ComfyUIConfig | null {
  return currentComfyUIConfig;
}

/**
 * Set the current network config
 */
export function setCurrentNetworkConfig(config: NetworkConfig | null): void {
  currentNetworkConfig = config;
}

/**
 * Get the current network config
 */
export function getCurrentNetworkConfig(): NetworkConfig | null {
  return currentNetworkConfig;
}

/**
 * Set the current working directory for Coding Agent
 */
export function setCurrentWorkingDirectory(directory: string | null): void {
  currentWorkingDirectory = directory;
}

/**
 * Get the current working directory
 */
export function getCurrentWorkingDirectory(): string | null {
  return currentWorkingDirectory;
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
    console.warn('[StreamingCallback] No conversationId provided');
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
  if (!id) return null;
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
    console.warn('[StreamingCallback] No conversationId for chunk emission');
    return false;
  }

  // Check if streaming was aborted
  const signal = abortSignals.get(id);
  if (signal?.aborted) {
    console.log(`[StreamingCallback] Streaming aborted for ${id}, throwing error`);
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
    console.warn('[StreamingCallback] No conversationId provided for image progress');
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
  if (!id) return false;

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
    console.warn('[StreamingCallback] No conversationId provided for abort signal');
    return;
  }
  abortSignals.set(id, signal);
  console.log(`[StreamingCallback] Abort signal set for ${id}`);
}

/**
 * Check if streaming was aborted for a specific conversation
 */
export function isAborted(conversationId?: string): boolean {
  const id = conversationId || currentConversationId;
  if (!id) return false;
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
  if (currentConversationId === conversationId) {
    currentConversationId = null;
  }
}
