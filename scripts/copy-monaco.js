#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Monaco Editor 파일을 public 디렉토리로 복사
 * postinstall 및 prebuild 스크립트로 실행됨
 */

const sourceDir = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs');
const targetDir = path.join(__dirname, '..', 'public', 'monaco', 'vs');

function copyDir(src, dest) {
  // 대상 디렉토리 생성
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // 소스 디렉토리 읽기
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('[Monaco] Copying Monaco Editor files to public directory...');
try {
  if (!fs.existsSync(sourceDir)) {
    console.log('[Monaco] Source directory not found, skipping...');
    process.exit(0);
  }

  copyDir(sourceDir, targetDir);
  console.log('[Monaco] ✓ Monaco Editor files copied successfully');
} catch (error) {
  console.error('[Monaco] ✗ Failed to copy Monaco Editor files:', error.message);
  process.exit(1);
}
