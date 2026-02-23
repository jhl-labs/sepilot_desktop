#!/usr/bin/env node

/**
 * 모든 Extension을 .sepx 파일로 패키징하는 스크립트
 *
 * Usage:
 *   node scripts/package-all-extensions.js
 *
 * 동작:
 *   1. resources/extensions/ 디렉토리의 모든 extension 스캔
 *   2. manifest.json이 있는 extension만 패키징
 *   3. extensions/ 폴더에 .sepx 파일 생성
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXTENSIONS_SOURCE = path.join(__dirname, '../resources/extensions');
const EXTENSIONS_OUTPUT = path.join(__dirname, '../extensions');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

/**
 * Extension 디렉토리에서 빌드 가능한 extension 목록 반환
 */
function discoverExtensions() {
  const extensions = [];

  if (!fs.existsSync(EXTENSIONS_SOURCE)) {
    return extensions;
  }

  const entries = fs.readdirSync(EXTENSIONS_SOURCE, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const extPath = path.join(EXTENSIONS_SOURCE, entry.name);
    const manifestPath = path.join(extPath, 'manifest.json');

    // manifest.json이 있는 extension만 대상
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        extensions.push({
          id: manifest.id || entry.name,
          version: manifest.version || '0.0.0',
          path: extPath,
          manifestPath,
          manifest,
        });
      } catch (error) {
        console.warn(
          `${COLORS.yellow}  ⚠️  ${entry.name}: Invalid manifest.json${COLORS.reset}`
        );
      }
    }
  }

  return extensions;
}

/**
 * 단일 extension을 .sepx 파일로 패키징
 */
function packageExtension(extension) {
  const { id, version, path: extPath, manifest } = extension;

  // 출력 파일 경로
  const outputPath = path.join(EXTENSIONS_OUTPUT, `${id}-${version}.sepx`);

  console.log(`${COLORS.cyan}  📦 Packaging ${id}@${version}...${COLORS.reset}`);

  // ZIP 아카이브 생성
  const zip = new AdmZip();

  // 1. manifest.json
  const manifestPath = path.join(extPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    zip.addLocalFile(manifestPath);
    console.log(`     ✓ manifest.json`);
  }

  // 2. package.json (optional)
  const packageJsonPath = path.join(extPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    zip.addLocalFile(packageJsonPath);
    console.log(`     ✓ package.json`);
  }

  // 3. dist/ 폴더 (빌드된 파일)
  const distPath = path.join(extPath, 'dist');
  if (fs.existsSync(distPath)) {
    zip.addLocalFolder(distPath, 'dist');
    console.log(`     ✓ dist/`);
  } else {
    console.warn(
      `${COLORS.yellow}     ⚠️  dist/ not found - run build:extensions first!${COLORS.reset}`
    );
    return false;
  }

  // 4. assets/ 폴더 (optional)
  const assetsPath = path.join(extPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    zip.addLocalFolder(assetsPath, 'assets');
    console.log(`     ✓ assets/`);
  }

  // 5. locales/ 폴더 (optional) - src/locales도 확인
  const localesPath = path.join(extPath, 'locales');
  const srcLocalesPath = path.join(extPath, 'src', 'locales');
  if (fs.existsSync(localesPath)) {
    zip.addLocalFolder(localesPath, 'locales');
    console.log(`     ✓ locales/`);
  } else if (fs.existsSync(srcLocalesPath)) {
    zip.addLocalFolder(srcLocalesPath, 'locales');
    console.log(`     ✓ locales/ (from src/locales)`);
  }

  // 6. README.md (optional)
  const readmePath = path.join(extPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    zip.addLocalFile(readmePath);
    console.log(`     ✓ README.md`);
  }

  // ZIP 파일 저장
  zip.writeZip(outputPath);

  const stats = fs.statSync(outputPath);
  const sizeKB = (stats.size / 1024).toFixed(2);
  console.log(
    `${COLORS.green}     ✓ Created: ${path.basename(outputPath)} (${sizeKB} KB)${COLORS.reset}`
  );

  return true;
}

// Main
console.log(`\n${COLORS.cyan}📦 Packaging All Extensions to .sepx...${COLORS.reset}\n`);

// 출력 디렉토리 생성
if (!fs.existsSync(EXTENSIONS_OUTPUT)) {
  fs.mkdirSync(EXTENSIONS_OUTPUT, { recursive: true });
}

// Extension 탐색
const extensions = discoverExtensions();

if (extensions.length === 0) {
  console.log(
    `${COLORS.yellow}  ⚠️  No extensions found in ${EXTENSIONS_SOURCE}${COLORS.reset}\n`
  );
  process.exit(0);
}

console.log(
  `${COLORS.cyan}  Found ${extensions.length} extension(s): ${extensions.map((e) => e.id).join(', ')}${COLORS.reset}\n`
);

let packagedCount = 0;
let failedCount = 0;

for (const extension of extensions) {
  try {
    const success = packageExtension(extension);
    if (success) {
      packagedCount++;
    } else {
      failedCount++;
    }
  } catch (error) {
    console.error(
      `${COLORS.red}  ✗ ${extension.id}: ${error.message}${COLORS.reset}`
    );
    failedCount++;
  }
}

console.log();
console.log('='.repeat(60));
console.log(`${COLORS.green}✅ Extension packaging complete${COLORS.reset}`);
console.log(`   Extensions packaged: ${packagedCount}`);
console.log(`   Extensions failed: ${failedCount}`);
console.log(`   Output directory: ${EXTENSIONS_OUTPUT}`);
console.log('='.repeat(60));
console.log();

// 패키징된 파일 목록 출력
const sepxFiles = fs
  .readdirSync(EXTENSIONS_OUTPUT)
  .filter((f) => f.endsWith('.sepx'));
if (sepxFiles.length > 0) {
  console.log(`${COLORS.cyan}📋 Generated .sepx files:${COLORS.reset}`);
  for (const file of sepxFiles) {
    const filePath = path.join(EXTENSIONS_OUTPUT, file);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`   - ${file} (${sizeKB} KB)`);
  }
  console.log();
}

process.exit(failedCount > 0 ? 1 : 0);
