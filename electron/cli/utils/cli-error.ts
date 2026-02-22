/**
 * CLI 에러 처리 유틸리티
 */

import { printError } from './output';

/**
 * Exit Codes
 */
export enum ExitCode {
  SUCCESS = 0,
  ERROR = 1,
  INVALID_ARGUMENT = 2,
  NOT_FOUND = 3,
  PERMISSION_DENIED = 4,
}

/**
 * CLI 에러 클래스
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: ExitCode = ExitCode.ERROR
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

/**
 * 에러 처리 및 종료
 */
export function handleError(error: unknown): ExitCode {
  if (error instanceof CLIError) {
    printError(error.message);
    return error.exitCode;
  }

  if (error instanceof Error) {
    printError(`Unexpected error: ${error.message}`);
    if (process.env.VERBOSE) {
      console.error(error.stack);
    }
    return ExitCode.ERROR;
  }

  printError(`Unknown error: ${String(error)}`);
  return ExitCode.ERROR;
}

/**
 * 에러와 함께 프로세스 종료
 */
export function exitWithError(message: string, exitCode: ExitCode = ExitCode.ERROR): never {
  printError(message);
  process.exit(exitCode);
}
