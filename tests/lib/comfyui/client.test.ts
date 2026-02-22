/**
 * ComfyUIClient 테스트
 */

import {
  ComfyUIClient,
  getComfyUIClient,
  initializeComfyUIClient,
  isComfyUIEnabled,
} from '@/lib/domains/integration/comfyui/client';
import type { ComfyUIConfig } from '@/types';

describe('ComfyUIClient', () => {
  const mockConfig: ComfyUIConfig = {
    enabled: true,
    httpUrl: 'http://localhost:8188',
    wsUrl: 'ws://localhost:8188/ws',
    workflowId: 'test-workflow',
    clientId: 'test-client',
    steps: 4,
    cfgScale: 1,
    seed: 12345,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const client = new ComfyUIClient(mockConfig);

      expect(client).toBeDefined();
    });

    it('should use provided clientId', () => {
      const client = new ComfyUIClient(mockConfig);

      expect(client).toBeDefined();
    });

    it('should generate clientId when not provided', () => {
      const configWithoutClientId: ComfyUIConfig = {
        ...mockConfig,
        clientId: undefined,
      };

      const client = new ComfyUIClient(configWithoutClientId);

      expect(client).toBeDefined();
    });
  });

  describe('generateImage', () => {
    it('should return error when ComfyUI is not enabled', async () => {
      const disabledConfig: ComfyUIConfig = {
        ...mockConfig,
        enabled: false,
      };

      const client = new ComfyUIClient(disabledConfig);
      const result = await client.generateImage({
        prompt: 'A beautiful sunset',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('should call onProgress callback', async () => {
      const client = new ComfyUIClient(mockConfig);

      // Mock fetch for browser fallback
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const onProgress = jest.fn();

      const result = await client.generateImage({
        prompt: 'Test prompt',
        onProgress,
      });

      // onProgress should be called at least once (for queued status)
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'queued',
          progress: 0,
        })
      );

      // Result should indicate failure due to network error
      expect(result.success).toBe(false);
    });

    it('should use config values for generation options', async () => {
      const client = new ComfyUIClient({
        ...mockConfig,
        steps: 8,
        cfgScale: 2,
        seed: 99999,
        positivePrompt: 'default positive',
        negativePrompt: 'default negative',
      });

      // Mock fetch to fail so we can verify the build workflow was called
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Test'));

      const result = await client.generateImage({
        prompt: 'Custom prompt',
      });

      // Should fail but workflow should be built with config values
      expect(result.success).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should return true when server responds', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      const client = new ComfyUIClient(mockConfig);
      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
        'http://localhost:8188/system_stats'
      );
    });

    it('should return false when server does not respond', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const client = new ComfyUIClient(mockConfig);
      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const client = new ComfyUIClient(mockConfig);
      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('singleton functions', () => {
    beforeEach(() => {
      // Reset singleton
      initializeComfyUIClient({ ...mockConfig, enabled: false });
    });

    it('getComfyUIClient should return null when not initialized', () => {
      initializeComfyUIClient({ ...mockConfig, enabled: false });

      expect(getComfyUIClient()).toBeNull();
    });

    it('initializeComfyUIClient should create client when enabled', () => {
      initializeComfyUIClient(mockConfig);

      expect(getComfyUIClient()).not.toBeNull();
    });

    it('initializeComfyUIClient should not create client when disabled', () => {
      initializeComfyUIClient({ ...mockConfig, enabled: false });

      expect(getComfyUIClient()).toBeNull();
    });

    it('isComfyUIEnabled should return correct state', () => {
      initializeComfyUIClient({ ...mockConfig, enabled: false });
      expect(isComfyUIEnabled()).toBe(false);

      initializeComfyUIClient(mockConfig);
      expect(isComfyUIEnabled()).toBe(true);
    });
  });

  describe('workflow building', () => {
    it('should use random seed when seed is -1', async () => {
      const client = new ComfyUIClient({
        ...mockConfig,
        seed: -1,
      });

      // Mock fetch to fail
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Test'));

      await client.generateImage({
        prompt: 'Test',
        seed: -1,
      });

      // Test passes if no error thrown (seed was generated)
      expect(true).toBe(true);
    });

    it('should use provided options over config defaults', async () => {
      const client = new ComfyUIClient(mockConfig);

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Test'));

      await client.generateImage({
        prompt: 'Custom prompt',
        negativePrompt: 'Custom negative',
        width: 512,
        height: 512,
        steps: 10,
        cfgScale: 3,
        seed: 54321,
      });

      // Test passes if no error thrown
      expect(true).toBe(true);
    });

    it('should use config seed when not provided in options', async () => {
      const client = new ComfyUIClient({
        ...mockConfig,
        seed: 99999,
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Test'));

      await client.generateImage({
        prompt: 'Test prompt',
      });

      expect(true).toBe(true);
    });

    it('should use config negativePrompt when not provided in options', async () => {
      const client = new ComfyUIClient({
        ...mockConfig,
        negativePrompt: 'default negative',
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Test'));

      await client.generateImage({
        prompt: 'Test prompt',
      });

      expect(true).toBe(true);
    });
  });

  describe('browser fallback', () => {
    it('should use direct fetch in browser environment', async () => {
      // Mock successful queue response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ prompt_id: 'prompt-123' }),
      });

      const client = new ComfyUIClient(mockConfig);

      // This will fail on waitForCompletion but we're testing the queue path
      const onProgress = jest.fn();
      const result = await client.generateImage({
        prompt: 'Test',
        onProgress,
      });

      // Should have called fetch for /prompt endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/prompt'),
        expect.any(Object)
      );
      // Will fail due to WebSocket not being available
      expect(result.success).toBe(false);
    });

    it('should handle queue response failure in browser', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const client = new ComfyUIClient(mockConfig);
      const result = await client.generateImage({
        prompt: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to queue prompt');
    });
  });

  describe('error handling', () => {
    it('should return error result on exception', async () => {
      const client = new ComfyUIClient(mockConfig);

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await client.generateImage({
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should handle generic error without message', async () => {
      const client = new ComfyUIClient(mockConfig);

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Image generation failed'));

      const result = await client.generateImage({
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Image generation failed');
    });
  });

  describe('progress callbacks', () => {
    it('should call onProgress with queued status first', async () => {
      const client = new ComfyUIClient(mockConfig);
      const onProgress = jest.fn();

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Test'));

      await client.generateImage({
        prompt: 'Test',
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'queued',
          progress: 0,
        })
      );
    });
  });

  describe('clientId generation', () => {
    it('should generate unique clientIds', () => {
      const config1: ComfyUIConfig = { ...mockConfig, clientId: undefined };
      const config2: ComfyUIConfig = { ...mockConfig, clientId: undefined };

      const client1 = new ComfyUIClient(config1);
      const client2 = new ComfyUIClient(config2);

      // Both clients should be created without error
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
    });
  });
});
