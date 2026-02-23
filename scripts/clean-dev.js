#!/usr/bin/env node

/**
 * Dev 환경 정리 스크립트
 * - Next.js lock 파일 삭제
 * - 기존 실행 중인 Next.js 및 Electron 프로세스 종료 (선택적)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const lockPath = path.join(__dirname, '..', 'out', 'dev', 'lock');
const projectDir = path.resolve(__dirname, '..');
const processesOnly = process.argv.includes('--processes-only');

console.log('🧹 Cleaning dev environment...');

// 1. Lock 파일 삭제
try {
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
    console.log('✅ Removed Next.js lock file');
  } else {
    console.log('ℹ️  No lock file found (already clean)');
  }
} catch (error) {
  console.error('⚠️  Failed to remove lock file:', error.message);
}

// 1.5. Kill all zombie node processes related to this project (Windows)
if (process.platform === 'win32') {
  console.log('🔍 Killing zombie node processes from previous dev sessions...');
  try {
    // Use WMIC to find node.exe processes with our project path in the command line
    const wmicOutput = execSync(
      'wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const currentPid = process.pid;
    const parentPid = process.ppid;
    let killedCount = 0;

    const lines = wmicOutput.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      // CSV format: Node,CommandLine,ProcessId
      const parts = line.split(',');
      if (parts.length < 3) continue;

      const pid = parseInt(parts[parts.length - 1].trim(), 10);
      const cmdLine = parts.slice(1, -1).join(',');

      if (isNaN(pid) || pid === currentPid || pid === parentPid) continue;

      // Match processes related to our project
      const isProjectProcess =
        cmdLine.includes('sepilot_desktop') ||
        cmdLine.includes('sepilot-desktop') ||
        (cmdLine.includes('tsup') && cmdLine.includes('watch')) ||
        (cmdLine.includes('next') && cmdLine.includes('dev')) ||
        cmdLine.includes('watch-extensions') ||
        cmdLine.includes('concurrently');

      if (isProjectProcess) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          killedCount++;
        } catch (e) {
          // Process may already be dead
        }
      }
    }

    if (killedCount > 0) {
      console.log(`✅ Killed ${killedCount} zombie node process(es)`);
    } else {
      console.log('ℹ️  No zombie node processes found');
    }
  } catch (e) {
    // WMIC not available or error - skip silently
    console.log('ℹ️  Skipped zombie process check');
  }
}

// 2. 포트 3000이 사용 중인지 확인 및 종료 (기본적으로 실행)
const skipKillProcesses = process.argv.includes('--skip-kill-processes');
const killProcesses = !skipKillProcesses;

if (killProcesses) {
  console.log('🔍 Checking for running processes on port 3000...');

  try {
    const platform = process.platform;

    if (platform === 'win32') {
      // Windows: netstat으로 포트 3000 사용 프로세스 찾기
      try {
        const output = execSync('netstat -ano | findstr :3000', { encoding: 'utf8' });
        const lines = output.trim().split('\n');
        const pids = new Set();

        lines.forEach((line) => {
          const match = line.match(/LISTENING\s+(\d+)/);
          if (match) {
            pids.add(match[1]);
          }
        });

        if (pids.size > 0) {
          console.log(`Found ${pids.size} process(es) using port 3000`);

          pids.forEach((pid) => {
            // 프로세스 정보 조회
            try {
              const processInfo = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
              }).trim();

              if (processInfo) {
                const processName = processInfo.split(',')[0].replace(/"/g, '');
                console.log(`  📍 PID ${pid}: ${processName}`);
              }
            } catch (e) {
              // 프로세스 정보 조회 실패 (이미 종료되었을 수 있음)
            }

            // 프로세스 종료 시도
            let killed = false;
            const killCommands = [
              `taskkill /F /PID ${pid}`,
              `taskkill //F //PID ${pid}`, // Git Bash compatibility
            ];

            for (const cmd of killCommands) {
              if (killed) break;

              try {
                execSync(cmd, {
                  encoding: 'utf8',
                  stdio: ['pipe', 'pipe', 'pipe'],
                });
                console.log(`  ✅ Killed process ${pid}`);
                killed = true;
              } catch (e) {
                // 다음 명령 시도
              }
            }

            if (!killed) {
              try {
                // 마지막 시도: 에러 메시지 확인
                execSync(`taskkill /F /PID ${pid}`, {
                  encoding: 'utf8',
                  stdio: ['pipe', 'pipe', 'pipe'],
                });
              } catch (e) {
                const errorMsg = e.message || '';

                if (errorMsg.includes('Access is denied') || errorMsg.includes('액세스가 거부')) {
                  console.error(`  ❌ Failed to kill process ${pid}: Access denied`);
                  console.error(`     💡 Try running this command as Administrator`);
                } else if (
                  errorMsg.includes('not found') ||
                  errorMsg.includes('찾을 수 없습니다')
                ) {
                  console.log(`  ℹ️  Process ${pid} already terminated`);
                } else {
                  console.error(`  ⚠️  Failed to kill process ${pid}`);
                  if (errorMsg) {
                    console.error(`     Error: ${errorMsg.split('\n')[0]}`);
                  }
                }
              }
            }
          });
        } else {
          console.log('ℹ️  No processes found on port 3000');
        }
      } catch (e) {
        console.log('ℹ️  No processes found on port 3000');
      }
    } else {
      // Unix-like (macOS, Linux)
      try {
        const pid = execSync('lsof -ti:3000', { encoding: 'utf8' }).trim();
        if (pid) {
          execSync(`kill -9 ${pid}`);
          console.log(`✅ Killed process ${pid} on port 3000`);
        } else {
          console.log('ℹ️  No processes found on port 3000');
        }
      } catch (e) {
        console.log('ℹ️  No processes found on port 3000');
      }
    }
  } catch (error) {
    console.error('⚠️  Error checking/killing processes:', error.message);
  }
}

// 3. Electron 프로세스 종료 (좀비 프로세스 정리)
if (killProcesses) {
  console.log('🔍 Checking for running Electron processes...');
  try {
    const isWin = process.platform === 'win32';
    const processesToKill = isWin
      ? ['electron.exe', 'app-builder.exe']
      : ['electron', 'app-builder'];

    processesToKill.forEach((proc) => {
      try {
        const cmd = isWin ? `taskkill /F /IM ${proc} /T` : `pkill -f ${proc}`;

        execSync(cmd, { stdio: 'ignore' });
        console.log(`✅ Killed running ${proc} processes`);
      } catch (e) {
        // 프로세스가 없으면 에러가 발생하므로 무시
      }
    });
  } catch (e) {
    console.error('⚠️  Failed to kill Electron processes:', e.message);
  }
}

// 프로세스 종료 후 잠시 대기 (파일 잠금 해제 시간 확보)
if (killProcesses) {
  const sleepEnd = Date.now() + 2000;
  while (Date.now() < sleepEnd) {}
}

// --processes-only 모드면 여기서 종료
if (processesOnly) {
  console.log('✨ Process cleanup complete!');
  process.exit(0);
}

// 4. 빌드 아티팩트 정리 (dist, release)
console.log('🗑️  Cleaning build artifacts...');
const dirsToRemove = [
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, '..', 'release'),
  path.join(__dirname, '..', 'out'),
];

const deleteWithRetry = (dirPath, attempt = 1) => {
  if (!fs.existsSync(dirPath)) return;

  try {
    // Node.js 14.14+ 지원: maxRetries, retryDelay
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
    console.log(`✅ Removed ${path.basename(dirPath)} directory`);
  } catch (e) {
    if (attempt <= 3) {
      console.log(`⚠️  Failed to remove ${path.basename(dirPath)}, retrying... (${attempt}/3)`);
      const wait = Date.now() + 1500;
      while (Date.now() < wait) {}
      deleteWithRetry(dirPath, attempt + 1);
    } else {
      console.error(`❌ CRITICAL: Failed to remove ${path.basename(dirPath)}: ${e.message}`);
      console.error(
        '👉 Please manually close any programs (VS Code, Explorer, etc.) using this folder.'
      );
      process.exit(1);
    }
  }
};

dirsToRemove.forEach((dir) => deleteWithRetry(dir));

console.log('✨ Dev environment & build artifacts cleaned!');

if (!skipKillProcesses) {
  console.log('');
  console.log('💡 Tip: Run with --skip-kill-processes to skip process termination');
  console.log('   Example: npm run clean:dev -- --skip-kill-processes');
}
