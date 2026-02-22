/**
 * NanoBanana IPC Handlers
 * Main Process에서 NanoBanana/Vertex AI 연결 테스트 수행 (CORS 없음)
 */

import { ipcMain } from 'electron';
import { NanoBananaConfig, NetworkConfig } from '@/types';
import { logger } from '../../../services/logger';
import { testNanoBananaConnection } from '@/lib/domains/integration/imagegen/nanobanana-client';

/**
 * NanoBanana 연결 테스트
 */
export function setupNanoBananaHandlers() {
  ipcMain.handle(
    'nanobanana-test-connection',
    async (_event, config: NanoBananaConfig, networkConfig: NetworkConfig | null) => {
      try {
        const result = await testNanoBananaConnection(config, networkConfig);
        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Connection test failed',
          };
        }

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[NanoBanana IPC] Test connection error:', error);
        return {
          success: false,
          error: error.message || 'Connection test failed',
        };
      }
    }
  );

  logger.info('NanoBanana IPC handlers registered');
}
