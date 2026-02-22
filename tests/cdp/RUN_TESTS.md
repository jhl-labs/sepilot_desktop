# CDP 테스트 실행 가이드

## 1단계: 애플리케이션 빌드

```bash
pnpm run build
pnpm run build:extensions
```

## 2단계: Electron을 CDP 모드로 실행

**터미널 1:**

```bash
pnpm run start:cdp
```

또는 직접 실행:

```bash
ELECTRON_ENABLE_LOGGING=1 electron dist/electron/electron/main.js --remote-debugging-port=9222
```

앱이 실행되면 다음과 같이 표시됩니다:

```
DevTools listening on ws://127.0.0.1:9222/devtools/browser/...
```

## 3단계: CDP 연결 확인

**터미널 2 (새 터미널):**

```bash
curl http://localhost:9222/json/list
```

정상이면 JSON 응답이 나옵니다:

```json
[
  {
    "description": "",
    "devtoolsFrontendUrl": "/devtools/inspector.html?ws=...",
    "id": "...",
    "title": "SEPilot Desktop",
    "type": "page",
    "url": "file://...",
    "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/..."
  }
]
```

## 4단계: 테스트 실행

**터미널 2에서:**

### 전체 테스트 실행

```bash
pnpm run test:cdp
```

### 개별 테스트 실행 (빠른 검증용)

```bash
# 가장 간단한 테스트부터
pnpm run test:cdp:ui           # UI 컴포넌트 (30개)
pnpm run test:cdp:chat         # 채팅 (25개)
pnpm run test:cdp:settings     # 설정 (40개)
```

### 디버그 모드 (상세 로그)

```bash
DEBUG=1 node tests/cdp/test-chat-features.js
```

## 예상 결과

성공 시:

```
============================================
 Chat 기능 테스트
============================================
CDP Target: ws://localhost:9222/devtools/page/...

CDP 연결 시도...
CDP 연결 성공!

=== Test 1: 대화 관리 ===
  ✅ [PASS] 1-1. 새 대화 생성
  ✅ [PASS] 1-2. 대화 목록 조회
  ✅ [PASS] 1-3. 대화 로드
  ✅ [PASS] 1-4. 대화 삭제

=== Test 2: 메시지 처리 ===
  ✅ [PASS] 2-1. Zustand store messages 접근
  ...

============================================
 테스트 결과 요약
============================================

  전체: 25개 | PASS: 25개 | FAIL: 0개
  성공률: 100.0%
```

## 트러블슈팅

### 문제: "CDP connection timeout"

**원인:** Electron 앱이 실행되지 않았거나 9222 포트가 차단됨

**해결:**

```bash
# 1. 프로세스 확인
ps aux | grep electron

# 2. 포트 확인
lsof -i :9222

# 3. 방화벽 확인 (macOS)
sudo pfctl -s all | grep 9222
```

### 문제: "No page target found"

**원인:** Electron 앱이 실행되었지만 페이지가 로드되지 않음

**해결:**

- Electron 창이 실제로 열렸는지 확인
- 몇 초 기다린 후 다시 시도

### 문제: 테스트 실패 (IPC 핸들러 없음)

**원인:** 일부 IPC 핸들러가 실제로 구현되지 않았을 수 있음

**해결:**

- 실패한 테스트를 확인하고 해당 IPC가 실제로 존재하는지 확인
- 존재하지 않으면 해당 테스트를 주석 처리하거나 `return true;`로 우회

## 실행 순서 요약

```bash
# 터미널 1: Electron CDP 모드 실행
pnpm run start:cdp

# 터미널 2: CDP 연결 확인
curl http://localhost:9222/json/list

# 터미널 2: 테스트 실행
pnpm run test:cdp:ui    # 간단한 테스트부터

# 성공하면 전체 테스트
pnpm run test:cdp
```

## CI에서 실행

GitHub Actions에서는 자동으로 실행됩니다:

- `.github/workflows/cdp-tests.yml` 참조
- Xvfb를 사용한 headless 실행 (Linux)
- 자동 스크린샷 캡처 (실패 시)
