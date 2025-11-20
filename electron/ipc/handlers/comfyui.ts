/**
 * ComfyUI IPC Handlers
 * Main Process에서 ComfyUI API 호출 (CORS 없음, Network Config 지원)
 */

import { ipcMain } from 'electron';
import { NetworkConfig } from '../../../types';
import { logger } from '../../services/logger';

/**
 * ComfyUI 연결 테스트
 */
export function setupComfyUIHandlers() {
  ipcMain.handle(
    'comfyui-test-connection',
    async (
      _event,
      httpUrl: string,
      apiKey: string | undefined,
      networkConfig: NetworkConfig | null
    ) => {
      try {
        const normalizedUrl = httpUrl.replace(/\/$/, '');
        const headers: Record<string, string> = {};

        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        // Network Config의 custom headers 추가
        if (networkConfig?.customHeaders) {
          Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
            headers[key] = value;
          });
        }

        const response = await fetch(`${normalizedUrl}/system_stats`, {
          headers,
        });

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[ComfyUI IPC] Test connection error:', error);
        return {
          success: false,
          error: error.message || 'Connection test failed',
        };
      }
    }
  );

  /**
   * ComfyUI 프롬프트 큐에 추가
   */
  ipcMain.handle(
    'comfyui-queue-prompt',
    async (
      _event,
      httpUrl: string,
      workflow: Record<string, any>,
      clientId: string,
      apiKey: string | undefined,
      networkConfig: NetworkConfig | null
    ) => {
      try {
        const normalizedUrl = httpUrl.replace(/\/$/, '');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        // Network Config의 custom headers 추가
        if (networkConfig?.customHeaders) {
          Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
            headers[key] = value;
          });
        }

        const response = await fetch(`${normalizedUrl}/prompt`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: workflow,
            client_id: clientId,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to queue prompt: ${response.status} ${errorText}`);
        }

        const result = await response.json();

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('[ComfyUI IPC] Queue prompt error:', error);
        return {
          success: false,
          error: error.message || 'Failed to queue prompt',
        };
      }
    }
  );

  /**
   * ComfyUI 이미지 가져오기
   */
  ipcMain.handle(
    'comfyui-fetch-image',
    async (
      _event,
      httpUrl: string,
      filename: string,
      subfolder: string,
      type: string,
      apiKey: string | undefined,
      networkConfig: NetworkConfig | null
    ) => {
      try {
        const normalizedUrl = httpUrl.replace(/\/$/, '');
        const headers: Record<string, string> = {};

        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        // Network Config의 custom headers 추가
        if (networkConfig?.customHeaders) {
          Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
            headers[key] = value;
          });
        }

        const imageUrl = `${normalizedUrl}/view?filename=${filename}&subfolder=${subfolder || ''}&type=${type || 'output'}`;

        const response = await fetch(imageUrl, { headers });

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/png';

        return {
          success: true,
          data: `data:${mimeType};base64,${base64}`,
        };
      } catch (error: any) {
        logger.error('[ComfyUI IPC] Fetch image error:', error);
        return {
          success: false,
          error: error.message || 'Failed to fetch image',
        };
      }
    }
  );

  logger.info('ComfyUI IPC handlers registered');
}
