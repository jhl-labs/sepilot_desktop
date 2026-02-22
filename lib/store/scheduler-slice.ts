import type { ScheduledTask, ExecutionRecord, ExecutionHistoryQuery } from '@/types/scheduler';
import type { ExtensionRuntimeContext } from '@/lib/extensions/types';

/**
 * Scheduler Store State
 */
export interface SchedulerStoreState {
  scheduledTasks: ScheduledTask[];
  executionHistory: ExecutionRecord[];
  isLoadingTasks: boolean;
  isLoadingHistory: boolean;
}

/**
 * Scheduler Store Actions
 */
export interface SchedulerStoreActions {
  loadTasks: () => Promise<void>;
  createTask: (task: ScheduledTask) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<ScheduledTask>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  runTaskNow: (taskId: string) => Promise<void>;
  loadExecutionHistory: (taskId?: string, filters?: ExecutionHistoryQuery) => Promise<void>;
}

/**
 * Scheduler Extension의 초기 상태
 */
export const initialSchedulerState: SchedulerStoreState = {
  scheduledTasks: [],
  executionHistory: [],
  isLoadingTasks: false,
  isLoadingHistory: false,
};

/**
 * Extension Store Slice를 생성하는 팩토리 함수
 */
export function createSchedulerSlice(
  set: (
    partial:
      | Partial<SchedulerStoreState>
      | ((state: SchedulerStoreState) => Partial<SchedulerStoreState>)
  ) => void,
  _get: () => SchedulerStoreState,
  context: ExtensionRuntimeContext
): SchedulerStoreState & SchedulerStoreActions {
  return {
    // Initial state
    ...initialSchedulerState,

    // Actions
    loadTasks: async () => {
      set({ isLoadingTasks: true });
      try {
        if (context.platform.isElectron()) {
          const result = await context.ipc.invoke<ScheduledTask[]>('scheduler-load-tasks');
          if (result.success && result.data) {
            set({ scheduledTasks: result.data });
          } else {
            context.logger.error('Failed to load tasks', {
              error: String(result.error || 'Unknown error'),
            });
          }
        }
      } catch (error) {
        context.logger.error('Failed to load tasks', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        set({ isLoadingTasks: false });
      }
    },

    createTask: async (task: ScheduledTask) => {
      try {
        if (context.platform.isElectron()) {
          const result = await context.ipc.invoke<ScheduledTask>('scheduler-create-task', task);
          if (result.success && result.data) {
            set((state: any) => ({
              scheduledTasks: [...state.scheduledTasks, result.data!],
            }));
          } else {
            context.logger.error('Failed to create task', { error: result.error });
            throw new Error(result.error);
          }
        }
      } catch (error) {
        context.logger.error('Failed to create task', { error });
        throw error;
      }
    },

    updateTask: async (taskId: string, updates: Partial<ScheduledTask>) => {
      try {
        if (context.platform.isElectron()) {
          const result = await context.ipc.invoke<ScheduledTask>('scheduler-update-task', {
            taskId,
            updates,
          });
          if (result.success && result.data) {
            set((state: any) => ({
              scheduledTasks: state.scheduledTasks.map((t: ScheduledTask) =>
                t.id === taskId ? result.data! : t
              ),
            }));
          } else {
            context.logger.error('Failed to update task', { error: result.error });
            throw new Error(result.error);
          }
        }
      } catch (error) {
        context.logger.error('Failed to update task', { error });
        throw error;
      }
    },

    deleteTask: async (taskId: string) => {
      try {
        if (context.platform.isElectron()) {
          const result = await context.ipc.invoke('scheduler-delete-task', taskId);
          if (result.success) {
            set((state: any) => ({
              scheduledTasks: state.scheduledTasks.filter((t: ScheduledTask) => t.id !== taskId),
            }));
          } else {
            context.logger.error('Failed to delete task', { error: result.error });
            throw new Error(result.error);
          }
        }
      } catch (error) {
        context.logger.error('Failed to delete task', { error });
        throw error;
      }
    },

    runTaskNow: async (taskId: string) => {
      try {
        if (context.platform.isElectron()) {
          const result = await context.ipc.invoke<ExecutionRecord>('scheduler-run-now', taskId);
          if (!result.success) {
            context.logger.error('Failed to run task', { error: result.error });
            throw new Error(result.error);
          }

          if (result.data) {
            set((state: any) => ({
              executionHistory: [result.data!, ...state.executionHistory],
            }));
          }

          // 실행 완료 후 최신 실행 시각/다음 실행 시각을 즉시 반영
          const tasksResult = await context.ipc.invoke<ScheduledTask[]>('scheduler-load-tasks');
          if (tasksResult.success && tasksResult.data) {
            set({ scheduledTasks: tasksResult.data });
          }
        }
      } catch (error) {
        context.logger.error('Failed to run task', { error });
        throw error;
      }
    },

    loadExecutionHistory: async (taskId?: string, filters?: ExecutionHistoryQuery) => {
      set({ isLoadingHistory: true });
      try {
        if (context.platform.isElectron()) {
          const result = await context.ipc.invoke<ExecutionRecord[]>('scheduler-get-history', {
            taskId,
            filters,
          });
          if (result.success && result.data) {
            set({ executionHistory: result.data });
          } else {
            context.logger.error('Failed to load execution history', {
              error: String(result.error || 'Unknown error'),
            });
          }
        }
      } catch (error) {
        context.logger.error('Failed to load execution history', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        set({ isLoadingHistory: false });
      }
    },
  };
}
