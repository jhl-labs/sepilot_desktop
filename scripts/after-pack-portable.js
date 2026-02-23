#!/usr/bin/env node

/**
 * electron-builder afterPack hook for portable builds.
 *
 * Portable 빌드에서는 Extension(.sepx)이 exe와 별도로 배포되어야 합니다.
 * 이 hook은 패키징 후 resources/extensions/ 디렉토리를 제거하여
 * portable exe에 extension이 포함되지 않도록 합니다.
 *
 * 사용자는 exe 옆에 extensions/ 폴더를 두고 .sepx 파일을 배치합니다.
 * PORTABLE_EXECUTABLE_DIR 환경변수를 통해 런타임에 로드됩니다.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const extensionsDir = path.join(context.appOutDir, 'resources', 'extensions');

  if (fs.existsSync(extensionsDir)) {
    fs.rmSync(extensionsDir, { recursive: true, force: true });
    console.log(`[afterPack] Removed bundled extensions from portable build: ${extensionsDir}`);
  }
};
