# Scripts 디렉토리

이 폴더에는 SEPilot Desktop 프로젝트의 빌드, 개발, 테스트 스크립트가 포함되어 있습니다.

## 📦 프로덕션 스크립트 (package.json에서 사용)

### 빌드 및 개발
- `build-electron.js` - Electron main/preload 빌드 (esbuild)
- `build-workspace-extensions.js` - 모든 Extension 빌드 (tsup)
- `wait-and-start-electron.js` - Electron 시작 대기 및 실행
- `watch-extensions.js` - Extension watch 모드
- `build-icon.js` - 아이콘 빌드
- `copy-monaco.js` - Monaco Editor 복사
- `build-sdk.sh` - Extension SDK 빌드

### Extension 관리
- `bundle-extensions.js` - .sepx → resources/extensions/ (압축 해제)
- `package-all-extensions.js` - resources/extensions/ → .sepx (압축 생성)
- `generate-extension-imports.js` - Extension imports 자동 생성
- `clean-extensions.js` - Extension 정리
- `install-extensions.js` - Extension 설치
- `fix-extension-lib.js` - Extension lib 수정

### 유틸리티
- `clean-dev.js` - 개발 환경 정리

## 🛠️ 개발/디버깅 전용 스크립트 (package.json 미사용)

### Extension 개발 도구 (현재 사용)
- `wrap-extension-renderer.js` - Extension renderer 래핑
- `sync-module-registry.js` - 모듈 레지스트리 동기화
- `update-sepx-packages.js` - SEPX 패키지 업데이트

### Extension 다국어 도구
- `extract-extension-locales.js` - Extension 로케일 추출
- `add-extension-locale-keys.js` - Extension 로케일 키 추가

## 🧪 테스트 스크립트 → tests/scripts/

테스트 및 검증 스크립트는 `tests/scripts/`로 이동되었습니다:
- `test-extension-loader.js` - Extension 로더 기본 테스트
- `test-extension-loader-advanced.js` - Extension 로더 고급 테스트
- `test-extension-runtime.js` - Extension 런타임 테스트
- `test-extension-install.js` - Extension 설치 테스트
- `test-extension-error-handling.js` - Extension 에러 핸들링 테스트
- `verify-extension-loading.js` - Extension 로딩 검증
- `verify-sepx.js` - SEPX 파일 검증
- `check-renderer-field.js` - Renderer 필드 체크
- `check-autocomplete-config.js` - 자동완성 설정 체크
- `README-EXTENSION-TESTS.md` - 테스트 도구 사용 가이드

자세한 내용은 `tests/scripts/README-EXTENSION-TESTS.md` 참조.

## 📁 archive/ 폴더

더 이상 사용되지 않는 스크립트는 `scripts/archive/`로 이동되었습니다:
- `build-extension.js` - 단일 Extension 빌드 (대체됨)
- `package-extension.js` - 단일 Extension 패키징 (대체됨)
- `repro-bad-token.js` - 재현 테스트
- `repro-mcp.js` - 재현 테스트
- `create-icon.js` - 초기 아이콘 생성
- `fix-extension-types.js` - 타입 수정 유틸리티

자세한 내용은 `scripts/archive/README.md` 참조.

## 📝 스크립트 명명 규칙

- `build-*.js` - 빌드 관련
- `package-*.js` - 패키징 관련
- `test-*.js` - 테스트 관련
- `verify-*.js` - 검증 관련
- `repro-*.js` - 재현 테스트
- `fix-*.js` - 수정 유틸리티
- `check-*.js` - 체크 유틸리티
