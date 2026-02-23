#!/usr/bin/env node

/**
 * Extension package.json의 typesVersions를 수정하는 스크립트
 * src/index.ts -> dist/index.d.ts로 변경
 */

const fs = require('fs');
const path = require('path');

const NODE_MODULES_DIR = path.join(__dirname, '..', 'node_modules', '@sepilot');

console.log('🔧 Fixing typesVersions in Extension package.json files...\n');

const extensionDirs = fs
  .readdirSync(NODE_MODULES_DIR)
  .filter((dir) => dir.startsWith('extension-'));

let fixedCount = 0;

for (const extDir of extensionDirs) {
  const pkgJsonPath = path.join(NODE_MODULES_DIR, extDir, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    continue;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  if (pkg.typesVersions) {
    // typesVersions의 모든 경로를 dist/로 변경
    if (pkg.typesVersions['*'] && pkg.typesVersions['*']['*']) {
      const oldPath = pkg.typesVersions['*']['*'][0];
      if (oldPath && oldPath.includes('/src/')) {
        pkg.typesVersions['*']['*'][0] = oldPath.replace('/src/', '/dist/').replace('.ts', '.d.ts');

        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`  ✓ ${extDir}: ${oldPath} -> ${pkg.typesVersions['*']['*'][0]}`);
        fixedCount++;
      }
    }
  }
}

console.log(`\n✅ Fixed typesVersions in ${fixedCount} extension(s)\n`);
