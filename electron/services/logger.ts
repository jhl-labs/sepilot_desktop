import fs from 'fs';
import path from 'path';
import { PathsUtil } from '../utils/paths';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private logFilePath: string;

  constructor() {
    const logsPath = PathsUtil.getLogsPath();
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logFilePath = path.join(logsPath, `sepilot-${timestamp}.log`);
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}\n`;
  }

  private writeLog(level: LogLevel, message: string, data?: any): void {
    const formatted = this.formatMessage(level, message, data);

    // Console output
    console.log(formatted.trim());

    // File output
    try {
      fs.appendFileSync(this.logFilePath, formatted, 'utf-8');
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  info(message: string, data?: any): void {
    this.writeLog('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.writeLog('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.writeLog('error', message, data);
  }

  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.writeLog('debug', message, data);
    }
  }
}

export const logger = new Logger();
