/**
 * 파일 기반 메시지 큐 서비스
 *
 * 메시지를 파일로 저장하여 영속성을 보장하고,
 * 프로그램 재시작 시에도 큐가 유지되도록 합니다.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { PathsUtil } from '../utils/paths';
import { logger } from './logger';
import { databaseService } from './database';
import type {
  ExternalMessage,
  QueuedMessage,
  MessageQueueStatus,
} from '../../types/message-subscription';

export class MessageQueueService {
  private static instance: MessageQueueService;

  private constructor() {
    // 디렉토리 초기화
    this.initializeDirectories();
  }

  static getInstance(): MessageQueueService {
    if (!MessageQueueService.instance) {
      MessageQueueService.instance = new MessageQueueService();
    }
    return MessageQueueService.instance;
  }

  private async markInvalidMessageFile(filePath: string): Promise<void> {
    const invalidPath = `${filePath}.invalid-${Date.now()}`;
    try {
      await fs.rename(filePath, invalidPath);
      logger.warn(
        `[MessageQueue] 손상된 메시지 파일을 격리했습니다: ${path.basename(invalidPath)}`
      );
    } catch (error) {
      logger.warn('[MessageQueue] 손상 파일 격리 실패:', error);
    }
  }

  private async readQueuedMessageFile(filePath: string): Promise<QueuedMessage | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const message = JSON.parse(content) as Partial<QueuedMessage>;
      if (
        typeof message.hash !== 'string' ||
        typeof message.queuedAt !== 'number' ||
        typeof message.title !== 'string'
      ) {
        throw new Error('Invalid queued message schema');
      }
      return message as QueuedMessage;
    } catch (error) {
      logger.error(`[MessageQueue] 메시지 파일 파싱 실패: ${path.basename(filePath)}`, error);
      await this.markInvalidMessageFile(filePath);
      return null;
    }
  }

  private getMaxQueueSize(): number {
    try {
      const config = databaseService.getMessageSubscriptionConfig();
      const raw = Number(config?.maxQueueSize);
      if (!Number.isFinite(raw) || raw <= 0) {
        return 1000;
      }
      return Math.floor(raw);
    } catch (error) {
      logger.warn('[MessageQueue] 큐 설정 조회 실패, 기본 큐 크기를 사용합니다:', error);
      return 1000;
    }
  }

  /**
   * 필요한 디렉토리 생성
   */
  private initializeDirectories(): void {
    try {
      PathsUtil.getMessagesQueuePath();
      PathsUtil.getMessagesProcessingPath();
      PathsUtil.getMessagesCompletedPath();
      PathsUtil.getMessagesFailedPath();
      logger.info('[MessageQueue] 디렉토리 초기화 완료');
    } catch (error) {
      logger.error('[MessageQueue] 디렉토리 초기화 실패:', error);
    }
  }

  /**
   * 메시지 해시 생성 (중복 방지용)
   */
  private generateHash(message: ExternalMessage): string {
    const content = JSON.stringify({
      title: message.title,
      content: message.content,
      timestamp: message.timestamp,
      source: message.source,
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 메시지 파일 경로 가져오기
   */
  private getMessageFilePath(hash: string, status: QueuedMessage['status']): string {
    let dirPath: string;
    switch (status) {
      case 'pending':
        dirPath = PathsUtil.getMessagesQueuePath();
        break;
      case 'processing':
        dirPath = PathsUtil.getMessagesProcessingPath();
        break;
      case 'completed':
        dirPath = PathsUtil.getMessagesCompletedPath();
        break;
      case 'failed':
        dirPath = PathsUtil.getMessagesFailedPath();
        break;
    }
    return path.join(dirPath, `${hash}.json`);
  }

  /**
   * 중복 확인
   */
  private async isDuplicate(hash: string): Promise<boolean> {
    try {
      // 모든 상태 디렉토리에서 확인
      const dirs = [
        PathsUtil.getMessagesQueuePath(),
        PathsUtil.getMessagesProcessingPath(),
        PathsUtil.getMessagesCompletedPath(),
        PathsUtil.getMessagesFailedPath(),
      ];

      for (const dir of dirs) {
        const filePath = path.join(dir, `${hash}.json`);
        try {
          await fs.access(filePath);
          return true; // 파일이 존재함
        } catch {
          // 파일이 없음, 다음 디렉토리 확인
        }
      }

      return false;
    } catch (error) {
      logger.error('[MessageQueue] 중복 확인 중 에러:', error);
      return false;
    }
  }

  /**
   * 메시지를 큐에 추가
   * @returns 메시지 해시 (중복인 경우 null)
   */
  async enqueue(message: ExternalMessage): Promise<string | null> {
    try {
      const hash = this.generateHash(message);

      // 중복 확인
      if (await this.isDuplicate(hash)) {
        logger.info(`[MessageQueue] 중복 메시지 무시: ${hash.substring(0, 8)}...`);
        return null;
      }

      // 큐 용량 제한 확인
      const queuePath = PathsUtil.getMessagesQueuePath();
      const pendingCount = await this.countFiles(queuePath);
      const maxQueueSize = this.getMaxQueueSize();
      if (pendingCount >= maxQueueSize) {
        logger.warn(
          `[MessageQueue] 큐가 가득 찼습니다. 메시지를 건너뜁니다 (${pendingCount}/${maxQueueSize})`
        );
        return null;
      }

      const queuedMessage: QueuedMessage = {
        ...message,
        hash,
        queuedAt: Date.now(),
        status: 'pending',
        retryCount: 0,
      };

      const filePath = this.getMessageFilePath(hash, 'pending');
      await fs.writeFile(filePath, JSON.stringify(queuedMessage, null, 2), 'utf-8');

      logger.info(`[MessageQueue] 메시지 추가: ${message.title} (${hash.substring(0, 8)}...)`);
      return hash;
    } catch (error) {
      logger.error('[MessageQueue] 메시지 추가 실패:', error);
      throw error;
    }
  }

  /**
   * 다음 처리 대기 메시지 가져오기 (FIFO)
   */
  async dequeue(): Promise<QueuedMessage | null> {
    try {
      const queuePath = PathsUtil.getMessagesQueuePath();
      const files = (await fs.readdir(queuePath)).filter((file) => file.endsWith('.json'));

      if (files.length === 0) {
        return null;
      }

      // queuedAt 기준으로 FIFO 보장
      const loadedMessages: QueuedMessage[] = [];
      for (const fileName of files) {
        const filePath = path.join(queuePath, fileName);
        const message = await this.readQueuedMessageFile(filePath);
        if (message) {
          loadedMessages.push(message);
        }
      }

      if (loadedMessages.length === 0) {
        return null;
      }

      loadedMessages.sort((a, b) => a.queuedAt - b.queuedAt);
      const message = loadedMessages[0];

      logger.info(`[MessageQueue] 메시지 dequeue: ${message.title}`);
      return message;
    } catch (error) {
      logger.error('[MessageQueue] dequeue 실패:', error);
      return null;
    }
  }

  /**
   * 메시지 상태 변경
   */
  async updateStatus(
    hash: string,
    status: QueuedMessage['status'],
    error?: string,
    conversationId?: string
  ): Promise<void> {
    try {
      // 현재 메시지 찾기
      let currentPath: string | null = null;

      for (const st of ['pending', 'processing', 'completed', 'failed'] as const) {
        const filePath = this.getMessageFilePath(hash, st);
        try {
          await fs.access(filePath);
          currentPath = filePath;
          break;
        } catch {
          // 파일이 없음
        }
      }

      if (!currentPath) {
        logger.warn(`[MessageQueue] 메시지를 찾을 수 없음: ${hash.substring(0, 8)}...`);
        return;
      }

      // 메시지 읽기
      const content = await fs.readFile(currentPath, 'utf-8');
      const message = JSON.parse(content) as QueuedMessage;

      // 메시지 업데이트
      message.status = status;
      message.processedAt = Date.now();
      if (error) {
        message.error = error;
        message.retryCount++;
      }
      if (conversationId) {
        message.conversationId = conversationId;
      }

      // 새 경로에 저장
      const newPath = this.getMessageFilePath(hash, status);
      await fs.writeFile(newPath, JSON.stringify(message, null, 2), 'utf-8');

      // 기존 파일 삭제
      if (currentPath !== newPath) {
        await fs.unlink(currentPath);
      }

      logger.info(`[MessageQueue] 상태 변경: ${message.title} -> ${status}`);
    } catch (error) {
      logger.error('[MessageQueue] 상태 변경 실패:', error);
      throw error;
    }
  }

  /**
   * 큐 상태 조회
   */
  async getStatus(): Promise<MessageQueueStatus> {
    try {
      const [pending, processing, completed, failed] = await Promise.all([
        this.countFiles(PathsUtil.getMessagesQueuePath()),
        this.countFiles(PathsUtil.getMessagesProcessingPath()),
        this.countFiles(PathsUtil.getMessagesCompletedPath()),
        this.countFiles(PathsUtil.getMessagesFailedPath()),
      ]);

      return {
        pending,
        processing,
        completed,
        failed,
        totalProcessed: completed + failed,
      };
    } catch (error) {
      logger.error('[MessageQueue] 상태 조회 실패:', error);
      return {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalProcessed: 0,
      };
    }
  }

  /**
   * 디렉토리의 파일 개수 세기
   */
  private async countFiles(dirPath: string): Promise<number> {
    try {
      const files = await fs.readdir(dirPath);
      return files.filter((f) => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  /**
   * 실패한 메시지 목록 조회
   */
  async getFailedMessages(): Promise<QueuedMessage[]> {
    try {
      const failedPath = PathsUtil.getMessagesFailedPath();
      const files = await fs.readdir(failedPath);

      const messages: QueuedMessage[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(failedPath, file);
        const message = await this.readQueuedMessageFile(filePath);
        if (message) {
          messages.push(message);
        }
      }

      // 시간순 정렬 (최신순)
      messages.sort((a, b) => b.queuedAt - a.queuedAt);

      return messages;
    } catch (error) {
      logger.error('[MessageQueue] 실패 메시지 조회 실패:', error);
      return [];
    }
  }

  /**
   * 대기 중인 메시지 목록 조회
   */
  async getPendingMessages(): Promise<QueuedMessage[]> {
    try {
      const pendingPath = PathsUtil.getMessagesQueuePath();
      const files = await fs.readdir(pendingPath);

      const messages: QueuedMessage[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(pendingPath, file);
        const message = await this.readQueuedMessageFile(filePath);
        if (message) {
          messages.push(message);
        }
      }

      // 시간순 정렬 (FIFO - 오래된 것부터)
      messages.sort((a, b) => a.queuedAt - b.queuedAt);

      return messages;
    } catch (error) {
      logger.error('[MessageQueue] 대기 메시지 조회 실패:', error);
      return [];
    }
  }

  /**
   * 완료된 메시지 목록 조회
   */
  async getCompletedMessages(): Promise<QueuedMessage[]> {
    try {
      const completedPath = PathsUtil.getMessagesCompletedPath();
      const files = await fs.readdir(completedPath);

      const messages: QueuedMessage[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(completedPath, file);
        const message = await this.readQueuedMessageFile(filePath);
        if (message) {
          messages.push(message);
        }
      }

      // 시간순 정렬 (최신순)
      messages.sort((a, b) => (b.processedAt || 0) - (a.processedAt || 0));

      return messages;
    } catch (error) {
      logger.error('[MessageQueue] 완료 메시지 조회 실패:', error);
      return [];
    }
  }

  /**
   * 메시지 재처리 (failed → pending)
   */
  async reprocess(hash: string): Promise<void> {
    try {
      const failedPath = this.getMessageFilePath(hash, 'failed');
      const content = await fs.readFile(failedPath, 'utf-8');
      const message = JSON.parse(content) as QueuedMessage;

      // 상태 초기화
      message.status = 'pending';
      message.error = undefined;
      message.retryCount = 0;

      // pending 디렉토리로 이동
      const pendingPath = this.getMessageFilePath(hash, 'pending');
      await fs.writeFile(pendingPath, JSON.stringify(message, null, 2), 'utf-8');
      await fs.unlink(failedPath);

      logger.info(`[MessageQueue] 메시지 재처리: ${message.title}`);
    } catch (error) {
      logger.error('[MessageQueue] 재처리 실패:', error);
      throw error;
    }
  }

  /**
   * 메시지 삭제
   */
  async deleteMessage(hash: string): Promise<void> {
    try {
      // 모든 디렉토리에서 찾아서 삭제
      const dirs = [
        PathsUtil.getMessagesQueuePath(),
        PathsUtil.getMessagesProcessingPath(),
        PathsUtil.getMessagesCompletedPath(),
        PathsUtil.getMessagesFailedPath(),
      ];

      for (const dir of dirs) {
        const filePath = path.join(dir, `${hash}.json`);
        try {
          await fs.unlink(filePath);
          logger.info(`[MessageQueue] 메시지 삭제: ${hash.substring(0, 8)}...`);
          return;
        } catch {
          // 파일이 없음, 다음 디렉토리 확인
        }
      }

      logger.warn(`[MessageQueue] 삭제할 메시지를 찾을 수 없음: ${hash.substring(0, 8)}...`);
    } catch (error) {
      logger.error('[MessageQueue] 메시지 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 오래된 completed 메시지 정리
   * @param retentionDays 보관 기간 (일)
   */
  async cleanup(retentionDays: number = 7): Promise<number> {
    try {
      const completedPath = PathsUtil.getMessagesCompletedPath();
      const files = await fs.readdir(completedPath);

      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(completedPath, file);
        const message = await this.readQueuedMessageFile(filePath);
        if (!message) {
          continue;
        }

        if (message.processedAt && message.processedAt < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info(`[MessageQueue] ${deletedCount}개의 오래된 메시지 정리 완료`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('[MessageQueue] 정리 실패:', error);
      return 0;
    }
  }
}
