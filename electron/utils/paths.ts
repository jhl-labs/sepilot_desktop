import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export class PathsUtil {
  static getUserDataPath(): string {
    return app.getPath('userData');
  }

  static getLogsPath(): string {
    const logsPath = path.join(this.getUserDataPath(), 'logs');
    this.ensureDirectoryExists(logsPath);
    return logsPath;
  }

  static getCachePath(): string {
    const cachePath = path.join(this.getUserDataPath(), 'cache');
    this.ensureDirectoryExists(cachePath);
    return cachePath;
  }

  static getConfigPath(): string {
    return path.join(this.getUserDataPath(), 'config.json');
  }

  static getDatabasePath(): string {
    return path.join(this.getUserDataPath(), 'sepilot.db');
  }

  /**
   * 메시지 큐 루트 디렉토리
   */
  static getMessagesPath(): string {
    const messagesPath = path.join(this.getUserDataPath(), 'messages');
    this.ensureDirectoryExists(messagesPath);
    return messagesPath;
  }

  /**
   * 대기 중인 메시지 큐 디렉토리
   */
  static getMessagesQueuePath(): string {
    const queuePath = path.join(this.getMessagesPath(), 'queue');
    this.ensureDirectoryExists(queuePath);
    return queuePath;
  }

  /**
   * 처리 중인 메시지 디렉토리
   */
  static getMessagesProcessingPath(): string {
    const processingPath = path.join(this.getMessagesPath(), 'processing');
    this.ensureDirectoryExists(processingPath);
    return processingPath;
  }

  /**
   * 완료된 메시지 디렉토리
   */
  static getMessagesCompletedPath(): string {
    const completedPath = path.join(this.getMessagesPath(), 'completed');
    this.ensureDirectoryExists(completedPath);
    return completedPath;
  }

  /**
   * 실패한 메시지 디렉토리
   */
  static getMessagesFailedPath(): string {
    const failedPath = path.join(this.getMessagesPath(), 'failed');
    this.ensureDirectoryExists(failedPath);
    return failedPath;
  }

  static ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  static ensureFileExists(filePath: string, defaultContent: string = ''): void {
    if (!fs.existsSync(filePath)) {
      const dir = path.dirname(filePath);
      this.ensureDirectoryExists(dir);
      fs.writeFileSync(filePath, defaultContent, 'utf-8');
    }
  }
}
