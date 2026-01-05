# E2E 테스트 가이드

SEPilot Desktop 애플리케이션의 End-to-End (E2E) 테스트입니다. Playwright를 사용하여 Electron 앱의 실제 사용자 시나리오를 테스트합니다.

## 📁 구조

```
e2e_tests/
├── fixtures/           # 테스트 픽스처 (Electron 앱 설정)
│   └── electron.ts     # Electron 앱 실행 및 종료 픽스처
├── utils/              # 헬퍼 함수 및 페이지 객체
│   ├── helpers.ts      # 공통 헬퍼 함수
│   └── page-objects.ts # 페이지 객체 패턴 (POM)
├── specs/              # 테스트 케이스
│   ├── 01-app-launch.spec.ts           # TC1: 앱 실행 및 기본 UI
│   ├── 02-conversation-create.spec.ts  # TC2: 새 대화 생성
│   ├── 03-message-send.spec.ts         # TC3: 메시지 입력 및 전송
│   ├── 04-conversation-navigation.spec.ts # TC4: 대화 목록 및 네비게이션
│   ├── 05-settings.spec.ts             # TC5: 설정 페이지
│   └── 06-theme-toggle.spec.ts         # TC6: 테마 전환
├── test-results/       # 테스트 결과 및 스크린샷 (gitignore)
└── README.md           # 이 파일
```

## 🚀 실행 방법

### 전제 조건

1. **Electron 백엔드 빌드**:

   ```bash
   pnpm run build:electron
   ```

2. **Next.js dev 서버 실행** (별도 터미널에서):

   ```bash
   pnpm run dev:next
   ```

   > **중요**: E2E 테스트는 Next.js dev 서버가 실행 중이어야 합니다.
   > 터미널을 하나 더 열어서 `pnpm run dev:next`를 실행한 상태에서 테스트를 실행하세요.

3. Playwright 브라우저 설치 (최초 1회):
   ```bash
   npx playwright install
   ```

### 테스트 실행 명령어

> **⚠️ 중요**: 모든 E2E 테스트 명령어를 실행하기 전에 반드시 별도의 터미널에서 Next.js dev 서버를 실행해야 합니다!

**1단계: Next.js dev 서버 실행 (별도 터미널)**

```bash
pnpm run dev:next
```

**2단계: E2E 테스트 실행 (새 터미널)**

#### 기본 실행 (Headless)

모든 테스트를 백그라운드에서 실행합니다:

```bash
pnpm run test:e2e
```

#### UI 표시 모드

Electron 앱 창을 보면서 테스트를 실행합니다:

```bash
pnpm run test:e2e:headed
```

#### 디버그 모드

단계별로 실행하며 디버깅할 수 있습니다:

```bash
pnpm run test:e2e:debug
```

#### UI 모드 (인터랙티브)

Playwright의 UI 모드로 테스트를 실행하고 디버깅합니다:

```bash
pnpm run test:e2e:ui
```

#### 특정 테스트만 실행

```bash
npx playwright test 01-app-launch.spec.ts
npx playwright test --grep "테마 전환"
```

#### 테스트 결과 보기

```bash
pnpm run test:e2e:report
```

## 📝 테스트 케이스

### TC1: 애플리케이션 실행 및 기본 UI 로딩

- Electron 앱 정상 실행 확인
- 메인 레이아웃 렌더링 확인
- 모드 선택기 표시 확인
- 채팅 UI 요소 표시 확인
- 키보드 단축키 작동 확인

### TC2: 새 대화 생성

- 키보드 단축키로 대화 생성 (Cmd/Ctrl+N)
- 플러스 버튼으로 대화 생성
- 새 대화 자동 활성화 확인
- 여러 대화 순차 생성
- 대화 목록 스크롤 테스트

### TC3: 메시지 입력 및 전송

- 메시지 입력 필드 사용
- 전송 버튼으로 메시지 전송
- Enter 키로 메시지 전송
- Shift+Enter로 줄바꿈
- 빈 메시지 전송 방지
- 특수 문자 및 긴 메시지 전송

### TC4: 대화 목록 및 네비게이션

- 대화 목록 표시 확인
- 대화 선택 및 전환
- 대화 검색 기능
- 대화 이름 변경
- 대화 삭제
- 컨텍스트 메뉴 기능

### TC5: 설정 페이지

- 설정 다이얼로그 열기 (Cmd/Ctrl+,)
- 설정 구조 확인
- UI/JSON 탭 전환
- 설정 섹션 간 이동
- 각 설정 섹션 표시 확인
- ESC 키로 닫기

### TC6: 테마 전환

- 테마 토글 버튼 확인
- 라이트/다크 모드 전환
- 여러 번 테마 전환
- UI 즉시 반영 확인
- 테마 설정 저장 확인
- 접근성 확인

## 🛠️ 페이지 객체 패턴 (POM)

테스트는 페이지 객체 패턴을 사용하여 유지보수가 용이합니다:

### 사용 가능한 페이지 객체

```typescript
import {
  MainLayoutPage,
  ChatPage,
  ConversationListPage,
  SettingsPage,
  ThemePage,
} from '../utils/page-objects';

// 사용 예시
const mainLayout = new MainLayoutPage(page);
await mainLayout.createNewConversation();
await mainLayout.openSettings();
```

### 헬퍼 함수

```typescript
import { wait, findByTestId, sendMessage, takeScreenshot } from '../utils/helpers';

// 사용 예시
await wait(1000);
const element = await findByTestId(page, 'mode-selector');
await sendMessage(page, '테스트 메시지');
await takeScreenshot(page, 'test-screenshot');
```

## 📊 테스트 결과

테스트 실행 후 다음 위치에 결과가 저장됩니다:

- **HTML 리포트**: `e2e_tests/test-results/html/index.html`
- **JSON 결과**: `e2e_tests/test-results/results.json`
- **JUnit XML**: `e2e_tests/test-results/junit.xml`
- **스크린샷**: `e2e_tests/test-results/*.png`
- **비디오**: 실패한 테스트의 경우 자동 녹화

## 🔧 설정

### playwright.config.ts

- **타임아웃**: 60초 (Electron 앱 시작 시간 고려)
- **병렬 실행**: 비활성화 (Electron 앱은 한 번에 하나만)
- **재시도**: CI에서 2회, 로컬에서 0회
- **스크린샷/비디오**: 실패 시에만 저장

### 환경 변수

테스트 중 사용되는 환경 변수:

```bash
NODE_ENV=test
DISABLE_AUTO_UPDATE=true
```

## 🐛 문제 해결

### "chrome-error://chromewebdata/" 오류

이 오류는 Next.js dev 서버가 실행되지 않았을 때 발생합니다.

**해결 방법**:

```bash
# 1. Next.js dev 서버를 먼저 시작
pnpm run dev:next

# 2. 서버가 완전히 시작될 때까지 대기 (localhost:3000)
# 3. 새 터미널에서 E2E 테스트 실행
pnpm run test:e2e
```

### 앱이 시작되지 않는 경우

```bash
# Electron 백엔드 빌드
pnpm run build:electron

# dist 폴더 확인
ls dist/electron/electron/main.js
```

### 테스트가 타임아웃되는 경우

- Next.js dev 서버가 실행 중인지 확인
- `http://localhost:3000`에 접속하여 앱이 로드되는지 확인
- `playwright.config.ts`에서 타임아웃 값 증가
- 개별 테스트에서 `{ timeout: 120000 }` 옵션 추가

### Electron 버전 충돌

```bash
# node_modules 재설치
rm -rf node_modules
pnpm install
```

### 스크린샷이 저장되지 않는 경우

```bash
# screenshots 폴더 생성
mkdir -p e2e_tests/test-results/screenshots
```

### "ECONNREFUSED localhost:3000" 오류

Next.js dev 서버가 실행되지 않았거나, 포트 3000이 사용 중입니다.

**해결 방법**:

1. `pnpm run dev:next`가 실행 중인지 확인
2. 포트 3000이 다른 프로세스에 사용되고 있지 않은지 확인
3. 브라우저에서 `http://localhost:3000` 접속 테스트

## 📚 참고 자료

- [Playwright 공식 문서](https://playwright.dev/)
- [Electron 테스팅](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Page Object Model](https://playwright.dev/docs/pom)

## 💡 베스트 프랙티스

1. **독립적인 테스트**: 각 테스트는 다른 테스트에 의존하지 않아야 합니다.
2. **명확한 대기**: `wait()` 대신 `waitFor()`, `expect().toBeVisible()` 사용 권장
3. **스크린샷 활용**: 실패 시 디버깅을 위해 스크린샷 캡처
4. **페이지 객체 사용**: 셀렉터 변경 시 한 곳만 수정하도록 POM 활용
5. **의미 있는 테스트 이름**: 테스트 목적이 명확하게 드러나는 이름 사용

## 🔄 CI/CD 통합

GitHub Actions 예시:

```yaml
- name: Run E2E Tests
  run: |
    pnpm run build
    pnpm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-results
    path: e2e_tests/test-results/
```

## 📝 테스트 추가 방법

1. `e2e_tests/specs/` 폴더에 새 `.spec.ts` 파일 생성
2. 필요한 픽스처 import:
   ```typescript
   import { test, expect } from '../fixtures/electron';
   ```
3. 페이지 객체 및 헬퍼 함수 활용
4. 테스트 작성:
   ```typescript
   test.describe('새로운 기능 테스트', () => {
     test('기능이 작동해야 함', async ({ page }) => {
       // 테스트 코드
     });
   });
   ```
5. 테스트 실행 및 검증

## ✅ 체크리스트

테스트 작성 전 확인 사항:

- [ ] 앱이 빌드되어 있는가?
- [ ] Playwright가 설치되어 있는가?
- [ ] 테스트가 독립적으로 실행 가능한가?
- [ ] 적절한 대기 및 검증이 포함되어 있는가?
- [ ] 실패 시 디버깅이 가능한가? (스크린샷, 로그)
- [ ] 테스트 이름이 명확한가?
