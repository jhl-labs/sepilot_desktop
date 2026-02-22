export { createExtensionContext, createMockContext } from './context';
export type { ExtensionRuntimeContext } from '../types/extension';

// Extension API Context
export {
  ExtensionAPIContextProvider,
  useExtensionAPIContext,
  type ExtensionAPIContextProviderProps,
} from './api-context';
