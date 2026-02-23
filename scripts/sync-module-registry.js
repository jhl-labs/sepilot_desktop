#!/usr/bin/env node

/**
 * Module Registry Sync Script
 *
 * tsup.config.ts의 external 목록을 파싱하여
 * lib/extensions/host-module-registry.ts의 의존성 목록을 자동 업데이트합니다.
 *
 * ⚠️  현재는 정보 제공용 스크립트입니다.
 * host-module-registry.ts는 수동으로 관리하되, 이 스크립트로 누락된 external을 확인할 수 있습니다.
 *
 * Usage:
 *   node scripts/sync-module-registry.js
 */

const fs = require('fs');
const path = require('path');

const TSUP_CONFIG_PATH = path.join(__dirname, '../resources/extensions/editor/tsup.config.ts');
const REGISTRY_PATH = path.join(__dirname, '../lib/extensions/host-module-registry.ts');

/**
 * tsup.config.ts에서 external 목록 추출
 */
function extractExternals(tsupConfigPath) {
  if (!fs.existsSync(tsupConfigPath)) {
    console.error(`❌ tsup.config.ts not found: ${tsupConfigPath}`);
    return [];
  }

  const content = fs.readFileSync(tsupConfigPath, 'utf-8');

  // external 배열 추출 (간단한 정규식 파싱)
  const externalMatch = content.match(/external\s*:\s*\[([\s\S]*?)\]/);
  if (!externalMatch) {
    console.error('❌ Failed to extract external array from tsup.config.ts');
    return [];
  }

  const externalBlock = externalMatch[1];

  // 각 항목 추출
  const externals = [];
  const lines = externalBlock.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // 문자열 리터럴
    if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
      const match = trimmed.match(/['"]([^'"]+)['"]/);
      if (match) {
        externals.push({ type: 'literal', value: match[1] });
      }
    }

    // 정규식
    if (trimmed.startsWith('/')) {
      const match = trimmed.match(/\/\^?([^/]+)\$?\/\.\*/);
      if (match) {
        externals.push({ type: 'regex', value: match[1] });
      }
    }
  }

  return externals;
}

/**
 * host-module-registry.ts에서 등록된 모듈 추출
 */
function extractRegisteredModules(registryPath) {
  if (!fs.existsSync(registryPath)) {
    console.error(`❌ host-module-registry.ts not found: ${registryPath}`);
    return [];
  }

  const content = fs.readFileSync(registryPath, 'utf-8');

  // MODULE_REGISTRY 초기화 블록 추출
  const registryMatch = content.match(/const registry: ModuleRegistry = \{([\s\S]*?)\};/);
  if (!registryMatch) {
    console.error('❌ Failed to extract registry from host-module-registry.ts');
    return [];
  }

  const registryBlock = registryMatch[1];

  // 각 항목 추출
  const modules = [];
  const lines = registryBlock.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
      const match = trimmed.match(/['"]([^'"]+)['"]\s*:/);
      if (match) {
        modules.push(match[1]);
      }
    }
  }

  return modules;
}

/**
 * Main
 */
function main() {
  console.log('\n🔍 Checking Module Registry Sync...\n');

  // 1. tsup.config.ts의 external 추출
  console.log(`📄 Reading: ${TSUP_CONFIG_PATH}`);
  const externals = extractExternals(TSUP_CONFIG_PATH);
  console.log(`   Found ${externals.length} external(s)\n`);

  // 2. host-module-registry.ts의 등록된 모듈 추출
  console.log(`📄 Reading: ${REGISTRY_PATH}`);
  const registered = extractRegisteredModules(REGISTRY_PATH);
  console.log(`   Found ${registered.length} registered module(s)\n`);

  // 3. 비교
  const literalExternals = externals.filter((e) => e.type === 'literal').map((e) => e.value);
  const regexExternals = externals.filter((e) => e.type === 'regex').map((e) => e.value);

  console.log('📊 Analysis:\n');

  // 3a. Literal externals 체크
  const missingLiterals = literalExternals.filter(
    (ext) => !registered.includes(ext) && !ext.startsWith('@/')
  );

  if (missingLiterals.length > 0) {
    console.log('⚠️  Missing in host-module-registry.ts:');
    missingLiterals.forEach((m) => console.log(`   - ${m}`));
    console.log();
  }

  // 3b. Regex externals 정보 출력
  if (regexExternals.length > 0) {
    console.log('📝 Regex externals (may need special handling):');
    regexExternals.forEach((r) => console.log(`   - ${r}`));
    console.log();
  }

  // 3c. 등록된 모듈 중 external에 없는 것
  const extraModules = registered.filter((m) => {
    // Literal match
    if (literalExternals.includes(m)) return false;

    // Regex match
    for (const regex of regexExternals) {
      if (m.startsWith(regex)) return false;
    }

    return true;
  });

  if (extraModules.length > 0) {
    console.log('ℹ️  Registered but not in tsup.config.ts external:');
    extraModules.forEach((m) => console.log(`   - ${m}`));
    console.log('   (This is normal for subpaths like @sepilot/extension-sdk/*)');
    console.log();
  }

  // 4. 결과 요약
  if (missingLiterals.length === 0) {
    console.log('✅ Module registry is in sync with tsup.config.ts');
  } else {
    console.log('⚠️  Some externals are missing from host-module-registry.ts');
    console.log('   Please add them manually to ensure Extension runtime loading works.');
  }

  console.log();
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
  extractExternals,
  extractRegisteredModules,
};
