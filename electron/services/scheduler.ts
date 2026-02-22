import * as cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';
import { databaseService } from './database';
import { showAppNotification } from './notification-service';
import { GraphFactory } from '../../lib/domains/agent';
import type { StreamEvent } from '../../lib/domains/agent/types';
import type {
  ScheduledTask,
  ExecutionRecord,
  ExecutionTrigger,
  ScheduleConfig,
  PresetScheduleConfig,
  NotificationResultHandler,
  FileResultHandler,
} from '../../types/scheduler';
import type { Message } from '../../types';

export class SchedulerService {
  private static instance: SchedulerService | null = null;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private isInitialized = false;
  private readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  private readonly scheduledRetryMaxAttempts = 3;
  private readonly scheduledRetryBaseDelayMs = 5_000;
  private readonly scheduledRetryMaxDelayMs = 60_000;
  private readonly catchUpMaxMissedMinutes = 24 * 60;
  private readonly catchUpConcurrency = 2;
  private readonly executionTimeoutMs = 10 * 60_000;

  private constructor() {}

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * 서비스 초기화
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info('[SchedulerService] Initializing scheduler service...');

    try {
      // 활성화된 작업 로드 및 등록
      await this.loadAndRegisterActiveTasks();

      this.isInitialized = true;
      logger.info('[SchedulerService] Scheduler service initialized successfully');
    } catch (error) {
      logger.error('[SchedulerService] Failed to initialize scheduler service:', error);
      throw error;
    }
  }

  /**
   * 활성화된 작업 로드 및 등록
   */
  private async loadAndRegisterActiveTasks(): Promise<void> {
    try {
      const tasks = databaseService.getAllScheduledTasks();
      const activeTasks = tasks.filter((task) => task.enabled);

      logger.info(`[SchedulerService] Found ${activeTasks.length} active tasks`);
      const registerResults = await Promise.allSettled(
        activeTasks.map((task) => this.registerTask(task))
      );
      registerResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error(
            `[SchedulerService] Failed to register task ${activeTasks[index]?.id}:`,
            result.reason
          );
        }
      });

      await this.recoverMissedExecutions(activeTasks);
    } catch (error) {
      logger.error('[SchedulerService] Failed to load tasks:', error);
    }
  }

  private async recoverMissedExecutions(tasks: ScheduledTask[]): Promise<void> {
    const now = Date.now();
    const catchUpThreshold = now - this.catchUpMaxMissedMinutes * 60_000;
    const recoverableTasks = tasks.filter(
      (task) =>
        task.nextExecutionAt &&
        task.nextExecutionAt < now &&
        task.nextExecutionAt >= catchUpThreshold &&
        !this.runningTasks.has(task.id)
    );

    const skippedTooOldTasks = tasks.filter(
      (task) =>
        task.nextExecutionAt &&
        task.nextExecutionAt < catchUpThreshold &&
        task.nextExecutionAt < now &&
        !this.runningTasks.has(task.id)
    );

    if (skippedTooOldTasks.length > 0) {
      logger.info(
        `[SchedulerService] Skipped ${skippedTooOldTasks.length} stale missed execution(s) older than ${this.catchUpMaxMissedMinutes} minutes`
      );
    }

    if (recoverableTasks.length === 0) {
      return;
    }

    logger.info(
      `[SchedulerService] Recovering ${recoverableTasks.length} potentially missed execution(s) with concurrency=${this.catchUpConcurrency}`
    );

    const recoveryResults = await this.processWithConcurrencyLimit(
      recoverableTasks,
      this.catchUpConcurrency,
      (task) =>
        this.executeTask(task.id, {
          trigger: 'catch-up',
          retryOnFailure: true,
        })
    );

    recoveryResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error(
          `[SchedulerService] Catch-up execution failed for task ${recoverableTasks[index]?.id}:`,
          result.reason
        );
      }
    });
  }

  private async processWithConcurrencyLimit<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>
  ): Promise<Array<PromiseSettledResult<R>>> {
    const settledResults: Array<PromiseSettledResult<R>> = new Array(items.length);
    const queue = items.map((item, index) => ({ item, index }));

    const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) {
          return;
        }

        try {
          const data = await worker(next.item);
          settledResults[next.index] = {
            status: 'fulfilled',
            value: data,
          };
        } catch (error) {
          settledResults[next.index] = {
            status: 'rejected',
            reason: error,
          };
        }
      }
    });

    await Promise.all(runners);
    return settledResults;
  }

  private validatePresetSchedule(schedule: PresetScheduleConfig): void {
    const [hourRaw, minuteRaw] = schedule.time ? schedule.time.split(':') : ['9', '0'];
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);

    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error(`Invalid hour in schedule.time: ${schedule.time}`);
    }

    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw new Error(`Invalid minute in schedule.time: ${schedule.time}`);
    }

    if (schedule.preset === 'weekly') {
      const dayOfWeek = schedule.dayOfWeek ?? 1;
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new Error(`Invalid dayOfWeek for weekly schedule: ${dayOfWeek}`);
      }
    }

    if (schedule.preset === 'monthly') {
      const dayOfMonth = schedule.dayOfMonth ?? 1;
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        throw new Error(`Invalid dayOfMonth for monthly schedule: ${dayOfMonth}`);
      }
    }
  }

  /**
   * 스케줄 설정을 Cron 표현식으로 변환
   */
  private scheduleToCronExpression(schedule: ScheduleConfig): string {
    if (schedule.type === 'cron') {
      return schedule.expression;
    }

    // 프리셋을 Cron 표현식으로 변환
    const presetSchedule = schedule as PresetScheduleConfig;
    this.validatePresetSchedule(presetSchedule);
    const { preset, time, dayOfWeek, dayOfMonth } = presetSchedule;
    const [hour, minute] = time ? time.split(':').map(Number) : [9, 0];

    switch (preset) {
      case 'every-minute':
        return '* * * * *';
      case 'hourly':
        // 매시간 지정된 분에 실행 (예: 30분 → 00:30, 01:30, 02:30, ...)
        return `${minute} * * * *`;
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        return `${minute} ${hour} * * ${dayOfWeek ?? 1}`;
      case 'monthly':
        return `${minute} ${hour} ${dayOfMonth ?? 1} * *`;
      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }

  /**
   * 다음 실행 시각 계산
   */
  private calculateNextExecutionAt(cronExpression: string): number | undefined {
    try {
      const interval = CronExpressionParser.parse(cronExpression, {
        tz: this.timezone,
      });
      return interval.next().toDate().getTime();
    } catch (error) {
      logger.warn('[SchedulerService] Failed to calculate next execution time:', error);
      return undefined;
    }
  }

  /**
   * 작업 등록
   */
  public async registerTask(task: ScheduledTask): Promise<void> {
    try {
      const cronExpression = this.scheduleToCronExpression(task.schedule);

      // Cron 표현식 유효성 검증
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      // 기존 작업 제거
      this.unregisterTask(task.id);

      // Cron 작업 생성
      const cronTask = cron.schedule(
        cronExpression,
        async () => {
          await this.executeTask(task.id, {
            retryOnFailure: true,
            trigger: 'schedule',
          });
        },
        {
          scheduled: task.enabled,
          timezone: this.timezone,
        } as any
      );

      this.cronJobs.set(task.id, cronTask);

      // UI에서 다음 실행 시각을 표시할 수 있도록 함께 저장
      const nextExecutionAt = this.calculateNextExecutionAt(cronExpression);
      if (nextExecutionAt !== task.nextExecutionAt) {
        databaseService.updateScheduledTask(task.id, { nextExecutionAt });
      }

      logger.info(
        `[SchedulerService] Task registered: ${task.name} (${cronExpression}, timezone=${this.timezone})`
      );
    } catch (error) {
      logger.error(`[SchedulerService] Failed to register task ${task.id}:`, error);
      throw error;
    }
  }

  /**
   * 작업 등록 해제
   */
  public unregisterTask(taskId: string): void {
    const cronTask = this.cronJobs.get(taskId);
    if (cronTask) {
      cronTask.stop();
      this.cronJobs.delete(taskId);
      logger.info(`[SchedulerService] Task unregistered: ${taskId}`);
    }
  }

  /**
   * 작업 실행
   */
  public async executeTask(
    taskId: string,
    options?: {
      manual?: boolean;
      retryOnFailure?: boolean;
      trigger?: 'manual' | 'schedule' | 'catch-up';
    }
  ): Promise<ExecutionRecord | null> {
    const trigger: ExecutionTrigger = options?.trigger ?? (options?.manual ? 'manual' : 'schedule');

    // 중복 실행 방지
    if (this.runningTasks.has(taskId)) {
      logger.warn(`[SchedulerService] Task ${taskId} is already running, skipping execution`);
      return null;
    }

    this.runningTasks.add(taskId);

    const startedAt = Date.now();
    const executionRecord: ExecutionRecord = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      taskName: '',
      status: 'running',
      startedAt,
      trigger,
    };
    let shouldSaveRecord = true;

    try {
      // 작업 정보 로드
      const task = databaseService.getScheduledTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      if (!task.enabled && !options?.manual) {
        logger.info(`[SchedulerService] Task ${taskId} is disabled, skipping execution`);
        shouldSaveRecord = false;
        return null;
      }

      if (!task.enabled && options?.manual) {
        logger.info(`[SchedulerService] Manually executing disabled task: ${taskId}`);
      }

      executionRecord.taskName = task.name;

      if (!task.prompt?.trim()) {
        throw new Error('Task prompt is required');
      }

      logger.info(`[SchedulerService] Executing task: ${task.name} (trigger=${trigger})`);

      // Agent 실행
      const executionResult = options?.retryOnFailure
        ? await this.runAgentWithRetry(task)
        : {
            result: await this.runAgentWithTimeout(task),
            attemptsUsed: 1,
          };
      const result = executionResult.result;

      // 실행 결과 업데이트
      executionRecord.status = 'success';
      executionRecord.completedAt = Date.now();
      executionRecord.duration = executionRecord.completedAt - startedAt;
      executionRecord.attemptCount = executionResult.attemptsUsed;
      executionRecord.resultSummary = result.summary.substring(0, 500);
      executionRecord.toolsExecuted = result.toolsExecuted;
      executionRecord.toolsBlocked = result.toolsBlocked;

      // 결과 처리
      await this.handleResults(task, result, executionRecord);

      // 마지막 실행 시각 업데이트
      const cronExpression = this.scheduleToCronExpression(task.schedule);
      const nextExecutionAt = task.enabled
        ? this.calculateNextExecutionAt(cronExpression)
        : undefined;
      databaseService.updateScheduledTask(taskId, {
        lastExecutedAt: startedAt,
        nextExecutionAt,
      });

      logger.info(`[SchedulerService] Task executed successfully: ${task.name}`);
    } catch (error: any) {
      logger.error(`[SchedulerService] Task execution failed:`, error);

      executionRecord.status = 'error';
      executionRecord.completedAt = Date.now();
      executionRecord.duration = executionRecord.completedAt - startedAt;
      executionRecord.errorMessage = error.message || 'Unknown error';
    } finally {
      // 실행 기록 저장
      if (shouldSaveRecord) {
        databaseService.saveExecutionRecord(executionRecord);
      }
      this.runningTasks.delete(taskId);
    }

    return executionRecord;
  }

  private async runAgentWithTimeout(task: ScheduledTask): Promise<{
    summary: string;
    toolsExecuted: string[];
    toolsBlocked: string[];
  }> {
    const timeoutController = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      timeoutHandle = setTimeout(() => {
        timeoutController.abort(
          new Error(`Task execution timed out after ${this.executionTimeoutMs}ms`)
        );
      }, this.executionTimeoutMs);

      return await this.runAgent(task, timeoutController.signal);
    } catch (error) {
      if (timeoutController.signal.aborted) {
        const timeoutReason = timeoutController.signal.reason;
        throw timeoutReason instanceof Error
          ? timeoutReason
          : new Error(`Task execution timed out after ${this.executionTimeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async runAgentWithRetry(task: ScheduledTask): Promise<{
    result: {
      summary: string;
      toolsExecuted: string[];
      toolsBlocked: string[];
    };
    attemptsUsed: number;
  }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.scheduledRetryMaxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(
            `[SchedulerService] Retrying task ${task.id} (attempt ${attempt}/${this.scheduledRetryMaxAttempts})`
          );
        }
        const result = await this.runAgentWithTimeout(task);
        return {
          result,
          attemptsUsed: attempt,
        };
      } catch (error) {
        lastError = error;

        if (attempt >= this.scheduledRetryMaxAttempts) {
          break;
        }

        const exponentialDelay = this.scheduledRetryBaseDelayMs * 2 ** (attempt - 1);
        const jitteredDelay = Math.floor(exponentialDelay * (0.8 + Math.random() * 0.4));
        const delayMs = Math.min(jitteredDelay, this.scheduledRetryMaxDelayMs);
        logger.warn(
          `[SchedulerService] Task ${task.id} failed on attempt ${attempt}. Retrying in ${delayMs}ms`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Task execution failed after retries');
  }

  /**
   * Agent 실행
   */
  private async runAgent(
    task: ScheduledTask,
    signal?: AbortSignal
  ): Promise<{
    summary: string;
    toolsExecuted: string[];
    toolsBlocked: string[];
  }> {
    const messages: Message[] = [
      {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: task.prompt,
        created_at: Date.now(),
      },
    ];

    const graphConfig = {
      thinkingMode: task.thinkingMode,
      enableRAG: task.enableRAG,
      enableTools: task.enableTools,
      enabledTools: task.enableTools ? task.allowedTools : [],
    };

    const toolsExecuted: string[] = [];
    const toolsBlocked: string[] = [];

    // Tool 승인 콜백: 허용 목록 기반 자동 승인
    const toolApprovalCallback = async (
      toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
    ): Promise<boolean> => {
      const allAllowed = toolCalls.every((tc) => task.allowedTools.includes(tc.name));

      toolCalls.forEach((tc) => {
        if (task.allowedTools.includes(tc.name)) {
          toolsExecuted.push(tc.name);
        } else {
          toolsBlocked.push(tc.name);
        }
      });

      if (!allAllowed) {
        logger.warn(
          `[SchedulerService] Some tools were blocked:`,
          toolCalls.filter((tc) => !task.allowedTools.includes(tc.name)).map((tc) => tc.name)
        );
      }

      return allAllowed; // 모두 허용되어야 승인
    };

    // Agent 스트리밍 실행
    let resultContent = '';
    const streamIterator = GraphFactory.streamWithConfig(graphConfig, messages, {
      toolApprovalCallback,
      conversationId: `scheduler-${task.id}-${Date.now()}`,
      signal,
    });

    try {
      while (true) {
        if (signal?.aborted) {
          throw signal.reason instanceof Error
            ? signal.reason
            : new Error('Agent execution aborted');
        }

        const nextEvent = streamIterator.next();
        const iterationResult = signal
          ? await new Promise<IteratorResult<StreamEvent>>((resolve, reject) => {
              const onAbort = () => {
                reject(
                  signal.reason instanceof Error
                    ? signal.reason
                    : new Error('Agent execution aborted')
                );
              };

              signal.addEventListener('abort', onAbort, { once: true });

              nextEvent
                .then((value) => {
                  signal.removeEventListener('abort', onAbort);
                  resolve(value);
                })
                .catch((error) => {
                  signal.removeEventListener('abort', onAbort);
                  reject(error);
                });
            })
          : await nextEvent;

        if (iterationResult.done) {
          break;
        }

        const event = iterationResult.value;

        if (event.type === 'node' && event.data?.messages) {
          const lastMessage = event.data.messages[event.data.messages.length - 1];
          if (lastMessage?.role === 'assistant') {
            resultContent = lastMessage.content;
          }
        }

        if (event.type === 'error') {
          throw new Error(event.error || 'Agent execution failed');
        }
      }
    } finally {
      if (signal?.aborted && typeof streamIterator.return === 'function') {
        try {
          await streamIterator.return(undefined);
        } catch (cleanupError) {
          logger.warn(
            '[SchedulerService] Failed to cleanup aborted stream iterator:',
            cleanupError
          );
        }
      }
    }

    return {
      summary: resultContent,
      toolsExecuted: Array.from(new Set(toolsExecuted)),
      toolsBlocked: Array.from(new Set(toolsBlocked)),
    };
  }

  /**
   * 결과 처리
   */
  private async handleResults(
    task: ScheduledTask,
    result: { summary: string },
    executionRecord: ExecutionRecord
  ): Promise<void> {
    const handlerErrors: string[] = [];

    for (const handler of task.resultHandlers) {
      if (!handler.enabled) {
        continue;
      }

      try {
        switch (handler.type) {
          case 'conversation':
            await this.handleConversationResult(task, result, executionRecord);
            break;
          case 'notification':
            await this.handleNotificationResult(
              task,
              result,
              handler as NotificationResultHandler,
              executionRecord
            );
            break;
          case 'file':
            await this.handleFileResult(
              task,
              result,
              handler as FileResultHandler,
              executionRecord
            );
            break;
        }
      } catch (error) {
        logger.error(`[SchedulerService] Failed to handle result (${handler.type}):`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        handlerErrors.push(`${handler.type}: ${errorMessage}`);
      }
    }

    if (handlerErrors.length > 0) {
      throw new Error(`Result handler failed (${handlerErrors.join(', ')})`);
    }
  }

  /**
   * 새 대화 생성 핸들러
   */
  private async handleConversationResult(
    task: ScheduledTask,
    result: { summary: string },
    executionRecord: ExecutionRecord
  ): Promise<void> {
    const conversationId = `conv-scheduler-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 대화 생성
    databaseService.saveConversation({
      id: conversationId,
      title: `[스케줄] ${task.name}`,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 메시지 저장
    const timestamp = Date.now();
    databaseService.saveMessage({
      id: `msg-${timestamp}-user`,
      conversation_id: conversationId,
      role: 'user',
      content: task.prompt,
      created_at: timestamp,
    });

    databaseService.saveMessage({
      id: `msg-${timestamp + 1}-assistant`,
      conversation_id: conversationId,
      role: 'assistant',
      content: result.summary,
      created_at: Date.now(),
    });

    // DB를 즉시 디스크에 flush (debounce 대기 없이)
    databaseService.flushNow();

    executionRecord.conversationId = conversationId;
    logger.info(`[SchedulerService] Created conversation: ${conversationId}`);

    // Renderer에 새 대화 생성을 알려 대화 목록 갱신
    const mainWindow =
      BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.getTitle() === 'SEPilot Desktop'
      ) ?? null;
    if (mainWindow) {
      mainWindow.webContents.send('scheduler:conversation-created', {
        id: conversationId,
        title: `[스케줄] ${task.name}`,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }
  }

  /**
   * 알림 전송 핸들러
   */
  private async handleNotificationResult(
    task: ScheduledTask,
    result: { summary: string },
    handler: NotificationResultHandler,
    executionRecord: ExecutionRecord
  ): Promise<void> {
    const mainWindow =
      BrowserWindow.getAllWindows().find(
        (window) => !window.isDestroyed() && window.getTitle() === 'SEPilot Desktop'
      ) ?? null;
    const notificationResult = await showAppNotification(
      {
        conversationId: executionRecord.conversationId || `scheduler-${task.id}`,
        title: handler.title || `스케줄 작업 완료: ${task.name}`,
        body: result.summary.substring(0, 200),
      },
      {
        mainWindow,
      }
    );

    if (!notificationResult.success) {
      logger.warn(
        `[SchedulerService] Failed to send ${notificationResult.type} notification: ${notificationResult.error}`
      );
      return;
    }

    executionRecord.notificationSent = true;
    logger.info(
      `[SchedulerService] ${notificationResult.type} notification sent for task: ${task.name}`
    );
  }

  /**
   * 파일 저장 핸들러
   */
  private sanitizeResultFilename(filename: string, format: FileResultHandler['format']): string {
    const baseName = path.basename(filename);
    const withoutControlChars = Array.from(baseName)
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('');
    const sanitized = withoutControlChars
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\.\./g, '_')
      .trim();

    const fallback = `result_${Date.now()}.${format}`;
    const withFallback = sanitized || fallback;
    const expectedExt = `.${format}`;

    return withFallback.toLowerCase().endsWith(expectedExt)
      ? withFallback
      : `${withFallback}${expectedExt}`;
  }

  private ensurePathWithinBase(baseDir: string, filePath: string): string {
    const resolvedBase = path.resolve(baseDir);
    const resolvedFile = path.resolve(filePath);

    if (resolvedFile === resolvedBase || resolvedFile.startsWith(`${resolvedBase}${path.sep}`)) {
      return resolvedFile;
    }

    throw new Error('Invalid output file path');
  }

  private async handleFileResult(
    task: ScheduledTask,
    result: { summary: string },
    handler: FileResultHandler,
    executionRecord: ExecutionRecord
  ): Promise<void> {
    const userDataPath = app.getPath('userData');
    const baseDir = handler.directory || path.join(userDataPath, 'scheduler_results');

    // 디렉토리 생성
    await fs.mkdir(baseDir, { recursive: true });

    // 파일명 생성
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rawFilename =
      handler.filename?.replace('{timestamp}', timestamp) ||
      `${task.name}_${timestamp}.${handler.format}`;
    const filename = this.sanitizeResultFilename(rawFilename, handler.format);

    const filePath = this.ensurePathWithinBase(baseDir, path.join(baseDir, filename));

    // 파일 내용 작성
    const content = `# ${task.name}\n\n**실행 시각**: ${new Date().toLocaleString('ko-KR')}\n\n${result.summary}`;

    await fs.writeFile(filePath, content, 'utf-8');

    executionRecord.savedFilePath = filePath;
    logger.info(`[SchedulerService] Result saved to file: ${filePath}`);
  }

  /**
   * 서비스 종료
   */
  public shutdown(): void {
    logger.info('[SchedulerService] Shutting down scheduler service...');

    // 모든 Cron 작업 중지
    for (const [taskId, cronTask] of this.cronJobs.entries()) {
      cronTask.stop();
      logger.info(`[SchedulerService] Stopped task: ${taskId}`);
    }

    this.cronJobs.clear();
    this.isInitialized = false;
    logger.info('[SchedulerService] Scheduler service shut down');
  }
}
