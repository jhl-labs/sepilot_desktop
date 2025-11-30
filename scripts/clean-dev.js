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

console.log('✨ Dev environment cleaned!');

if (!skipKillProcesses) {
  console.log('');
  console.log('💡 Tip: Run with --skip-kill-processes to skip process termination');
  console.log('   Example: npm run clean:dev -- --skip-kill-processes');
}
