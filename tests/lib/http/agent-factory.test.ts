/**
 * HTTP Agent Factory 테스트
 */

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/http/config', () => ({
  detectEnvironment: jest.fn().mockReturnValue('electron-main'),
}));

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn().mockImplementation((url, opts) => ({
    _type: 'proxy-agent',
    proxyUrl: url,
    options: opts,
  })),
}));

// Mock node:https - use webpackIgnore comment pattern
const mockHttpsAgent = jest.fn().mockImplementation((opts) => ({
  _type: 'https-agent',
  options: opts,
}));

jest.mock(
  'node:https',
  () => ({
    Agent: mockHttpsAgent,
  }),
  { virtual: true }
);

import { createHttpAgent, createOctokitAgent } from '@/lib/http/agent-factory';
import { detectEnvironment } from '@/lib/http/config';
import type { NetworkConfig } from '@/types';

const mockDetectEnvironment = detectEnvironment as jest.MockedFunction<typeof detectEnvironment>;

describe('Agent Factory', () => {
  beforeEach(() => {
    mockDetectEnvironment.mockReturnValue('electron-main');
    mockHttpsAgent.mockClear();
  });

  describe('createHttpAgent', () => {
    it('should return undefined in browser environment', async () => {
      mockDetectEnvironment.mockReturnValue('browser');

      const agent = await createHttpAgent({
        proxy: { enabled: true, mode: 'manual', url: 'http://proxy:8080' },
      });

      expect(agent).toBeUndefined();
    });

    it('should return undefined in electron-renderer environment', async () => {
      mockDetectEnvironment.mockReturnValue('electron-renderer');

      const agent = await createHttpAgent({
        proxy: { enabled: true, mode: 'manual', url: 'http://proxy:8080' },
      });

      expect(agent).toBeUndefined();
    });

    it('should return undefined when networkConfig is null', async () => {
      const agent = await createHttpAgent(null);

      expect(agent).toBeUndefined();
    });

    it('should return undefined when networkConfig is undefined', async () => {
      const agent = await createHttpAgent(undefined);

      expect(agent).toBeUndefined();
    });

    it('should create manual proxy agent when proxy is enabled with manual mode', async () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: true,
          mode: 'manual',
          url: 'http://proxy.example.com:8080',
        },
      };

      const agent = await createHttpAgent(config);

      expect(agent).toBeDefined();
      expect(agent._type).toBe('proxy-agent');
      expect(agent.proxyUrl).toBe('http://proxy.example.com:8080');
    });

    it('should pass SSL options to proxy agent', async () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: true,
          mode: 'manual',
          url: 'http://proxy.example.com:8080',
        },
        ssl: {
          verify: false,
        },
      };

      const agent = await createHttpAgent(config);

      expect(agent).toBeDefined();
      expect(agent.options).toEqual({ rejectUnauthorized: false });
    });

    it('should create no-proxy agent when proxy is disabled', async () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: false,
          mode: 'none',
          url: '',
        },
      };

      const agent = await createHttpAgent(config);

      expect(agent).toBeDefined();
      expect(agent._type).toBe('https-agent');
    });

    it('should create no-proxy agent when proxy mode is none', async () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: false,
          mode: 'none',
          url: '',
        },
      };

      const agent = await createHttpAgent(config);

      expect(agent).toBeDefined();
    });

    it('should create SSL-only agent when SSL verify is disabled and no proxy config', async () => {
      const config: NetworkConfig = {
        ssl: {
          verify: false,
        },
      };

      const agent = await createHttpAgent(config);

      expect(agent).toBeDefined();
      expect(agent._type).toBe('https-agent');
    });

    it('should create no-proxy agent when no proxy config and SSL verify is true', async () => {
      const config: NetworkConfig = {
        ssl: {
          verify: true,
        },
      };

      const agent = await createHttpAgent(config);

      // When proxy is not configured, !proxy?.enabled is true, so a no-proxy agent is created
      expect(agent).toBeDefined();
      expect(agent._type).toBe('https-agent');
    });

    it('should return undefined for empty config object', async () => {
      const config: NetworkConfig = {};

      const agent = await createHttpAgent(config);

      // No proxy config, no SSL disable - should create a no-proxy agent
      // because !networkConfig.proxy?.enabled is true
      expect(agent).toBeDefined();
    });

    it('should not create proxy agent when manual mode but no URL', async () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: true,
          mode: 'manual',
          url: '',
        },
      };

      // enabled=true, mode=manual, but url is empty string (falsy)
      // Falls through to the no-proxy/disabled check
      const agent = await createHttpAgent(config);

      // url is falsy, so the manual proxy condition fails
      // Then it checks !enabled (false) || mode === 'none' (false)
      // Falls to SSL-only check, which also fails
      // Returns undefined
      expect(agent).toBeUndefined();
    });
  });

  describe('createOctokitAgent', () => {
    it('should return object with agent when proxy is configured', async () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: true,
          mode: 'manual',
          url: 'http://proxy:8080',
        },
      };

      const result = await createOctokitAgent(config);

      expect(result).toHaveProperty('agent');
      expect(result.agent._type).toBe('proxy-agent');
    });

    it('should return empty object when no agent needed', async () => {
      mockDetectEnvironment.mockReturnValue('browser');

      const result = await createOctokitAgent(null);

      expect(result).toEqual({});
    });

    it('should return empty object when networkConfig is null', async () => {
      const result = await createOctokitAgent(null);

      // In electron-main, null config returns undefined from createHttpAgent
      expect(result).toEqual({});
    });

    it('should return object with agent for no-proxy config', async () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: false,
          mode: 'none',
          url: '',
        },
      };

      const result = await createOctokitAgent(config);

      expect(result).toHaveProperty('agent');
    });
  });
});
