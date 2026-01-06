---
description: Review changes and create git commit (Korean message)
---

# Create Git Commit

변경사항을 검토하고 한국어로 커밋 메시지를 작성하여 커밋합니다.

## Commit Process

1. **보안 검사** (필수):

   ```bash
   /security
   ```

   보안 문제가 있으면 커밋하지 않고 수정

2. **변경사항 확인**:

   ```bash
   git status
   git diff
   ```

3. **Staged 파일 확인**:

   ```bash
   git diff --staged
   ```

4. **커밋 메시지 작성** (한국어):
   - Semantic Commit 형식 사용:
     - `feat:` - 새로운 기능
     - `fix:` - 버그 수정
     - `chore:` - 설정, 빌드 관련
     - `docs:` - 문서 수정
     - `refactor:` - 리팩토링
     - `test:` - 테스트 추가/수정
     - `style:` - 코드 스타일 변경

5. **커밋 생성**:
   ```bash
   git add [files]
   git commit -m "타입: 변경사항 설명"
   ```

## Commit Message Examples

```bash
# 새 기능
git commit -m "feat: LangGraph 에이전트 통합 구현"

# 버그 수정
git commit -m "fix: IPC 스트리밍 메모리 누수 해결"

# 리팩토링
git commit -m "refactor: MCP 클라이언트 타입 안전성 개선"

# 문서
git commit -m "docs: RAG 설정 가이드 추가"

# 설정
git commit -m "chore: Claude Code skills 업데이트"
```

## Commit Guidelines

### 커밋할 파일 그룹화

관련된 파일끼리 그룹화하여 분할 커밋:

```bash
# Frontend 변경사항
git add components/ app/
git commit -m "feat: 채팅 UI 컴포넌트 추가"

# Backend 변경사항
git add electron/ lib/
git commit -m "feat: 채팅 IPC 핸들러 구현"

# 문서
git add docs/ README.md
git commit -m "docs: 채팅 기능 문서 추가"
```

### 제외할 파일

절대 커밋하지 말 것:

- `.env*` - 환경 변수
- `*.secrets` - 비밀 정보
- `node_modules/` - 의존성
- `dist/`, `.next/`, `out/` - 빌드 결과물
- 개인 설정 파일

### 메시지 작성 팁

1. **현재형 사용**: "추가함" → "추가"
2. **구체적으로**: "버그 수정" → "로그인 시 토큰 만료 에러 수정"
3. **Why 설명**: 무엇을 했는지뿐만 아니라 왜 했는지
4. **50자 이내**: 첫 줄은 간결하게

## Pre-commit Checks

커밋 전 반드시 확인:

- [ ] 보안 검사 완료 (`/security`)
- [ ] 타입 체크 통과 (`pnpm run type-check`)
- [ ] 린트 통과 (`pnpm run lint`)
- [ ] 테스트 통과 (`pnpm run test`)
- [ ] API 키나 비밀 정보 없음
- [ ] 개인 정보 (경로, IP 등) 없음

## After Commit

1. **커밋 확인**:

   ```bash
   git log -1
   ```

2. **Push** (CLAUDE.md 설정에 따라):
   ```bash
   git push
   ```

## Amend Commit

마지막 커밋 수정:

```bash
git add [forgotten-files]
git commit --amend --no-edit
```

메시지 수정:

```bash
git commit --amend -m "새로운 커밋 메시지"
```

⚠️ **주의**: 이미 push한 커밋은 amend 하지 말 것 (force push 필요)
