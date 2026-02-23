#!/usr/bin/env node

/**
 * Extension 빌드 스크립트
 *
 * Extension 디렉토리에서 tsup을 실행하여 빌드합니다.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/build-extension.js <extension-dir>');
  console.error('Example: node scripts/build-extension.js sepilot-desktop-extension-editor');
  process.exit(1);
}

const extensionDir = args[0];
const extensionPath = path.join(__dirname, '..', extensionDir);

if (!fs.existsSync(extensionPath)) {
  console.error(`Extension directory not found: ${extensionPath}`);
  process.exit(1);
}

console.log(`\n🔨 Building Extension: ${extensionDir}\n`);

try {
  // tsup.config.ts 파일 경로
  const tsupConfig = path.join(extensionPath, 'tsup.config.ts');

  if (!fs.existsSync(tsupConfig)) {
    console.error(`tsup.config.ts not found in ${extensionPath}`);
    process.exit(1);
  }

  // 메인 프로젝트의 node_modules에서 tsup 실행
  const tsupBin = path.join(__dirname, '..', 'node_modules', '.bin', 'tsup');

  execSync(`"${tsupBin}"`, {
    cwd: extensionPath,
    stdio: 'inherit',
  });

  console.log(`\n✅ Extension built successfully: ${extensionDir}\n`);
} catch (error) {
  console.error(`\n❌ Failed to build Extension: ${error.message}\n`);
  process.exit(1);
}
