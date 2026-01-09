import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';

// Import and re-export common mock from shared file
import { mockElectronAPI } from './mocks/electronAPI';
export { mockElectronAPI };

// Polyfill TextEncoder/TextDecoder for JSDOM
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill ReadableStream for LangChain/LangGraph
(global as any).ReadableStream = ReadableStream;

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
export const mockSessionStorage = {
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

// Import test helpers
import { setupConsoleMock, setupMockReset } from './mocks/test-helpers';

// Setup console mock and mock reset
setupConsoleMock();
setupMockReset({ disableElectronMode, mockLocalStorage, mockSessionStorage });

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

// Mock nanoid to avoid ESM issues
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-nano-id-123456'),
}));

// Load translation file for i18n mock
const koTranslations = require('../locales/ko.json');

// Helper function to get nested translation with interpolation support
function getNestedTranslation(obj: any, path: string, params?: any): string {
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return path; // Return key if not found
    }
  }

  if (typeof result !== 'string') {
    return path;
  }

  // Handle interpolation (e.g., "{{count}}개" with {count: 2} => "2개")
  if (params) {
    return result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }

  return result;
}

// Mock react-i18next with actual Korean translations
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => getNestedTranslation(koTranslations, key, params),
    i18n: {
      changeLanguage: jest.fn(),
      language: 'ko',
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
  I18nextProvider: ({ children }: any) => children,
  Trans: ({ children }: any) => children,
}));
