/**
 * Backend (Node.js environment) test setup
 * For lib/, electron/ tests that run in Node.js environment
 */

import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';

// Import and re-export common mock from shared file
import { mockElectronAPI } from './mocks/electronAPI';
export { mockElectronAPI };

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

// Import test helpers
import { setupConsoleMock, setupMockReset } from './mocks/test-helpers';

// Setup console mock and mock reset
setupConsoleMock();
setupMockReset({ disableElectronMode, mockLocalStorage });
