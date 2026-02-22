import { ipcMain } from 'electron';
import { SchedulerService } from '../../../services/scheduler';
import { databaseService } from '../../../services/database';
import { logger } from '../../../services/logger';
import type { ScheduledTask, ExecutionHistoryQuery } from '@/types/scheduler';

export function setupSchedulerHandlers() {
  const schedulerService = SchedulerService.getInstance();

  // 작업 생성
  ipcMain.handle('scheduler-create-task', async (_event, task: ScheduledTask) => {
    try {
      logger.info('[SchedulerIPC] Creating task:', task.name);

      // DB에 저장 (등록 실패 시 롤백할 수 있도록 기존 상태 보관)
      const previousTask = databaseService.getScheduledTask(task.id);
      databaseService.saveScheduledTask(task);

      try {
        // Cron 등록 (활성화된 경우)
        if (task.enabled) {
          await schedulerService.registerTask(task);
        }
      } catch (error) {
        // 등록 실패 시 DB/Cron 상태 롤백
        schedulerService.unregisterTask(task.id);
        if (previousTask) {
          databaseService.saveScheduledTask(previousTask);
          if (previousTask.enabled) {
            try {
              await schedulerService.registerTask(previousTask);
            } catch (rollbackError) {
              logger.error(
                '[SchedulerIPC] Failed to restore previous task after create rollback:',
                {
                  taskId: task.id,
                  rollbackError,
                }
              );
            }
          }
        } else {
          databaseService.deleteScheduledTask(task.id);
        }
        throw error;
      }

      const normalizedTask = databaseService.getScheduledTask(task.id);
      return { success: true, data: normalizedTask || task };
    } catch (error: any) {
      logger.error('[SchedulerIPC] Failed to create task:', error);
      return { success: false, error: error.message };
    }
  });

  // 작업 수정
  ipcMain.handle(
    'scheduler-update-task',
    async (
      _event,
      taskIdOrPayload: string | { taskId: string; updates: Partial<ScheduledTask> },
      updatesArg?: Partial<ScheduledTask>
    ) => {
      try {
        // Backward compatibility:
        // 1) (taskId, updates)
        // 2) ({ taskId, updates })
        const taskId =
          typeof taskIdOrPayload === 'string' ? taskIdOrPayload : taskIdOrPayload?.taskId;
        const updates = typeof taskIdOrPayload === 'string' ? updatesArg : taskIdOrPayload?.updates;

        if (!taskId) {
          throw new Error('Task ID is required');
        }
        if (!updates || typeof updates !== 'object') {
          throw new Error('Task updates are required');
        }

        logger.info('[SchedulerIPC] Updating task:', taskId);

        const previousTask = databaseService.getScheduledTask(taskId);
        if (!previousTask) {
          throw new Error(`Task not found: ${taskId}`);
        }

        // DB 업데이트
        databaseService.updateScheduledTask(taskId, updates);

        // 업데이트된 작업 로드
        const updatedTask = databaseService.getScheduledTask(taskId);
        if (!updatedTask) {
          throw new Error(`Task not found: ${taskId}`);
        }

        // Cron 재등록 (실패 시 이전 상태 롤백)
        schedulerService.unregisterTask(taskId);
        try {
          if (updatedTask.enabled) {
            await schedulerService.registerTask(updatedTask);
          } else {
            // 비활성화 상태에서는 다음 실행 시각 표시를 제거
            databaseService.updateScheduledTask(taskId, { nextExecutionAt: undefined });
          }
        } catch (error) {
          databaseService.saveScheduledTask(previousTask);
          schedulerService.unregisterTask(taskId);
          if (previousTask.enabled) {
            try {
              await schedulerService.registerTask(previousTask);
            } catch (rollbackError) {
              logger.error(
                '[SchedulerIPC] Failed to restore previous task after update rollback:',
                {
                  taskId,
                  rollbackError,
                }
              );
            }
          }
          throw error;
        }

        const normalizedTask = databaseService.getScheduledTask(taskId);
        return { success: true, data: normalizedTask || updatedTask };
      } catch (error: any) {
        logger.error('[SchedulerIPC] Failed to update task:', error);
        return { success: false, error: error.message };
      }
    }
  );

  // 작업 삭제
  ipcMain.handle('scheduler-delete-task', async (_event, taskId: string) => {
    try {
      logger.info('[SchedulerIPC] Deleting task:', taskId);

      // Cron 해제
      schedulerService.unregisterTask(taskId);

      // DB에서 삭제
      databaseService.deleteScheduledTask(taskId);

      return { success: true };
    } catch (error: any) {
      logger.error('[SchedulerIPC] Failed to delete task:', error);
      return { success: false, error: error.message };
    }
  });

  // 작업 목록 로드
  ipcMain.handle('scheduler-load-tasks', async () => {
    try {
      logger.info('[SchedulerIPC] Loading tasks');

      const tasks = databaseService.getAllScheduledTasks();

      return { success: true, data: tasks };
    } catch (error: any) {
      logger.error('[SchedulerIPC] Failed to load tasks:', error);
      return { success: false, error: error.message };
    }
  });

  // 실행 히스토리 조회
  ipcMain.handle(
    'scheduler-get-history',
    async (
      _event,
      payloadOrTaskId?: { taskId?: string; filters?: ExecutionHistoryQuery } | string,
      legacyLimit = 50
    ) => {
      try {
        const taskId =
          typeof payloadOrTaskId === 'string' ? payloadOrTaskId : payloadOrTaskId?.taskId;
        const filters =
          typeof payloadOrTaskId === 'string'
            ? ({ limit: legacyLimit } as ExecutionHistoryQuery)
            : payloadOrTaskId?.filters;
        logger.info('[SchedulerIPC] Getting execution history', { taskId, filters });

        const history = databaseService.getExecutionHistory(taskId, filters);

        return { success: true, data: history };
      } catch (error: any) {
        logger.error('[SchedulerIPC] Failed to get history:', error);
        return { success: false, error: error.message };
      }
    }
  );

  // 수동 실행
  ipcMain.handle('scheduler-run-now', async (_event, taskId: string) => {
    try {
      logger.info('[SchedulerIPC] Running task manually:', taskId);

      const task = databaseService.getScheduledTask(taskId);
      if (!task) {
        return { success: false, error: `Task not found: ${taskId}` };
      }

      // 수동 실행은 비활성 작업도 강제 실행 허용
      const execution = await schedulerService.executeTask(taskId, {
        manual: true,
        retryOnFailure: true,
        trigger: 'manual',
      });
      if (!execution) {
        return { success: false, error: 'Task is already running' };
      }
      if (execution.status === 'error') {
        return { success: false, error: execution.errorMessage || 'Task execution failed' };
      }

      return { success: true, data: execution };
    } catch (error: any) {
      logger.error('[SchedulerIPC] Failed to run task manually:', error);
      return { success: false, error: error.message };
    }
  });

  logger.info('[SchedulerIPC] Scheduler IPC handlers registered');
}
