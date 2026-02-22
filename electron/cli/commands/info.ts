/**
 * 시스템 정보 명령어
 */

import { app } from 'electron';
import os from 'os';
import path from 'path';
import packageJson from '../../../package.json';
import { isJsonMode, printHeader, printSection, printKeyValue, printJson } from '../utils/output';
import { CLIError, ExitCode } from '../utils/cli-error';

/**
 * 시스템 정보 출력
 */
export async function runInfo(): Promise<void> {
  try {
    const info = {
      version: {
        app: packageJson.version,
        electron: process.versions.electron,
        node: process.versions.node,
        v8: process.versions.v8,
        chrome: process.versions.chrome,
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        osType: os.type(),
        osRelease: os.release(),
        cpus: os.cpus().length,
        totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
        freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      },
      paths: {
        exe: app.getPath('exe'),
        userData: app.getPath('userData'),
        logs: app.getPath('logs'),
        temp: app.getPath('temp'),
      },
      environment: {
        isPackaged: app.isPackaged,
        isDev: !app.isPackaged,
      },
    };

    if (isJsonMode()) {
      printJson(info);
    } else {
      printHeader('SEPilot Desktop System Information');

      printSection('Version:');
      printKeyValue('App', info.version.app);
      printKeyValue('Electron', info.version.electron);
      printKeyValue('Node', info.version.node);
      printKeyValue('V8', info.version.v8);
      printKeyValue('Chrome', info.version.chrome);

      printSection('System:');
      printKeyValue('Platform', info.system.platform);
      printKeyValue('Architecture', info.system.arch);
      printKeyValue('OS Type', info.system.osType);
      printKeyValue('OS Release', info.system.osRelease);
      printKeyValue('CPUs', info.system.cpus.toString());
      printKeyValue('Total Memory', info.system.totalMemory);
      printKeyValue('Free Memory', info.system.freeMemory);

      printSection('Paths:');
      printKeyValue('Executable', info.paths.exe);
      printKeyValue('User Data', info.paths.userData);
      printKeyValue('Logs', info.paths.logs);
      printKeyValue('Temp', info.paths.temp);

      printSection('Environment:');
      printKeyValue('Packaged', info.environment.isPackaged ? 'true' : 'false');
      printKeyValue('Development', info.environment.isDev ? 'true' : 'false');

      console.log();
    }
  } catch (error) {
    throw new CLIError(
      `Failed to get system info: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}
