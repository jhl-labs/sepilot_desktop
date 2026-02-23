/**
 * Extension .sepx Packaging Script
 *
 * Extension을 .sepx 파일로 패키징합니다.
 * VSCode의 vsce package와 유사한 동작
 *
 * Usage:
 *   node scripts/package-extension.js <extension-path>
 *   node scripts/package-extension.js resources/extensions/editor
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Extension을 .sepx 파일로 패키징
 */
async function packageExtension(extensionPath) {
  // manifest.json 읽기
  const manifestPath = path.join(extensionPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ manifest.json not found in ${extensionPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const { id, version } = manifest;

  // 출력 경로
  const outputDir = path.join(process.cwd(), 'extensions');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${id}-${version}.sepx`);

  console.log(`📦 Packaging Extension: ${id}@${version}`);
  console.log(`   Source: ${extensionPath}`);
  console.log(`   Output: ${outputPath}`);

  // ZIP 아카이브 생성
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }, // 최대 압축
  });

  // 이벤트 핸들러
  output.on('close', () => {
    const sizeKB = (archive.pointer() / 1024).toFixed(2);
    console.log(`✅ Package created: ${outputPath}`);
    console.log(`   Size: ${sizeKB} KB`);
  });

  archive.on('error', (err) => {
    console.error(`❌ Packaging failed:`, err);
    process.exit(1);
  });

  archive.pipe(output);

  // 파일 추가
  console.log('📂 Adding files to package...');

  // 1. manifest.json
  archive.file(manifestPath, { name: 'manifest.json' });
  console.log('   ✓ manifest.json');

  // 2. package.json (optional)
  const packageJsonPath = path.join(extensionPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    archive.file(packageJsonPath, { name: 'package.json' });
    console.log('   ✓ package.json');
  }

  // 3. dist/ 폴더 (빌드된 파일)
  const distPath = path.join(extensionPath, 'dist');
  if (fs.existsSync(distPath)) {
    archive.directory(distPath, 'dist');
    console.log('   ✓ dist/');
  } else {
    console.warn('   ⚠️  dist/ not found - run build first!');
  }

  // 4. assets/ 폴더 (optional)
  const assetsPath = path.join(extensionPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    archive.directory(assetsPath, 'assets');
    console.log('   ✓ assets/');
  }

  // 5. locales/ 폴더 (optional)
  const localesPath = path.join(extensionPath, 'locales');
  if (fs.existsSync(localesPath)) {
    archive.directory(localesPath, 'locales');
    console.log('   ✓ locales/');
  }

  // 6. README.md (optional)
  const readmePath = path.join(extensionPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    archive.file(readmePath, { name: 'README.md' });
    console.log('   ✓ README.md');
  }

  // 압축 완료
  await archive.finalize();
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/package-extension.js <extension-path>');
  console.error('Example: node scripts/package-extension.js resources/extensions/editor');
  process.exit(1);
}

const extensionPath = path.resolve(args[0]);
packageExtension(extensionPath).catch((error) => {
  console.error('❌ Packaging failed:', error);
  process.exit(1);
});
