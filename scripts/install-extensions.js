#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Extension 자동 설치 스크립트
 *
 * extensions/*.sepx 파일을 node_modules/@sepilot/에 설치합니다.
 * pnpm install 시 자동 실행되어 sepilot-extensions 저장소 없이도 작동하게 합니다.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');
const NODE_MODULES_DIR = path.join(__dirname, '..', 'node_modules', '@sepilot');

console.log('\n📦 Installing Extensions from .sepx files...\n');

// @sepilot 디렉토리 생성
if (!fs.existsSync(NODE_MODULES_DIR)) {
  fs.mkdirSync(NODE_MODULES_DIR, { recursive: true });
}

// extensions/*.sepx 파일 찾기
if (!fs.existsSync(EXTENSIONS_DIR)) {
  console.log('⚠️  extensions/ directory not found. Skipping Extension installation.');
  process.exit(0);
}

const sepxFiles = fs.readdirSync(EXTENSIONS_DIR).filter((f) => f.endsWith('.sepx'));

if (sepxFiles.length === 0) {
  console.log('⚠️  No .sepx files found in extensions/. Skipping Extension installation.');
  process.exit(0);
}

console.log(`Found ${sepxFiles.length} Extension package(s):\n`);

// Extensions that are developed as workspace packages (skip .sepx installation)
const WORKSPACE_EXTENSIONS = ['editor', 'browser'];

let installedCount = 0;
let skippedCount = 0;

for (const sepxFile of sepxFiles) {
  const sepxPath = path.join(EXTENSIONS_DIR, sepxFile);

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

    // Skip workspace extensions (editor, browser) - use workspace symlinks instead
    if (WORKSPACE_EXTENSIONS.includes(manifest.id)) {
      console.log(
        `  ⊙ extension-${manifest.id}@${manifest.version} (workspace package, skipping .sepx installation)`
      );
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

    // 설치 경로: node_modules/@sepilot/extension-{id}/
    const extensionName = `extension-${manifest.id}`;
    const installPath = path.join(NODE_MODULES_DIR, extensionName);

    // Path Traversal 공격 방지 검증
    const normalizedDest = path.resolve(installPath);
    const normalizedBase = path.resolve(NODE_MODULES_DIR);
    if (!normalizedDest.startsWith(normalizedBase + path.sep)) {
      console.log(`  ✗ ${sepxFile}: Path traversal detected (security violation)`);
      skippedCount++;
      continue;
    }

    // 이미 설치되어 있으면 스킵 (개발 환경에서 소스코드 우선)
    if (fs.existsSync(installPath) && fs.existsSync(path.join(installPath, 'src'))) {
      console.log(`  ⊙ ${extensionName}@${manifest.version} (source code found, skipping)`);
      skippedCount++;
      continue;
    }

    // 기존 설치 제거
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }

    // ZIP 압축 해제
    zip.extractAllTo(installPath, true);

    // package.json 수정: src/ -> dist/ (TypeScript stripping 에러 방지)
    const pkgJsonPath = path.join(installPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

        // main, module, types를 dist/로 변경
        if (pkg.main && pkg.main.includes('/src/')) {
          pkg.main = pkg.main.replace('/src/', '/dist/').replace('.ts', '.cjs');
        }
        if (pkg.module && pkg.module.includes('/src/')) {
          pkg.module = pkg.module.replace('/src/', '/dist/').replace('.ts', '.js');
        }
        if (pkg.types && pkg.types.includes('/src/')) {
          pkg.types = pkg.types.replace('/src/', '/dist/').replace('.ts', '.d.ts');
        }

        // exports 수정 (모든 export 패스 처리)
        if (pkg.exports) {
          Object.keys(pkg.exports).forEach((exportKey) => {
            const exportValue = pkg.exports[exportKey];

            // 객체 형태의 export
            if (typeof exportValue === 'object' && exportValue !== null) {
              if (exportValue.types && exportValue.types.includes('/src/')) {
                exportValue.types = exportValue.types
                  .replace('/src/', '/dist/')
                  .replace('.ts', '.d.ts');
              }
              if (exportValue.default && exportValue.default.includes('/src/')) {
                const distPath = exportValue.default.replace('/src/', '/dist/');
                delete exportValue.default;
                exportValue.require = distPath.replace('.ts', '.cjs');
                exportValue.import = distPath.replace('.ts', '.js');
              }
              if (exportValue.require && exportValue.require.includes('/src/')) {
                exportValue.require = exportValue.require
                  .replace('/src/', '/dist/')
                  .replace('.ts', '.cjs');
              }
              if (exportValue.import && exportValue.import.includes('/src/')) {
                exportValue.import = exportValue.import
                  .replace('/src/', '/dist/')
                  .replace('.ts', '.js');
              }
            }
            // 문자열 형태의 export
            else if (typeof exportValue === 'string' && exportValue.includes('/src/')) {
              pkg.exports[exportKey] = {
                types: exportValue.replace('/src/', '/dist/').replace('.ts', '.d.ts'),
                require: exportValue.replace('/src/', '/dist/').replace('.ts', '.cjs'),
                import: exportValue.replace('/src/', '/dist/').replace('.ts', '.js'),
              };
            }
          });
        }

        // files 배열 수정: src 제거 (webpack이 src/를 읽지 않도록)
        if (pkg.files) {
          pkg.files = pkg.files.filter((f) => f !== 'src');
          if (!pkg.files.includes('dist')) {
            pkg.files.push('dist');
          }
        } else {
          pkg.files = ['dist'];
        }

        // typesVersions 제거 (exports.types가 이미 올바르게 설정되어 있음)
        // typesVersions가 src/를 가리키면 TypeScript 에러 발생
        if (pkg.typesVersions) {
          delete pkg.typesVersions;
        }

        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
      } catch (pkgError) {
        console.log(
          `  ⚠️  Failed to update package.json for ${extensionName}: ${pkgError.message}`
        );
      }
    }

    // src/lib를 root lib로 복사 (dist/index.cjs가 ../lib/ 참조)
    const srcLibPath = path.join(installPath, 'src', 'lib');
    const rootLibPath = path.join(installPath, 'lib');
    if (fs.existsSync(srcLibPath)) {
      try {
        // root lib이 이미 존재하면 삭제
        if (fs.existsSync(rootLibPath)) {
          fs.rmSync(rootLibPath, { recursive: true, force: true });
        }
        // src/lib를 root lib로 복사
        fs.cpSync(srcLibPath, rootLibPath, { recursive: true });

        // lib/ 내 모든 .ts/.tsx 파일을 .js로 변경 (webpack transpile 방지)
        const renameFilesRecursively = (dir) => {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              renameFilesRecursively(fullPath);
            } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
              const newPath = fullPath.replace(/\.tsx?$/, '.js');
              fs.renameSync(fullPath, newPath);
            }
          }
        };
        renameFilesRecursively(rootLibPath);
      } catch (libError) {
        console.log(`  ⚠️  Failed to copy lib/ for ${extensionName}: ${libError.message}`);
      }
    }

    // src/ 디렉토리 제거 (webpack이 TypeScript 파일을 읽지 않도록)
    const srcPath = path.join(installPath, 'src');
    if (fs.existsSync(srcPath)) {
      try {
        fs.rmSync(srcPath, { recursive: true, force: true });
      } catch (srcError) {
        console.log(`  ⚠️  Failed to remove src/ for ${extensionName}: ${srcError.message}`);
      }
    }

    console.log(`  ✓ ${extensionName}@${manifest.version}`);
    installedCount++;
  } catch (error) {
    console.log(`  ✗ ${sepxFile}: ${error.message}`);
    skippedCount++;
  }
}

console.log();
console.log('='.repeat(60));
console.log(`✅ Extension installation complete`);
console.log(`   Extensions installed: ${installedCount}`);
console.log(`   Extensions skipped: ${skippedCount}`);
console.log('='.repeat(60));
console.log();

// Extension SDK dist 및 package.json 복사
const sdkSourcePath = path.join(__dirname, '..', 'lib', 'extension-sdk', 'dist');
const sdkPackageJsonPath = path.join(__dirname, '..', 'lib', 'extension-sdk', 'package.json');
const sdkTargetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@sepilot',
  'extension-sdk',
  'dist'
);
const sdkTargetPackageJsonPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@sepilot',
  'extension-sdk',
  'package.json'
);

if (fs.existsSync(sdkSourcePath)) {
  try {
    // 기존 dist 제거
    if (fs.existsSync(sdkTargetPath)) {
      fs.rmSync(sdkTargetPath, { recursive: true, force: true });
    }
    // dist 복사
    fs.cpSync(sdkSourcePath, sdkTargetPath, { recursive: true });
    console.log('✅ Extension SDK dist copied successfully');

    // package.json 복사 (ESM exports 작동을 위해 필수)
    if (fs.existsSync(sdkPackageJsonPath)) {
      fs.cpSync(sdkPackageJsonPath, sdkTargetPackageJsonPath);
      console.log('✅ Extension SDK package.json copied successfully\n');
    } else {
      console.log('⚠️  Extension SDK package.json not found\n');
    }
  } catch (error) {
    console.log(`⚠️  Failed to copy Extension SDK: ${error.message}\n`);
  }
} else {
  console.log('⚠️  Extension SDK source not found, skipping...\n');
}
