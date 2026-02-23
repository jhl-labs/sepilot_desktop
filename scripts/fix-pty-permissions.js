#!/usr/bin/env node

/**
 * node-pty spawn-helper 실행 권한 수정 스크립트
 *
 * pnpm이 패키지 설치 시 바이너리 실행 권한을 보존하지 않는 경우가 있어
 * spawn-helper에 +x 권한을 수동으로 부여합니다.
 * 권한이 없으면 posix_spawnp() 호출 시 "posix_spawnp failed" 에러 발생.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Windows에서는 실행 권한이 불필요
if (os.platform() === 'win32') {
  process.exit(0);
}

const nodePtyDir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');

if (!fs.existsSync(nodePtyDir)) {
  // node-pty가 없으면 (optionalDependency이므로) 조용히 종료
  process.exit(0);
}

let fixed = 0;

try {
  const platforms = fs.readdirSync(nodePtyDir);

  for (const platform of platforms) {
    const spawnHelper = path.join(nodePtyDir, platform, 'spawn-helper');

    if (!fs.existsSync(spawnHelper)) {
      continue;
    }

    try {
      const stat = fs.statSync(spawnHelper);
      const hasExecute = (stat.mode & 0o111) !== 0;

      if (!hasExecute) {
        fs.chmodSync(spawnHelper, 0o755);
        console.log(`  ✓ Fixed execute permission: ${platform}/spawn-helper`);
        fixed++;
      }
    } catch (err) {
      console.warn(`  ⚠️  Failed to fix ${platform}/spawn-helper: ${err.message}`);
    }
  }
} catch (err) {
  console.warn(`  ⚠️  Failed to scan node-pty prebuilds: ${err.message}`);
}

if (fixed > 0) {
  console.log(`✅ Fixed ${fixed} spawn-helper permission(s)\n`);
}
