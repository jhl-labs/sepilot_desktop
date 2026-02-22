# CDP (Chrome DevTools Protocol) E2E Tests

SEPilot Desktop의 CDP 기반 End-to-End 테스트 스위트입니다.

## 개요

CDP를 사용하여 Electron 앱의 Renderer Process에 연결하고, 실제 DOM 조작, IPC 호출, 상태 변경 등을 테스트합니다. Agent 없이 CI에서 자동으로 실행 가능합니다.

## 테스트 파일

### Core Tests

- **test-chat-features.js** - 채팅 기능 (대화 관리, 메시지, 스트리밍)
- **test-extension-loading.js** - Extension 로딩 시스템
- **test-langgraph-agents.js** - LangGraph Agent 시스템
- **test-ui-components.js** - UI 컴포넌트 렌더링

### Legacy Tests

- **test-coding-cowork-separation.js** - Coding/Cowork Agent 분리 검증
- **test-fail-investigation.js** - 실패 항목 조사 스크립트
- **test-final-verification.js** - 최종 검증

### Utilities

- **utils/cdp-client.js** - CDP 클라이언트 (WebSocket 통신, evaluate, IPC 헬퍼)
- **utils/test-reporter.js** - 테스트 결과 리포터
- **utils/get-cdp-url.js** - CDP WebSocket URL 자동 탐지

## 사용법

### 로컬 실행

1. **Electron 앱을 CDP 모드로 실행:**

   ```bash
   pnpm run start:cdp
   ```

   또는

   ```bash
   electron dist/electron/electron/main.js --remote-debugging-port=9222
   ```

2. **CDP WebSocket URL 확인:**

   ```bash
   curl http://localhost:9222/json/list
   ```

3. **테스트 실행:**

   ```bash
   # 모든 테스트 실행
   pnpm run test:cdp

   # 개별 테스트 실행
   pnpm run test:cdp:chat         # 채팅 기능
   pnpm run test:cdp:extension    # Extension 로딩
   pnpm run test:cdp:agent        # LangGraph Agent
   pnpm run test:cdp:ui           # UI 컴포넌트
   ```

### CI 실행

GitHub Actions에서 자동으로 실행됩니다:

- **워크플로우:** `.github/workflows/cdp-tests.yml`
- **트리거:** push, pull_request (main, develop 브랜치)
- **플랫폼:** Ubuntu, macOS, Windows

## 환경 변수

- **CDP_WS_URL** - CDP WebSocket URL (자동 탐지되므로 선택 사항)
  ```bash
  export CDP_WS_URL="ws://localhost:9222/devtools/page/..."
  pnpm run test:cdp
  ```

## 테스트 작성 가이드

### 기본 구조

```javascript
const { CDPClient } = require('./utils/cdp-client');
const { TestReporter } = require('./utils/test-reporter');
const { getCDPUrlFromEnvOrAuto } = require('./utils/get-cdp-url');

let client;
let reporter;

async function test1_MyFeature() {
  reporter.suite('Test 1: My Feature');

  await reporter.run('1-1. Feature works', async () => {
    const result = await client.ipcInvoke('my-channel', 'arg1');
    return result === 'expected';
  });
}

async function main() {
  const wsUrl = await getCDPUrlFromEnvOrAuto();
  client = new CDPClient(wsUrl);
  reporter = new TestReporter();

  try {
    await client.connect();
    await test1_MyFeature();
  } finally {
    client.close();
  }

  const { failed } = reporter.summary();
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

### CDPClient API

```javascript
// JavaScript 평가
const result = await client.evaluate('document.title');
console.log(result.value); // "SEPilot Desktop"

// IPC 호출
const conversations = await client.ipcInvoke('chat:get-conversations');

// Zustand store 접근
const appMode = await client.getStoreState((s) => s.appMode);

// DOM 쿼리
const hasChat = await client.querySelector('[class*="chat"]');
const buttonCount = await client.querySelectorAll('button');

// 조건 대기
await client.waitFor(() => document.querySelector('.loaded') !== null);
```

### TestReporter API

```javascript
// 테스트 스위트
reporter.suite('Test 1: My Feature');

// 테스트 케이스
reporter.test('1-1. Works', true, 'detail info');

// 비동기 테스트 (자동 try-catch)
await reporter.run('1-2. Async test', async () => {
  const result = await someAsyncOperation();
  return result === 'expected';
});

// 요약 출력
const { passed, failed, total } = reporter.summary();
```

## 디버깅

### CDP 연결 확인

```bash
# CDP 서버 확인
curl http://localhost:9222/json/list | jq

# WebSocket URL 가져오기
node -e "require('./tests/cdp/utils/get-cdp-url').getCDPUrl().then(console.log)"
```

### Electron 로그 확인

```bash
# CDP 모드로 실행 (로그 출력)
ELECTRON_ENABLE_LOGGING=1 electron dist/electron/electron/main.js --remote-debugging-port=9222
```

### 테스트 실패 시

1. Electron 앱이 정상 실행 중인지 확인
2. CDP 포트(9222)가 열려 있는지 확인
3. 테스트 파일의 타임아웃 값 조정 (`timeout` 파라미터)
4. `client.evaluate()` 코드에서 예외 발생 여부 확인

## 주의사항

1. **Electron 앱 먼저 실행** - 테스트 전에 `pnpm run start:cdp` 필수
2. **비동기 처리** - CDP 통신은 모두 비동기이므로 `await` 사용
3. **타임아웃** - 긴 작업은 `timeout` 파라미터 증가 필요
4. **프로세스 정리** - 테스트 후 Electron 프로세스 종료 필수
5. **포트 충돌** - 9222 포트가 이미 사용 중이면 다른 포트 사용

## 트러블슈팅

### "CDP connection timeout"

- Electron 앱이 실행 중인지 확인
- `--remote-debugging-port=9222` 플래그 확인
- 방화벽이 9222 포트를 차단하는지 확인

### "Timeout evaluating"

- `client.evaluate()` 내부 코드에서 예외 발생 가능
- 타임아웃 값 증가 (`timeout` 파라미터)
- 코드에서 무한 루프나 긴 작업 확인

### "require is not defined"

- Renderer Process에서 Node.js 모듈 사용 시 발생
- `window.electronAPI`를 통해 IPC로 Main Process 호출
- 또는 Preload 스크립트에서 노출된 API 사용

## 참고 자료

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Electron Debugging](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
