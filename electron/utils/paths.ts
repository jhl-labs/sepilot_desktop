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
