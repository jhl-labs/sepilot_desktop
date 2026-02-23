#!/usr/bin/env node

/**
 * Extension lib/ 디렉토리의 TypeScript 파일을 JavaScript로 변환하는 스크립트
 * esbuild를 사용하여 TypeScript 문법을 제거
 */

const fs = require('fs');
const path = require('path');
const { transformSync } = require('esbuild');

const NODE_MODULES_DIR = path.join(__dirname, '..', 'node_modules', '@sepilot');

console.log('\n🔧 Converting TypeScript files in Extension lib/ directories...\n');

/**
 * esbuild를 사용하여 TypeScript를 JavaScript로 변환
 */
function convertFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);

    const result = transformSync(content, {
      loader: ext === '.tsx' ? 'tsx' : 'ts',
      format: 'esm',
      target: 'es2020',
    });

    const newPath = filePath.replace(/\.tsx?$/, '.js');
    fs.writeFileSync(newPath, result.code, 'utf8');

    // 원본 TypeScript 파일 삭제 (.ts/.tsx)
    if (filePath !== newPath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return true;
  } catch (error) {
    console.log(`  ⚠️  Failed to convert ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * 재귀적으로 TypeScript 파일을 JavaScript로 변환
 */
function convertFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return 0;

  let convertedCount = 0;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      convertedCount += convertFilesRecursively(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      if (convertFile(fullPath)) {
        convertedCount++;
      }
    }
  }

  return convertedCount;
}

// node_modules/@sepilot/ 내 모든 extension-* 디렉토리 찾기
if (!fs.existsSync(NODE_MODULES_DIR)) {
  console.log('⚠️  node_modules/@sepilot/ directory not found. Skipping...');
  process.exit(0);
}

const extensionDirs = fs
  .readdirSync(NODE_MODULES_DIR)
  .filter((dir) => dir.startsWith('extension-'));

if (extensionDirs.length === 0) {
  console.log('⚠️  No Extensions found in node_modules/@sepilot/. Skipping...');
  process.exit(0);
}

let totalConverted = 0;

for (const extDir of extensionDirs) {
  const libPath = path.join(NODE_MODULES_DIR, extDir, 'lib');

  if (!fs.existsSync(libPath)) {
    continue;
  }

  const convertedCount = convertFilesRecursively(libPath);
  if (convertedCount > 0) {
    console.log(`  ✓ ${extDir}: converted ${convertedCount} file(s)`);
    totalConverted += convertedCount;
  }
}

console.log();
if (totalConverted > 0) {
  console.log(`✅ Converted ${totalConverted} TypeScript file(s) to JavaScript\n`);
} else {
  console.log('✅ No TypeScript files found in Extension lib/ directories\n');
}
