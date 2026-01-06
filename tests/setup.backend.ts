/**
 * Backend (Node.js environment) test setup
 * For lib/, electron/ tests that run in Node.js environment
 */

import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';

// Polyfill TextEncoder/TextDecoder for Node.js
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill ReadableStream for LangChain/LangGraph
(global as any).ReadableStream = ReadableStream;

// Mock fetch globally
global.fetch = jest.fn();

// Mock nanoid
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-nanoid-id'),
}));

// Mock crypto for UUID generation (Node.js environment)
const crypto = require('crypto');
(global as any).crypto = {
  randomUUID: jest.fn(() => '12345678-1234-4567-8901-123456789012'),
  getRandomValues: (arr: Uint8Array) => {
    const bytes = crypto.randomBytes(arr.length);
    arr.set(bytes);
    return arr;
  },
  subtle: {
    digest: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    importKey: jest.fn(),
    exportKey: jest.fn(),
    generateKey: jest.fn(),
    deriveBits: jest.fn(),
    deriveKey: jest.fn(),
  },
};

// Mock window.electronAPI for backend tests that use it
export const mockElectronAPI = {
  platform: 'darwin',
  chat: {
    saveConversation: jest.fn(),
    loadConversations: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    saveMessage: jest.fn(),
    loadMessages: jest.fn(),
    deleteMessage: jest.fn(),
  },
  config: {
    load: jest.fn(),
    save: jest.fn(),
    updateSetting: jest.fn(),
    getSetting: jest.fn(),
  },
  mcp: {
    addServer: jest.fn(),
    removeServer: jest.fn(),
    listServers: jest.fn(),
    getAllTools: jest.fn(),
    callTool: jest.fn(),
    toggleServer: jest.fn(),
  },
  auth: {
    initiateLogin: jest.fn(),
    githubLogin: jest.fn(),
    exchangeCode: jest.fn(),
    saveToken: jest.fn(),
    getUserInfo: jest.fn(),
    getToken: jest.fn(),
    logout: jest.fn(),
    syncFromGitHub: jest.fn(),
    syncToGitHub: jest.fn(),
    onAuthSuccess: jest.fn(),
    removeAuthSuccessListener: jest.fn(),
    onOAuthCallback: jest.fn(),
    removeOAuthCallbackListener: jest.fn(),
  },
  llm: {
    streamChat: jest.fn(),
    chat: jest.fn(),
    init: jest.fn(),
    validate: jest.fn(),
    fetchModels: jest.fn(),
    generateTitle: jest.fn(),
    onStreamChunk: jest.fn(),
    onStreamDone: jest.fn(),
    onStreamError: jest.fn(),
    removeStreamListener: jest.fn(),
  },
  vectorDB: {
    initialize: jest.fn(),
    createIndex: jest.fn(),
    deleteIndex: jest.fn(),
    indexExists: jest.fn(),
    insert: jest.fn(),
    search: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    getAll: jest.fn(),
  },
  file: {
    selectImages: jest.fn(),
    loadImage: jest.fn(),
  },
  github: {
    setPrivateKey: jest.fn(),
    hasPrivateKey: jest.fn(),
    getRepositories: jest.fn(),
    syncFromGitHub: jest.fn(),
    syncToGitHub: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
  embeddings: {
    generate: jest.fn(),
    generateBatch: jest.fn(),
    validate: jest.fn(),
  },
  comfyui: {
    testConnection: jest.fn(),
    queuePrompt: jest.fn(),
    fetchImage: jest.fn(),
  },
  on: jest.fn(),
  removeListener: jest.fn(),
};

// Mock localStorage for backend tests
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

// Mock sessionStorage for backend tests
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

// Make localStorage and sessionStorage available globally for backend tests
(global as any).localStorage = mockLocalStorage;
(global as any).sessionStorage = mockSessionStorage;

// Minimal window mock for backend tests that need it
const eventListeners: Record<string, Array<(...args: any[]) => void>> = {};

(global as any).window = {
  electronAPI: undefined,
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  addEventListener: jest.fn((event: string, handler: (...args: any[]) => void) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(handler);
  }),
  removeEventListener: jest.fn((event: string, handler: (...args: any[]) => void) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
    }
  }),
  dispatchEvent: jest.fn((event: Event) => {
    const handlers = eventListeners[event.type] || [];
    handlers.forEach((handler) => handler(event));
    return true;
  }),
  location: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
    reload: jest.fn(),
    replace: jest.fn(),
    assign: jest.fn(),
  },
  document: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  },
  crypto: (global as any).crypto,
};

// Helper functions for tests
export function enableElectronMode() {
  (global as any).window.electronAPI = mockElectronAPI;
}

export function disableElectronMode() {
  (global as any).window.electronAPI = undefined;
}

// Export mocks for direct access
export { mockLocalStorage, mockSessionStorage };

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  disableElectronMode();
  mockLocalStorage.getItem.mockReset();
  mockLocalStorage.setItem.mockReset();
  mockLocalStorage.removeItem.mockReset();
  mockLocalStorage.clear.mockReset();
  // Reset crypto.randomUUID mock
  if ((global as any).crypto && (global as any).crypto.randomUUID) {
    ((global as any).crypto.randomUUID as jest.Mock).mockReturnValue(
      '12345678-1234-4567-8901-123456789012'
    );
  }
});
