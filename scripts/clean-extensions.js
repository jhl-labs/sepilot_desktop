#!/usr/bin/env node
/**
 * Extension 완전 정리 스크립트
 * - 모든 dist 폴더 삭제
 * - .sepx 파일 삭제
 * - node_modules의 Extension 캐시 삭제
 * - Next.js 캐시 삭제
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning all Extension artifacts...\n');

const EXTENSIONS_DIR = path.join(__dirname, '..', 'resources', 'extensions');

// resources/extensions/ 하위 Extension dist 폴더 동적 탐색
function getExtensionDistPaths() {
  if (!fs.existsSync(EXTENSIONS_DIR)) return [];

  return fs
    .readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `resources/extensions/${entry.name}/dist`);
}

const extensionDistPaths = getExtensionDistPaths();

const pathsToClean = [
  // Extension dist 폴더들 (동적 탐색)
  ...extensionDistPaths,

  // .sepx 파일들
  'extensions/',

  // Next.js 캐시
  '.next',
  'node_modules/.cache',

  // Extension SDK는 src를 직접 사용하므로 dist 삭제 불필요
];

let cleaned = 0;
let skipped = 0;

pathsToClean.forEach((p) => {
  const fullPath = path.resolve(process.cwd(), p);
  if (fs.existsSync(fullPath)) {
    console.log(`  ❌ Removing: ${p}`);
    fs.rmSync(fullPath, { recursive: true, force: true });
    cleaned++;
  } else {
    console.log(`  ⊙ Skipped (not found): ${p}`);
    skipped++;
  }
});

console.log('\n' + '='.repeat(60));
console.log(`✅ Cleanup complete!`);
console.log(`   Removed: ${cleaned} paths`);
console.log(`   Skipped: ${skipped} paths`);
console.log('='.repeat(60));
