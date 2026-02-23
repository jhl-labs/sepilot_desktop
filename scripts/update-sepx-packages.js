#!/usr/bin/env node

/**
 * .sepx 파일의 package.json에서 "type": "module" 제거
 *
 * Windows 호환성을 위해 모든 Extension 패키지에서 "type": "module"을 제거합니다.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');

console.log('\n🔧 Updating .sepx packages...\n');

if (!fs.existsSync(EXTENSIONS_DIR)) {
  console.log('⚠️  extensions/ directory not found.');
  process.exit(1);
}

const sepxFiles = fs.readdirSync(EXTENSIONS_DIR).filter((f) => f.endsWith('.sepx'));

if (sepxFiles.length === 0) {
  console.log('⚠️  No .sepx files found.');
  process.exit(0);
}

let updatedCount = 0;
let skippedCount = 0;

for (const sepxFile of sepxFiles) {
  const sepxPath = path.join(EXTENSIONS_DIR, sepxFile);

  try {
    // ZIP 파일 읽기
    const zip = new AdmZip(sepxPath);

    // package.json 찾기
    const packageEntry = zip.getEntry('package.json');
    if (!packageEntry) {
      console.log(`  ⊙ ${sepxFile}: No package.json found`);
      skippedCount++;
      continue;
    }

    // package.json 읽기
    const packageContent = packageEntry.getData().toString('utf-8');
    const packageJson = JSON.parse(packageContent);

    // "type": "module" 확인
    if (!packageJson.type || packageJson.type !== 'module') {
      console.log(`  ⊙ ${sepxFile}: Already correct`);
      skippedCount++;
      continue;
    }

    // "type": "module" 제거
    delete packageJson.type;

    // 업데이트된 package.json을 ZIP에 다시 추가
    zip.deleteFile('package.json');
    zip.addFile('package.json', Buffer.from(JSON.stringify(packageJson, null, 2) + '\n'));

    // ZIP 파일 덮어쓰기
    zip.writeZip(sepxPath);

    console.log(`  ✓ ${sepxFile}: Updated`);
    updatedCount++;
  } catch (error) {
    console.log(`  ✗ ${sepxFile}: ${error.message}`);
    skippedCount++;
  }
}

console.log();
console.log('='.repeat(60));
console.log(`✅ Update complete`);
console.log(`   Extensions updated: ${updatedCount}`);
console.log(`   Extensions skipped: ${skippedCount}`);
console.log('='.repeat(60));
console.log();
