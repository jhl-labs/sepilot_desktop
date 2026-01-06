# Cursor Configuration

이 디렉토리는 Cursor AI 에디터를 위한 프로젝트별 설정을 포함합니다.

## 파일 구조

```
.cursor/
├── README.md           # 이 파일
└── prompts/            # 커스텀 프롬프트 (선택 사항)
```

## Cursor 설정

### 주요 설정 파일

1. **`.cursorrules`** (프로젝트 루트)
   - Cursor AI가 자동으로 읽는 프로젝트별 규칙 및 컨텍스트
   - 프로젝트 개요, 코딩 패턴, 체크리스트 포함

2. **`.vscode/settings.json`**
   - Cursor는 VS Code 기반이므로 이 설정을 활용
   - 에디터 설정, Formatter, Linter, Cursor AI 모델 설정 등

3. **`.vscode/extensions.json`**
   - 추천 확장 프로그램 목록
   - ESLint, Prettier, Tailwind CSS IntelliSense 등

4. **`.vscode/launch.json`**
   - 디버깅 설정
   - Next.js, Jest, Electron 디버깅 구성

5. **`.vscode/tasks.json`**
   - VS Code/Cursor Tasks
   - TypeScript 체크, Lint, Test, Build 작업

## Cursor AI 모델 설정

`.vscode/settings.json`에서 기본 모델 설정:

```json
{
  "cursor.chat.defaultModel": "claude-sonnet-4-5-20250929"
}
```

### 권장 모델

- **Claude Sonnet 4.5**: 기본 사용 (균형잡힌 성능)
- **Claude Opus 4**: 복잡한 작업 (높은 품질)
- **GPT-4**: 대안 모델

## 사용 방법

### 1. Cursor 설치

```bash
# https://cursor.sh 에서 다운로드
```

### 2. 프로젝트 열기

```bash
cursor /path/to/sepilot_desktop
```

### 3. 추천 확장 프로그램 설치

- Cursor가 자동으로 `.vscode/extensions.json` 기반 추천
- "Install Recommended Extensions" 클릭

### 4. Cursor AI 활용

**Ctrl/Cmd + K**: Inline AI 편집
**Ctrl/Cmd + L**: AI Chat 열기
**Ctrl/Cmd + I**: AI에게 작업 요청

## Cursor AI 명령어 예시

### 코드 작성

```
Create a React component for displaying a message list using shadcn/ui
```

### 리팩토링

```
Refactor this component to use Zustand store instead of useState
```

### 버그 수정

```
This IPC handler is throwing an error when conversationId is missing. Fix it with proper validation
```

### 테스트 작성

```
Write Jest tests for this component following the project's testing patterns
```

### 문서화

```
Add JSDoc comments to this function explaining parameters and return value
```

## 프로젝트 규칙

Cursor AI는 `.cursorrules` 파일을 자동으로 읽고 다음 규칙을 준수합니다:

1. **TypeScript Strict Mode**: `any` 사용 금지
2. **한국어 커밋 메시지**: Semantic Commit 형식
3. **IPC 에러 처리**: `{ success, error, data }` 형식
4. **보안 체크**: Path Traversal, XSS, Injection 방지
5. **파일 읽기 우선**: 수정 전 반드시 Read

## 참고 문서

프로젝트에 대한 자세한 내용은 다음 문서를 참고하세요:

- `CLAUDE.md`: 종합 프로젝트 가이드
- `AGENT.md`: AI Agent 개발 가이드
- `GEMINI.md`: Gemini용 가이드
- `.claude/skills/`: 12개의 상세 기술 가이드

## 트러블슈팅

### Cursor AI가 `.cursorrules`을 읽지 않는 경우

1. Cursor 재시작
2. 프로젝트 다시 열기
3. `.cursorrules` 파일 위치 확인 (프로젝트 루트)

### TypeScript 에러가 표시되지 않는 경우

```bash
# TypeScript 수동 체크
pnpm type-check
```

### Prettier가 작동하지 않는 경우

1. Prettier 확장 프로그램 설치 확인
2. `.vscode/settings.json`의 `editor.formatOnSave` 확인
3. Prettier 설정 파일 확인 (`.prettierrc.json`)

## 유용한 단축키 (Cursor)

| 단축키                 | 기능             |
| ---------------------- | ---------------- |
| `Ctrl/Cmd + K`         | Inline AI 편집   |
| `Ctrl/Cmd + L`         | AI Chat          |
| `Ctrl/Cmd + I`         | AI에게 작업 요청 |
| `Ctrl/Cmd + Shift + P` | Command Palette  |
| `Ctrl/Cmd + P`         | 파일 빠른 열기   |
| `Ctrl/Cmd + Shift + F` | 전역 검색        |
| `Ctrl/Cmd + ,`         | 설정             |

## 기여

Cursor 설정을 개선하고 싶으신 경우:

1. `.cursorrules` 또는 `.vscode/*.json` 수정
2. 변경사항 테스트
3. 한국어 커밋 메시지로 커밋
4. Pull Request 생성

---

**Cursor AI와 함께 즐거운 코딩 되세요!** 🚀
