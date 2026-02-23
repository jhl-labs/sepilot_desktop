#!/usr/bin/env node

/**
 * Extension Imports Auto-Generator
 *
 * resources/extensions/ 디렉토리를 스캔하여
 * lib/extensions/extension-imports.ts를 자동 생성합니다.
 *
 * 개발 모드에서만 사용되며, webpack import를 위한 static mapping을 생성합니다.
 * 프로덕션에서는 runtime loading을 사용하므로 이 파일이 필요 없습니다.
 *
 * Usage:
 *   node scripts/generate-extension-imports.js
 */

const fs = require('fs');
const path = require('path');

const EXTENSIONS_DIR = path.join(__dirname, '..', 'resources', 'extensions');
const OUTPUT_FILE = path.join(__dirname, '..', 'lib', 'extensions', 'extension-imports.ts');

/**
 * Extension 디렉토리 스캔
 */
function scanExtensions() {
  if (!fs.existsSync(EXTENSIONS_DIR)) {
    console.error(`❌ Extensions directory not found: ${EXTENSIONS_DIR}`);
    return [];
  }

  const entries = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
  const extensionDirs = entries.filter((entry) => entry.isDirectory());

  const extensions = [];

  for (const dir of extensionDirs) {
    const extensionPath = path.join(EXTENSIONS_DIR, dir.name);
    const manifestPath = path.join(extensionPath, 'manifest.json');
    const packageJsonPath = path.join(extensionPath, 'package.json');
    const srcPath = path.join(extensionPath, 'src');

    // manifest.json이 존재하는지 확인
    if (!fs.existsSync(manifestPath)) {
      console.warn(`⚠️  Skipping ${dir.name} (no manifest.json found)`);
      continue;
    }

    // src 디렉토리가 존재하는지 확인 (빌드 가능한 extension만 포함)
    if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isDirectory()) {
      console.warn(`⚠️  Skipping ${dir.name} (no src directory found - extension not buildable)`);
      continue;
    }

    // package.json 읽기 (Extension ID 추출)
    let extensionId = dir.name;
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        // @sepilot/extension-{id} → {id}
        const match = packageJson.name?.match(/@sepilot\/extension-(.+)/);
        if (match) {
          extensionId = match[1];
        }
      } catch (error) {
        console.warn(`⚠️  Failed to parse package.json for ${dir.name}:`, error.message);
      }
    }

    extensions.push({
      id: extensionId,
      packageName: `@sepilot/extension-${extensionId}`,
    });
  }

  return extensions;
}

/**
 * extension-imports.ts 생성
 */
function generateImportsFile(extensions) {
  const imports = extensions
    .map((ext) => {
      return `  '${ext.id}': () => import('${ext.packageName}'),`;
    })
    .join('\n');

  const content = `/**
 * Extension Importers (Auto-generated)
 *
 * ⚠️  DO NOT EDIT MANUALLY
 * 이 파일은 scripts/generate-extension-imports.js에 의해 자동 생성됩니다.
 *
 * 개발 모드에서만 사용되며, webpack의 동적 import를 위한 static mapping을 제공합니다.
 * 프로덕션에서는 runtime loading (sepilot-ext:// protocol)을 사용하므로 이 파일이 필요 없습니다.
 *
 * Generated: ${new Date().toISOString()}
 */

export const EXTENSION_IMPORTERS: Record<string, () => Promise<any>> = {
${imports}
};
`;

  // 출력 디렉토리 확인
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 파일 쓰기
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  console.log(`✅ Generated extension imports: ${OUTPUT_FILE}`);
  console.log(`   Extensions: ${extensions.map((e) => e.id).join(', ')}`);
}

/**
 * Main
 */
function main() {
  console.log('\n🔍 Scanning extensions...\n');

  const extensions = scanExtensions();

  if (extensions.length === 0) {
    console.warn('⚠️  No extensions found. Creating empty extension-imports.ts');
    generateImportsFile([]);
    return;
  }

  console.log(`\n📦 Found ${extensions.length} extension(s):\n`);
  extensions.forEach((ext) => {
    console.log(`   - ${ext.id} (${ext.packageName})`);
  });

  console.log('\n📝 Generating extension-imports.ts...\n');
  generateImportsFile(extensions);

  console.log('\n✅ Done!\n');
}

// CLI 실행
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  scanExtensions,
  generateImportsFile,
};
