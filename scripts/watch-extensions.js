#!/usr/bin/env node

/**
 * Extension Watch Script
 *
 * Built-in Extension들의 소스 코드 변경을 감지하여 자동으로 빌드합니다.
 * - resources/extensions/ 폴더의 모든 extension을 스캔
 * - package.json에 "dev" 스크립트가 있는 extension만 watch
 * - 각 extension의 dev 스크립트를 병렬로 실행 (tsup --watch)
 * - 파일 변경 시 자동으로 리빌드되어 .sepx 파일 생성
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EXTENSIONS_DIR = path.join(__dirname, '../resources/extensions');
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Extension 폴더에서 dev 스크립트가 있는 extension 찾기
 *
 * Editor와 Browser Extension은 resources/extensions/ 에서 직접 빌드됩니다.
 */
function findWatchableExtensions() {
  const extensions = [];

  try {
    const entries = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const extensionPath = path.join(EXTENSIONS_DIR, entry.name);
      const packageJsonPath = path.join(extensionPath, 'package.json');

      // package.json 확인
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // dev 스크립트가 있는지 확인
      if (packageJson.scripts && packageJson.scripts.dev) {
        extensions.push({
          id: entry.name,
          name: packageJson.name || entry.name,
          path: extensionPath,
          devScript: packageJson.scripts.dev,
        });
      }
    }
  } catch (error) {
    console.error(`${COLORS.red}❌ Error scanning extensions:${COLORS.reset}`, error);
    process.exit(1);
  }

  return extensions;
}

/**
 * Extension watch 프로세스 시작
 *
 * tsup의 --onSuccess에서 상대 경로가 cwd 불일치로 실패하는 문제를 회피하기 위해
 * wrap-extension-renderer.js의 절대 경로를 직접 주입합니다.
 */
function startExtensionWatch(extension, colorIndex) {
  const colors = [COLORS.cyan, COLORS.magenta, COLORS.yellow, COLORS.blue, COLORS.green];
  const color = colors[colorIndex % colors.length];

  // wrap-extension-renderer.js 절대 경로 주입 (tsup onSuccess cwd 불일치 문제 해결)
  const wrapScript = path.join(__dirname, 'wrap-extension-renderer.js');
  // --no-clean: build:extensions로 이미 빌드된 dist를 삭제하지 않도록
  const onSuccessCmd = `node ${wrapScript} .`;
  const tsupCommand = `pnpm exec tsup --watch --no-clean --onSuccess "${onSuccessCmd}"`;

  console.log(`${color}🔍 Watching ${extension.id}...${COLORS.reset} (${tsupCommand})`);

  // shell: false로 실행 — shell: true 시 --onSuccess 인자가 쪼개져서
  // wrap 스크립트 경로와 "."이 tsup entry로 오인식되는 버그 방지
  const child = spawn(
    'pnpm',
    ['exec', 'tsup', '--watch', '--no-clean', '--onSuccess', onSuccessCmd],
    {
      cwd: extension.path,
      stdio: 'pipe',
    }
  );

  // 출력에 prefix 추가
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach((line) => {
      if (line.trim()) {
        console.log(`${color}[${extension.id}]${COLORS.reset} ${line}`);
      }
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach((line) => {
      if (line.trim()) {
        console.error(
          `${color}[${extension.id}]${COLORS.reset} ${COLORS.red}${line}${COLORS.reset}`
        );
      }
    });
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(
        `${COLORS.red}❌ [${extension.id}] Watch process exited with code ${code}${COLORS.reset}`
      );
    }
  });

  return child;
}

/**
 * Main
 */
function main() {
  console.log(`\n${COLORS.cyan}🔍 Extension Watch Mode${COLORS.reset}\n`);

  const extensions = findWatchableExtensions();

  if (extensions.length === 0) {
    console.log(`${COLORS.yellow}⚠️  No watchable extensions found${COLORS.reset}`);
    console.log(
      `${COLORS.yellow}   Extensions must have a "dev" script in package.json${COLORS.reset}\n`
    );
    process.exit(0);
  }

  console.log(`${COLORS.green}✓ Found ${extensions.length} watchable extension(s):${COLORS.reset}`);
  extensions.forEach((ext) => {
    console.log(`  - ${ext.id} (${ext.name})`);
  });
  console.log();

  // 모든 extension watch 시작
  const processes = extensions.map((ext, index) => startExtensionWatch(ext, index));

  // Graceful shutdown - kill entire process tree on Windows
  const killAll = () => {
    console.log(`\n${COLORS.yellow}⏸️  Stopping extension watch...${COLORS.reset}`);
    processes.forEach((child) => {
      if (process.platform === 'win32') {
        // Windows: taskkill /T kills the entire process tree
        try {
          require('child_process').execSync(`taskkill /F /T /PID ${child.pid}`, {
            stdio: 'ignore',
          });
        } catch (e) {
          // Process may already be dead
        }
      } else {
        child.kill('SIGTERM');
      }
    });
    process.exit(0);
  };

  process.on('SIGINT', killAll);
  process.on('SIGTERM', killAll);
}

main();
