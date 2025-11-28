/**
 * Activity IPC Handlers
 * 도구 실행 이력 관리를 위한 IPC 핸들러
 *
 * Activities는 메시지와 분리하여 관리됩니다:
 * - 컨텍스트 낭비 방지: conversation에 포함되지 않음
 * - 영구 저장: 데이터베이스에 기록
 * - UI 표시: ChatArea의 별도 패널에서 표시
 */

import { databaseService } from '../../services/database';
import { logger } from '../../services/logger';
import { Activity } from '../../../types';
import { registerHandlers, removeHandlerIfExists } from '../utils';

export function setupActivityHandlers() {
  // Remove existing handlers (for hot reload)
  const channels = [
    'save-activity',
    'load-activities',
    'delete-activity',
    'delete-activities-by-conversation',
  ];
  channels.forEach(removeHandlerIfExists);

  registerHandlers([
    {
      channel: 'save-activity',
      handler: (activity: Activity) => {
        logger.debug('Saving activity', {
          id: activity.id,
          tool_name: activity.tool_name,
          status: activity.status,
        });
        databaseService.saveActivity(activity);
      },
    },
    {
      channel: 'load-activities',
      handler: (conversationId: string) => {
        const activities = databaseService.getActivities(conversationId);
        logger.debug('Loaded activities', {
          conversationId,
          count: activities.length,
        });
        return activities;
      },
    },
    {
      channel: 'delete-activity',
      handler: (id: string) => {
        logger.debug('Deleting activity', { id });
        databaseService.deleteActivity(id);
      },
    },
    {
      channel: 'delete-activities-by-conversation',
      handler: (conversationId: string) => {
        logger.debug('Deleting all activities for conversation', { conversationId });
        databaseService.deleteActivitiesByConversation(conversationId);
      },
    },
  ]);

  logger.info('Activity IPC handlers registered');
}
