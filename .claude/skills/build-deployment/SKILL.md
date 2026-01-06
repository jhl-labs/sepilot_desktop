# Build & Deployment Skill

SEPilot Desktop의 Electron 빌드 및 배포 프로세스 가이드

## 빌드 프로세스 개요

```
1. Next.js Frontend 빌드 → out/
2. Electron TypeScript 컴파일 → dist/electron/
3. electron-builder로 패키징 → release/
```

## 개발 환경

### 개발 서버 실행

```bash
pnpm dev
```

**실행 순서:**

1. `clean:dev` - 이전 빌드 정리
2. `dev:electron-build-once` - Electron 코드 1회 컴파일
3. 3개 프로세스 동시 실행 (concurrently):
   - `dev:next` - Next.js 개발 서버 (http://localhost:3000)
   - `dev:electron-build` - Electron TypeScript watch 모드
   - `dev:electron` - Electron 앱 실행 (wait-on으로 Next.js 대기)

### 개별 개발 스크립트

```bash
# Next.js만 실행
pnpm dev:next

# Electron TypeScript 빌드 (watch)
pnpm dev:electron-build

# Electron 앱 실행
pnpm dev:electron
```

## 프로덕션 빌드

### 전체 빌드 (Frontend + Backend)

```bash
pnpm build
```

**실행 순서:**

1. `next build --webpack` - Next.js 정적 빌드 → `out/`
2. `tsc -p electron/tsconfig.json` - Electron 컴파일 → `dist/electron/`

### 플랫폼별 빌드

```bash
# macOS (DMG, ZIP)
pnpm build:mac

# Windows (NSIS, Portable)
pnpm build:win

# Linux (AppImage, DEB)
pnpm build:linux

# 모든 플랫폼
pnpm build:app
```

**출력 디렉토리**: `release/`

### 패키징만 (설치 파일 없이)

```bash
pnpm package
```

**용도**: 빠른 테스트, 디버깅 (설치 파일 생성 없이 실행 가능한 앱만 생성)

## electron-builder 설정

### electron-builder.json

```json
{
  "appId": "com.sepilot.desktop",
  "productName": "SEPilot Desktop",
  "directories": {
    "output": "release",
    "buildResources": "assets"
  },
  "files": [
    "out/**/*", // Next.js 빌드 결과
    "dist/electron/**/*", // Electron 컴파일 결과
    "public/**/*",
    "node_modules/**/*"
  ],
  "asarUnpack": [
    "node_modules/**/*.node",
    "node_modules/**/*.wasm",
    "node_modules/sql.js/**/*",
    "node_modules/better-sqlite3/**/*"
  ],
  "extraResources": ["assets/**"]
}
```

**주요 필드:**

- `appId`: 앱 고유 식별자 (역 DNS 형식)
- `productName`: 표시될 앱 이름
- `files`: 패키징에 포함할 파일
- `asarUnpack`: asar 아카이브에서 제외할 파일 (네이티브 모듈)
- `extraResources`: 앱 외부 리소스 디렉토리

### 플랫폼별 설정

#### macOS

```json
{
  "mac": {
    "category": "public.app-category.developer-tools",
    "target": ["dmg", "zip"],
    "icon": "assets/icon.png",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "assets/entitlements.mac.plist",
    "entitlementsInherit": "assets/entitlements.mac.plist"
  }
}
```

**필수 파일:**

- `assets/icon.png` - 앱 아이콘 (1024x1024 PNG)
- `assets/entitlements.mac.plist` - macOS 권한 설정

**entitlements.mac.plist 예시:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
```

#### Windows

```json
{
  "win": {
    "target": ["nsis", "portable"],
    "icon": "assets/icon.ico",
    "signAndEditExecutable": false,
    "verifyUpdateCodeSignature": false
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

**필수 파일:**

- `assets/icon.ico` - 앱 아이콘 (256x256 ICO)

**NSIS 설치 옵션:**

- `oneClick: false` - 설치 디렉토리 선택 가능
- `allowToChangeInstallationDirectory: true` - 경로 변경 허용

#### Linux

```json
{
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Development",
    "icon": "assets/icon.png"
  }
}
```

**필수 파일:**

- `assets/icon.png` - 앱 아이콘 (512x512 PNG)

## 아이콘 생성

### 아이콘 요구사항

- **macOS**: 1024x1024 PNG → `icon.png`
- **Windows**: 256x256 ICO → `icon.ico`
- **Linux**: 512x512 PNG → `icon.png`

### 아이콘 빌드 스크립트

```bash
pnpm build:icon
```

**scripts/build-icon.js:**

```javascript
const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs').promises;

async function buildIcons() {
  const sourcePng = 'assets/icon-source.png';

  // macOS/Linux PNG (1024x1024)
  await sharp(sourcePng).resize(1024, 1024).toFile('assets/icon.png');

  // Windows ICO (256x256)
  const buf = await sharp(sourcePng).resize(256, 256).png().toBuffer();

  const ico = await toIco([buf]);
  await fs.writeFile('assets/icon.ico', ico);

  console.log('Icons generated successfully!');
}

buildIcons();
```

## 네이티브 모듈 처리

### 문제: 네이티브 모듈 (node-pty, better-sqlite3 등)

**해결책 1: electron-rebuild**

```bash
# node-pty 재빌드
pnpm rebuild:node-pty
```

**package.json:**

```json
{
  "scripts": {
    "rebuild:node-pty": "electron-rebuild -f -w node-pty"
  }
}
```

**해결책 2: asarUnpack**

```json
{
  "asarUnpack": [
    "node_modules/**/*.node",
    "node_modules/**/*.wasm",
    "node_modules/better-sqlite3/**/*"
  ]
}
```

**중요**: `.node` 파일은 반드시 `asarUnpack`에 포함해야 합니다.

## 빌드 최적화

### 1. 불필요한 파일 제외

```json
{
  "files": [
    "out/**/*",
    "dist/electron/**/*",
    "node_modules/**/*",
    "!node_modules/**/*.{md,markdown,MD}",
    "!node_modules/**/test/**/*",
    "!node_modules/**/tests/**/*",
    "!node_modules/**/*.test.js",
    "!node_modules/**/*.spec.js"
  ]
}
```

### 2. Next.js 빌드 최적화

**next.config.mjs:**

```javascript
const nextConfig = {
  output: 'export', // 정적 빌드
  distDir: 'out',
  images: {
    unoptimized: true, // Electron에서는 이미지 최적화 불필요
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.target = 'electron-renderer';
    }
    return config;
  },
};
```

### 3. TypeScript 컴파일 최적화

**electron/tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "../dist/electron",
    "skipLibCheck": true, // 빌드 속도 향상
    "incremental": true // 증분 컴파일
  }
}
```

## 자동 업데이트 (선택 사항)

### electron-updater 통합

**electron/main.ts:**

```typescript
import { autoUpdater } from 'electron-updater';

app.on('ready', () => {
  // 프로덕션에서만 자동 업데이트 활성화
  if (process.env.NODE_ENV === 'production') {
    autoUpdater.checkForUpdatesAndNotify();
  }
});
```

**electron-builder.json:**

```json
{
  "publish": {
    "provider": "github",
    "owner": "your-org",
    "repo": "sepilot-desktop"
  }
}
```

**주의**: 프로젝트에서는 `"publish": null`로 설정되어 자동 업데이트 비활성화됨.

## CI/CD 배포

### GitHub Actions 예시

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm build

      - name: Build app (macOS)
        if: matrix.os == 'macos-latest'
        run: pnpm build:mac

      - name: Build app (Windows)
        if: matrix.os == 'windows-latest'
        run: pnpm build:win

      - name: Build app (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: pnpm build:linux

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: release-${{ matrix.os }}
          path: release/*
```

## 코드 서명 (선택 사항)

### macOS 코드 서명

```bash
# Apple Developer ID 인증서 필요
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=password
pnpm build:mac
```

### Windows 코드 서명

```bash
# Windows Code Signing Certificate 필요
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=password
pnpm build:win
```

**electron-builder.json:**

```json
{
  "win": {
    "signAndEditExecutable": true,
    "verifyUpdateCodeSignature": true
  }
}
```

**주의**: 프로젝트에서는 코드 서명 비활성화 상태.

## 디버깅

### 빌드된 앱 실행

```bash
# macOS
open release/mac/SEPilot\ Desktop.app

# Windows
release/win-unpacked/SEPilot\ Desktop.exe

# Linux
release/linux-unpacked/sepilot-desktop
```

### DevTools 활성화 (프로덕션)

```typescript
// electron/main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    devTools: true, // 프로덕션에서도 DevTools 허용
  },
});
```

### 로그 확인

```typescript
import { app } from 'electron';
import path from 'path';

const logPath = path.join(app.getPath('userData'), 'logs');
console.log('Log path:', logPath);
```

## 빌드 문제 해결

### 1. ASAR 관련 오류

**문제**: `Cannot find module` 오류

**해결책**: `asarUnpack`에 추가

```json
{
  "asarUnpack": ["node_modules/problematic-module/**/*"]
}
```

### 2. 네이티브 모듈 오류

**문제**: `Error: The module was compiled against a different Node.js version`

**해결책**: electron-rebuild 실행

```bash
pnpm rebuild:node-pty
```

### 3. 빌드 크기 너무 큼

**해결책**: 불필요한 파일 제외

```json
{
  "files": ["!node_modules/**/test/**/*", "!node_modules/**/*.md"]
}
```

### 4. macOS 권한 오류

**문제**: App is damaged and can't be opened

**해결책**: 올바른 entitlements 설정

```xml
<key>com.apple.security.cs.allow-jit</key>
<true/>
```

## 품질 보증 (QA)

### 빌드 전 체크리스트

- [ ] `pnpm type-check` 통과
- [ ] `pnpm lint` 통과
- [ ] `pnpm test` 통과
- [ ] `pnpm test:e2e` 통과
- [ ] 버전 번호 업데이트 (`package.json`)
- [ ] Release notes 작성 (`release_notes/`)

### 빌드 후 테스트

- [ ] 각 플랫폼에서 설치 테스트
- [ ] 앱 실행 및 기본 기능 동작 확인
- [ ] IPC 통신 정상 작동
- [ ] Extension 로딩 확인
- [ ] LangGraph Agent 실행 테스트
- [ ] MCP Tool 호출 테스트

## 체크리스트

- [ ] 개발 서버 실행: `pnpm dev`
- [ ] 프로덕션 빌드: `pnpm build`
- [ ] 플랫폼별 빌드: `pnpm build:mac/win/linux`
- [ ] 아이콘 준비 (macOS: PNG 1024x1024, Windows: ICO 256x256)
- [ ] 네이티브 모듈 `asarUnpack`에 포함
- [ ] 불필요한 파일 `files`에서 제외
- [ ] 버전 번호 `package.json`에 업데이트
- [ ] 빌드 전 모든 테스트 통과
- [ ] 빌드 후 각 플랫폼에서 실행 테스트
- [ ] Release notes 작성 (`release_notes/v{version}.md`)

## 참고

- **electron-builder 문서**: https://www.electron.build/
- **Next.js Static Export**: https://nextjs.org/docs/app/building-your-application/deploying/static-exports
- **프로젝트 빌드 설정**: `electron-builder.json`, `package.json`
- **빌드 스크립트**: `scripts/build-icon.js`, `scripts/clean-dev.js`
