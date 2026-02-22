/**
 * Extension Runtime Context
 *
 * Store slice 생성 시 주입되는 런타임 컨텍스트
 */

import type {
  ExtensionRuntimeContext,
  IPCBridge,
  Logger,
  LLMProvider,
  AgentBuilder,
} from '../types/extension';
import { createIPCBridge } from '../ipc/bridge';
import { createLogger } from '../utils/logger';
import { isElectron, isMac, isWindows, isLinux } from '../utils/platform';

/**
 * Create Extension Runtime Context
 *
 * @param options Configuration options
 * @returns ExtensionRuntimeContext instance
 */
export function createExtensionContext(options?: {
  extensionId?: string;
  ipc?: IPCBridge;
  logger?: Logger;
  llm?: LLMProvider;
  agent?: AgentBuilder;
}): ExtensionRuntimeContext {
  const extensionId = options?.extensionId || 'unknown';

  return {
    ipc: options?.ipc || createIPCBridge(),
    logger: options?.logger || createLogger(extensionId),
    platform: {
      isElectron,
      isMac,
      isWindows,
      isLinux,
    },
    llm: options?.llm,
    agent: options?.agent,
  };
}

/**
 * Create mock context for testing
 */
export function createMockContext(
  overrides?: Partial<ExtensionRuntimeContext>
): ExtensionRuntimeContext {
  const mockLogger: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  return {
    ipc: createIPCBridge(true), // Use mock IPC bridge
    logger: mockLogger,
    platform: {
      isElectron: () => false,
      isMac: () => false,
      isWindows: () => false,
      isLinux: () => false,
    },
    ...overrides,
  };
}
