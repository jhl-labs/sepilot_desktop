#!/usr/bin/env node

/**
 * Built-in Extension 번들링 스크립트
 *
 * extensions/*.sepx 파일을 resources/extensions/로 추출
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXTENSIONS_SOURCE = path.join(__dirname, '../extensions');
const EXTENSIONS_DEST = path.join(__dirname, '../resources/extensions');

console.log('\n📦 Bundling Built-in Extensions from .sepx files...\n');

// extensions/*.sepx 파일 확인
if (!fs.existsSync(EXTENSIONS_SOURCE)) {
  console.log('⚠️  extensions/ directory not found. Skipping Extension bundling.');
  process.exit(0);
}

const sepxFiles = fs.readdirSync(EXTENSIONS_SOURCE).filter((f) => f.endsWith('.sepx'));

if (sepxFiles.length === 0) {
  console.log('⚠️  No .sepx files found in extensions/. Skipping Extension bundling.');
  process.exit(0);
}

// resources/extensions 디렉토리 생성
if (!fs.existsSync(EXTENSIONS_DEST)) {
  fs.mkdirSync(EXTENSIONS_DEST, { recursive: true });
}

let bundledCount = 0;
let skippedCount = 0;

for (const sepxFile of sepxFiles) {
  const sepxPath = path.join(EXTENSIONS_SOURCE, sepxFile);

  try {
    // ZIP 파일 읽기
    const zip = new AdmZip(sepxPath);

    // manifest.json 추출
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      console.log(`  ✗ ${sepxFile}: No manifest.json found`);
      skippedCount++;
      continue;
    }

    const manifestContent = manifestEntry.getData().toString('utf-8');
    const manifest = JSON.parse(manifestContent);

    // Extension ID/Version 검증
    if (!manifest.id || !manifest.version) {
      console.log(`  ✗ ${sepxFile}: Invalid manifest (missing id or version)`);
      skippedCount++;
      continue;
    }

    // Extension ID 검증 (Path Traversal 방지)
    // 영문 소문자, 숫자, 하이픈만 허용
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      console.log(
        `  ✗ ${sepxFile}: Invalid extension ID (only lowercase, numbers, hyphens allowed)`
      );
      skippedCount++;
      continue;
    }

    // 추출 경로: resources/extensions/{extension-id}/
    const destPath = path.join(EXTENSIONS_DEST, manifest.id);

    // Path Traversal 공격 방지 검증
    const normalizedDest = path.resolve(destPath);
    const normalizedBase = path.resolve(EXTENSIONS_DEST);
    if (!normalizedDest.startsWith(normalizedBase + path.sep)) {
      console.log(`  ✗ ${sepxFile}: Path traversal detected (security violation)`);
      skippedCount++;
      continue;
    }

    // 기존 디렉토리 제거 (Windows 파일 잠금 문제 대응)
    if (fs.existsSync(destPath)) {
      try {
        // node_modules만 삭제 (잠금 문제 최소화)
        const nmPath = path.join(destPath, 'node_modules');
        if (fs.existsSync(nmPath)) {
          fs.rmSync(nmPath, { recursive: true, force: true });
        }
      } catch (err) {
        console.log(`  ⚠️  ${manifest.id}: Could not remove node_modules (will overwrite)`);
      }
    }

    // ZIP 압축 해제 (덮어쓰기)
    zip.extractAllTo(destPath, true);

    console.log(`  ✓ ${manifest.id}@${manifest.version}`);
    bundledCount++;
  } catch (error) {
    console.log(`  ✗ ${sepxFile}: ${error.message}`);
    skippedCount++;
  }
}

console.log();
console.log('='.repeat(60));
console.log(`✅ Built-in Extension bundling complete`);
console.log(`   Extensions bundled: ${bundledCount}`);
console.log(`   Extensions skipped: ${skippedCount}`);
console.log('='.repeat(60));
console.log();

/**
 * 디렉토리 재귀 복사
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
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
