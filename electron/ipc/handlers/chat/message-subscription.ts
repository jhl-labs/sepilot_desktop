/**
 * 메시지 구독 IPC 핸들러
 *
 * Frontend와 메시지 구독 시스템 간의 통신을 담당합니다.
 */

import { MessageSubscriptionService } from '../../../services/message-subscription';
import { MessageQueueService } from '../../../services/message-queue';
import { MessageProcessorService } from '../../../services/message-processor';
import { databaseService } from '../../../services/database';
import { logger } from '../../../services/logger';
import { registerHandlers, removeHandlerIfExists } from '@/electron/ipc/utils';
import type { MessageSubscriptionConfig } from '@/types/message-subscription';

function normalizePollingInterval(config: MessageSubscriptionConfig): MessageSubscriptionConfig {
  const { notificationType: _legacyNotificationType, ...effectiveConfig } = config;
  const rawInterval = Number(effectiveConfig.pollingInterval);
  let pollingInterval = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 60000;
  if (pollingInterval < 1000) {
    pollingInterval *= 1000;
  }

  return {
    ...effectiveConfig,
    pollingInterval: Math.max(1000, Math.round(pollingInterval)),
  };
}

export function setupMessageSubscriptionHandlers() {
  // 싱글톤 인스턴스 가져오기
  const subscriptionService = MessageSubscriptionService.getInstance();
  const queueService = MessageQueueService.getInstance();
  const processorService = MessageProcessorService.getInstance();

  // 기존 핸들러 제거 (핫 리로드용)
  const channels = [
    'message-subscription:start',
    'message-subscription:stop',
    'message-subscription:refresh',
    'message-subscription:get-status',
    'message-subscription:get-config',
    'message-subscription:save-config',
    'message-subscription:get-queue-status',
    'message-subscription:get-failed-messages',
    'message-subscription:get-pending-messages',
    'message-subscription:get-completed-messages',
    'message-subscription:reprocess-message',
    'message-subscription:delete-message',
    'message-subscription:cleanup-queue',
  ];
  channels.forEach(removeHandlerIfExists);

  registerHandlers([
    // ===== 구독 관리 =====

    {
      channel: 'message-subscription:start',
      handler: async () => {
        const config = databaseService.getMessageSubscriptionConfig();
        if (!config) {
          throw new Error('구독 설정이 없습니다');
        }

        await subscriptionService.start(config);
        await processorService.start(config);

        logger.info('[IPC] 메시지 구독 시작');
      },
    },

    {
      channel: 'message-subscription:stop',
      handler: () => {
        subscriptionService.stop();
        processorService.stop();
        logger.info('[IPC] 메시지 구독 중지');
      },
    },

    {
      channel: 'message-subscription:refresh',
      handler: async () => {
        const result = await subscriptionService.refresh();
        logger.info(`[IPC] 수동 새로고침: ${result.count}개의 새 메시지`);
        return result;
      },
    },

    {
      channel: 'message-subscription:get-status',
      handler: () => subscriptionService.getStatus(),
    },

    // ===== 설정 관리 =====

    {
      channel: 'message-subscription:get-config',
      handler: () => databaseService.getMessageSubscriptionConfig(),
    },

    {
      channel: 'message-subscription:save-config',
      handler: async (config: MessageSubscriptionConfig) => {
        const normalizedConfig = normalizePollingInterval(config);

        databaseService.saveMessageSubscriptionConfig(normalizedConfig);
        await subscriptionService.updateConfig(normalizedConfig);
        await processorService.updateConfig(normalizedConfig);

        logger.info('[IPC] 설정 저장 완료');
        return normalizedConfig;
      },
    },

    // ===== 큐 관리 =====

    {
      channel: 'message-subscription:get-queue-status',
      handler: async () => queueService.getStatus(),
    },

    {
      channel: 'message-subscription:get-failed-messages',
      handler: async () => queueService.getFailedMessages(),
    },

    {
      channel: 'message-subscription:get-pending-messages',
      handler: async () => queueService.getPendingMessages(),
    },

    {
      channel: 'message-subscription:get-completed-messages',
      handler: async () => queueService.getCompletedMessages(),
    },

    {
      channel: 'message-subscription:reprocess-message',
      handler: async (hash: string) => {
        await queueService.reprocess(hash);
        logger.info(`[IPC] 메시지 재처리: ${hash.substring(0, 8)}...`);
      },
    },

    {
      channel: 'message-subscription:delete-message',
      handler: async (hash: string) => {
        await queueService.deleteMessage(hash);
        logger.info(`[IPC] 메시지 삭제: ${hash.substring(0, 8)}...`);
      },
    },

    {
      channel: 'message-subscription:cleanup-queue',
      handler: async () => {
        const config = databaseService.getMessageSubscriptionConfig();
        const retentionDays = config?.retentionDays || 7;
        const deletedCount = await queueService.cleanup(retentionDays);
        logger.info(`[IPC] 큐 정리 완료: ${deletedCount}개 삭제`);
        return { deletedCount };
      },
    },
  ]);

  logger.info('[IPC] 메시지 구독 핸들러 등록 완료');
}
