#!/usr/bin/env node

/**
 * Workspace Extension 빌드 스크립트
 *
 * resources/extensions/ 디렉토리를 동적으로 스캔하여
 * tsup.config.ts와 package.json이 있는 모든 Extension을 자동 빌드합니다.
 * pnpm install 시 postinstall에서 자동 실행됩니다.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { wrapExtension } = require('./wrap-extension-renderer');

const EXTENSIONS_DIR = path.join(__dirname, '../resources/extensions');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

/**
 * resources/extensions/ 디렉토리를 스캔하여 빌드 가능한 Extension 목록 반환
 */
function discoverExtensions() {
  const extensions = [];

  if (!fs.existsSync(EXTENSIONS_DIR)) {
    return extensions;
  }

  const entries = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const extPath = path.join(EXTENSIONS_DIR, entry.name);
    const pkgPath = path.join(extPath, 'package.json');
    const tsupConfigPath = path.join(extPath, 'tsup.config.ts');

    // package.json과 tsup.config.ts가 모두 있는 Extension만 대상
    if (fs.existsSync(pkgPath) && fs.existsSync(tsupConfigPath)) {
      extensions.push({
        id: entry.name,
        path: extPath,
      });
    }
  }

  return extensions;
}

/**
 * 디렉토리의 최신 수정 시간을 재귀적으로 가져오기
 * @param {string} dirPath - 디렉토리 경로
 * @returns {number} - 최신 mtime (ms)
 */
function getLatestMtime(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let latestMtime = stats.mtimeMs;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // node_modules, .git 등 제외
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const entryMtime = entry.isDirectory()
      ? getLatestMtime(fullPath)
      : fs.statSync(fullPath).mtimeMs;

    if (entryMtime > latestMtime) {
      latestMtime = entryMtime;
    }
  }

  return latestMtime;
}

/**
 * Extension이 재빌드 필요한지 확인
 * @param {object} extension - Extension 정보
 * @returns {boolean} - 재빌드 필요 여부
 */
function needsRebuild(extension) {
  const distPath = path.join(extension.path, 'dist');

  // dist가 없으면 빌드 필요
  if (!fs.existsSync(distPath)) {
    return true;
  }

  // dist/index.js가 없으면 빌드 필요 (불완전한 빌드 감지)
  const indexPath = path.join(distPath, 'index.js');
  if (!fs.existsSync(indexPath)) {
    return true;
  }

  const srcPath = path.join(extension.path, 'src');
  if (!fs.existsSync(srcPath)) {
    return false; // src도 없으면 스킵
  }

  // src의 최신 수정 시간과 dist의 최신 수정 시간 비교
  const srcMtime = getLatestMtime(srcPath);
  const distMtime = getLatestMtime(distPath);

  return srcMtime > distMtime;
}

/**
 * Extension을 순차적으로 빌드하는 함수
 * @param {Array} extensions - 빌드할 Extension 목록
 * @returns {Promise<{built: number, skipped: number, failed: number}>}
 */
async function buildExtensionsSequential(extensions) {
  const results = { built: 0, skipped: 0, failed: 0 };

  // 빌드 필요한 Extension과 스킵할 Extension 분리
  const toBuild = [];
  const toSkip = [];

  for (const extension of extensions) {
    if (needsRebuild(extension)) {
      toBuild.push(extension);
    } else {
      toSkip.push(extension);
    }
  }

  // 스킵할 Extension 출력
  for (const extension of toSkip) {
    console.log(
      `${COLORS.yellow}  ⊙ ${extension.id}: Already built, skipping build step${COLORS.reset}`
    );
    results.skipped++;
  }

  // 순차 빌드 실행
  if (toBuild.length > 0) {
    console.log(
      `${COLORS.cyan}  🚀 Building ${toBuild.length} extension(s) sequentially...${COLORS.reset}\n`
    );

    for (const extension of toBuild) {
      const success = await new Promise((resolve) => {
        console.log(`${COLORS.cyan}  🔨 Building ${extension.id}...${COLORS.reset}`);

        // Windows: pnpm 대신 pnpm.cmd 사용
        const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

        const child = spawn(cmd, ['run', 'build'], {
          cwd: extension.path,
          stdio: 'inherit', // 실시간 로그 출력
          shell: true,
          env: { ...process.env }, // 환경변수 상속
        });

        child.on('close', (code) => {
          if (code === 0) {
            console.log(`${COLORS.green}  ✓ ${extension.id} built successfully${COLORS.reset}\n`);
            resolve(true);
          } else {
            console.error(
              `${COLORS.red}  ✗ ${extension.id} build failed (exit code ${code})${COLORS.reset}\n`
            );
            resolve(false);
          }
        });

        child.on('error', (error) => {
          console.error(
            `${COLORS.red}  ✗ ${extension.id} build error: ${error.message}${COLORS.reset}\n`
          );
          resolve(false);
        });
      });

      if (success) {
        results.built++;
      } else {
        results.failed++;
      }
    }
  }

  return results;
}

/**
 * 모든 Extension에 대해 renderer.js 래핑 수행
 * @param {Array} extensions - Extension 목록
 */
function wrapAllExtensions(extensions) {
  console.log(`\n${COLORS.cyan}  📦 Wrapping renderer bundles...${COLORS.reset}\n`);

  for (const extension of extensions) {
    try {
      wrapExtension(extension.path);
      console.log(`${COLORS.cyan}  ✓ ${extension.id}: renderer.js wrapped${COLORS.reset}`);
    } catch (wrapError) {
      console.warn(
        `${COLORS.yellow}  ⚠️  ${extension.id}: Failed to wrap renderer.js${COLORS.reset}`
      );
      console.warn(`     ${wrapError.message}`);
    }
  }
}

console.log(`\n${COLORS.cyan}🔧 Building Workspace Extensions...${COLORS.reset}\n`);

const extensions = discoverExtensions();

if (extensions.length === 0) {
  console.log(`${COLORS.yellow}  ⚠️  No buildable extensions found${COLORS.reset}\n`);
  process.exit(0);
}

console.log(
  `${COLORS.cyan}  Found ${extensions.length} extension(s): ${extensions.map((e) => e.id).join(', ')}${COLORS.reset}\n`
);

// 순차 빌드 실행
(async () => {
  const results = await buildExtensionsSequential(extensions);

  // 모든 Extension 래핑
  wrapAllExtensions(extensions);

  // 결과 출력
  console.log();
  console.log('='.repeat(60));
  console.log(`${COLORS.green}✅ Workspace Extension build complete${COLORS.reset}`);
  console.log(`   Extensions built: ${results.built}`);
  console.log(`   Extensions skipped: ${results.skipped}`);
  if (results.failed > 0) {
    console.log(`${COLORS.red}   Extensions failed: ${results.failed}${COLORS.reset}`);
  }
  console.log('='.repeat(60));
  console.log();

  // 빌드 실패 시 exit code 1
  process.exit(results.failed > 0 ? 1 : 0);
})();
