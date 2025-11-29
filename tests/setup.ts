import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';

// Polyfill TextEncoder/TextDecoder for JSDOM
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill ReadableStream for LangChain/LangGraph
(global as any).ReadableStream = ReadableStream;

// Mock window.electronAPI
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
    selectDirectory: jest.fn(),
    read: jest.fn(),
  },
  fs: {
    readDirectory: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    createFile: jest.fn(),
    createDirectory: jest.fn(),
    delete: jest.fn(),
    rename: jest.fn(),
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
  browserView: {
    create: jest.fn(() => Promise.resolve()),
    loadURL: jest.fn(),
    goBack: jest.fn(),
    goForward: jest.fn(),
    reload: jest.fn(),
    setBounds: jest.fn(),
    setVisible: jest.fn(),
    destroy: jest.fn(),
    hideAll: jest.fn(() => Promise.resolve()),
    showActive: jest.fn(() => Promise.resolve()),
    onDidNavigate: jest.fn(() => jest.fn()),
    onLoadingState: jest.fn(() => jest.fn()),
    removeListener: jest.fn(),
    getBookmarks: jest.fn(),
    getBookmarkFolders: jest.fn(),
    addBookmarkFolder: jest.fn(),
    deleteBookmarkFolder: jest.fn(),
    deleteBookmark: jest.fn(),
    capturePage: jest.fn(),
    getSnapshots: jest.fn(),
    deleteSnapshot: jest.fn(),
    openSnapshot: jest.fn(),
  },
  on: jest.fn(),
  removeListener: jest.fn(),
};

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

// Mock sessionStorage
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

// Setup global mocks - modify existing window object instead of redefining
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
  configurable: true,
});

// Set electronAPI as undefined by default (web mode)
(window as any).electronAPI = undefined;

// Helper to enable Electron mode in tests
export function enableElectronMode() {
  (window as any).electronAPI = mockElectronAPI;
}

// Helper to disable Electron mode (web mode)
export function disableElectronMode() {
  (window as any).electronAPI = undefined;
}

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
});

// Mock fetch globally
global.fetch = jest.fn();

// Mock crypto for UUID generation
Object.defineProperty(window, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '12345678-1234-4567-8901-123456789012'),
    getRandomValues: jest.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
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
  },
  writable: true,
  configurable: true,
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
};

// Export localStorage mock for direct access
export { mockLocalStorage, mockSessionStorage };
