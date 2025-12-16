/**
 * Browser stub for lib/http module
 *
 * This file is used as a replacement for lib/http in client-side builds
 * to prevent webpack from trying to bundle Node.js-only modules.
 *
 * In Electron renderer process, the actual lib/http module will be available
 * at runtime through Electron's Node.js integration.
 */

// Types - re-export from types module
export type {
  HttpRequestOptions,
  WebSocketOptions,
  SSEOptions,
  NodeHttpOptions,
  NodeHttpResponse,
  HttpClientConfig,
  Environment,
} from './types';

export type { HttpAgentType } from './agent-factory';
export type { WebSocketType } from './websocket';
export type { EventSourceType } from './sse';

// Constants
export const VISION_TIMEOUT = 300000;

// Config stubs
export const getNetworkConfig = async () => null;
export const setNetworkConfig = () => {};
export const clearNetworkConfigCache = () => {};
export const detectEnvironment = () => 'browser' as const;
export const isElectron = () => false;
export const createDefaultNetworkConfig = () => ({
  proxy: { enabled: false, mode: 'none' as const },
  ssl: { verify: true },
});

// Agent Factory stubs
export const createHttpAgent = async () => undefined;
export const createOctokitAgent = async () => ({});

// Fetch stubs
export const httpFetch = async () => {
  throw new Error('httpFetch is only available in Node.js/Electron context');
};

export const httpFetchJson = async () => {
  throw new Error('httpFetchJson is only available in Node.js/Electron context');
};

export const httpPost = async () => {
  throw new Error('httpPost is only available in Node.js/Electron context');
};

export const httpPostJson = async () => {
  throw new Error('httpPostJson is only available in Node.js/Electron context');
};

export const httpFetchStream = async () => {
  throw new Error('httpFetchStream is only available in Node.js/Electron context');
};

export const fetchWithNetworkConfig = async () => {
  throw new Error('fetchWithNetworkConfig is only available in Node.js/Electron context');
};

// WebSocket stubs
export const createWebSocket = async () => {
  throw new Error('createWebSocket is only available in Node.js/Electron context');
};

export const wsToHttpUrl = () => '';
export const httpToWsUrl = () => '';

// SSE stubs
export const createEventSource = async () => {
  throw new Error('createEventSource is only available in Node.js/Electron context');
};

export const connectSSE = async () => {
  throw new Error('connectSSE is only available in Node.js/Electron context');
};

// Node.js HTTP stubs
export const httpsRequest = async () => {
  throw new Error('httpsRequest is only available in Node.js/Electron context');
};

export const httpsGet = async () => {
  throw new Error('httpsGet is only available in Node.js/Electron context');
};

export const httpsPost = async () => {
  throw new Error('httpsPost is only available in Node.js/Electron context');
};

export const httpsGetJson = async () => {
  throw new Error('httpsGetJson is only available in Node.js/Electron context');
};

export const downloadImage = async () => {
  throw new Error('downloadImage is only available in Node.js/Electron context');
};
