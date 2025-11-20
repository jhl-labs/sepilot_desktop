# GitHub Configuration Overview

SEPilot Desktop 프로젝트의 GitHub 구성 파일들에 대한 전체 개요입니다.

## 📁 디렉토리 구조

```
.github/
├── workflows/              # GitHub Actions 워크플로우
│   ├── ci.yml             # CI (Lint, Type Check, Build)
│   ├── codeql.yml         # CodeQL 보안 스캔
│   ├── release.yml        # 릴리즈 빌드
│   ├── release-drafter.yml # 자동 릴리즈 노트 생성
│   ├── labeler.yml        # PR 자동 라벨링
│   ├── stale.yml          # Stale 이슈/PR 관리
│   ├── greetings.yml      # 첫 기여자 환영 메시지
│   ├── pr-size-labeler.yml # PR 크기별 라벨링
│   ├── auto-merge-dependabot.yml # Dependabot PR 자동 머지
│   └── lint-pr-title.yml  # PR 제목 검증
├── ISSUE_TEMPLATE/        # Issue 템플릿
│   ├── bug_report.yml     # 버그 리포트
│   ├── feature_request.yml # 기능 요청
│   ├── question.yml       # 질문
│   └── config.yml         # Issue 템플릿 설정
├── PULL_REQUEST_TEMPLATE.md # PR 템플릿
├── dependabot.yml         # Dependabot 설정
├── labeler.yml            # 자동 라벨 규칙
├── labels.yml             # 라벨 정의
├── release-drafter.yml    # 릴리즈 노트 설정
├── FUNDING.yml            # 후원 정보
├── SETUP_GUIDE.md         # 저장소 설정 가이드
├── README_BADGES.md       # README 배지 가이드
└── OVERVIEW.md            # 이 파일
```

## 🔄 GitHub Actions Workflows

### 1. CI Workflow (`ci.yml`)

**트리거**: Push (main, develop), Pull Request

**작업**:
- ✅ ESLint 검사
- ✅ Prettier 포맷 검사
- ✅ TypeScript 타입 체크
- ✅ 멀티 플랫폼 빌드 (Ubuntu, Windows, macOS)

**사용 시나리오**: 모든 PR과 Push에서 자동으로 코드 품질 검증

---

### 2. CodeQL Security Scan (`codeql.yml`)

**트리거**: Push (main, develop), Pull Request, 주간 스케줄 (월요일)

**작업**:
- 🔒 JavaScript/TypeScript 코드 보안 취약점 스캔
- 🔍 SAST (Static Application Security Testing)

**사용 시나리오**: 보안 취약점 조기 발견

---

### 3. Release (`release.yml`)

**트리거**: 태그 푸시 (`v*`)

**작업**:
- 📦 Electron 앱 빌드 (Linux, Windows, macOS)
- 🚀 GitHub Release 생성
- 📎 빌드 아티팩트 업로드

**사용 방법**:
```bash
git tag v0.2.0
git push origin v0.2.0
```

---

### 4. Release Drafter (`release-drafter.yml`)

**트리거**: PR 머지, Push to main

**작업**:
- 📝 자동으로 릴리즈 노트 초안 생성
- 🏷️ 라벨 기반 변경사항 분류
- 🔢 자동 버전 번호 제안

**사용 시나리오**: 릴리즈 준비 시 변경사항 자동 문서화

---

### 5. Auto Labeler (`labeler.yml`)

**트리거**: PR 생성, 동기화

**작업**:
- 🏷️ 파일 경로 기반 자동 라벨 추가
- 📂 컴포넌트별 분류

**라벨링 규칙**:
- `components/**/*` → `ui`
- `electron/**/*` → `electron`
- `lib/langgraph/**/*` → `langgraph`
- `lib/mcp/**/*` → `mcp`
- 등등...

---

### 6. Stale Issues/PRs (`stale.yml`)

**트리거**: 매일 자동 실행

**작업**:
- ⏰ 60일간 활동 없는 이슈/PR을 `stale` 라벨 추가
- 🗑️ 14일 후에도 활동 없으면 자동 종료

**제외 대상**:
- `pinned`, `security`, `critical` 라벨

---

### 7. Greetings (`greetings.yml`)

**트리거**: 첫 이슈 생성, 첫 PR 생성

**작업**:
- 👋 첫 기여자에게 환영 메시지 자동 전송
- 📖 기여 가이드라인 안내

---

### 8. PR Size Labeler (`pr-size-labeler.yml`)

**트리거**: PR 생성, 동기화

**작업**:
- 📏 PR 크기에 따라 라벨 자동 추가
  - `size/xs`: 0-10 lines
  - `size/s`: 10-100 lines
  - `size/m`: 100-500 lines
  - `size/l`: 500-1000 lines
  - `size/xl`: 1000+ lines

**제외 파일**: lockfiles (package-lock.json, pnpm-lock.yaml)

---

### 9. Auto-merge Dependabot (`auto-merge-dependabot.yml`)

**트리거**: Dependabot PR

**작업**:
- 🤖 Patch/Minor 업데이트 자동 승인 및 머지
- ⚠️ Major 업데이트는 수동 리뷰 필요

---

### 10. Lint PR Title (`lint-pr-title.yml`)

**트리거**: PR 생성, 제목 수정

**작업**:
- ✅ Semantic PR 제목 검증
- 📝 커밋 컨벤션 강제 (`feat:`, `fix:`, `docs:`, 등)

**허용 형식**:
```
feat(chat): Add message edit functionality
fix(electron): Fix window size on macOS
docs: Update README
```

---

## 📋 Issue Templates

### 1. Bug Report (`bug_report.yml`)
- 🐛 버그 리포트 구조화된 양식
- 필수 정보: 설명, 재현 방법, 예상/실제 동작, OS, 버전

### 2. Feature Request (`feature_request.yml`)
- 💡 기능 요청 양식
- 필수 정보: 문제 설명, 제안 솔루션, 대안, 컴포넌트, 우선순위

### 3. Question (`question.yml`)
- ❓ 질문 양식
- 카테고리별 분류 (설치, 설정, 사용법, 통합 등)

### 4. Config (`config.yml`)
- 🔗 외부 링크 제공 (문서, 보안 정책)
- Blank issues 비활성화

---

## 🏷️ Labels

### 타입 라벨
- `bug` - 버그
- `enhancement` - 개선사항
- `feature` - 새 기능
- `documentation` - 문서
- `question` - 질문

### 우선순위 라벨
- `priority/critical` - 긴급
- `priority/high` - 높음
- `priority/medium` - 보통
- `priority/low` - 낮음

### 상태 라벨
- `needs-triage` - 분류 필요
- `in-progress` - 진행 중
- `blocked` - 차단됨
- `ready` - 준비됨
- `stale` - 오래됨

### 컴포넌트 라벨
- `ui` - UI/UX
- `electron` - Electron
- `langgraph` - LangGraph
- `rag` - RAG 시스템
- `mcp` - MCP 통합
- `llm` - LLM 제공자

### 크기 라벨
- `size/xs`, `size/s`, `size/m`, `size/l`, `size/xl`

### 의존성 라벨
- `dependencies` - 의존성 업데이트
- `npm` - NPM 패키지
- `github-actions` - Actions 업데이트

### 특수 라벨
- `good first issue` - 초보자 친화적
- `help wanted` - 도움 필요
- `security` - 보안 관련
- `breaking` - Breaking change

---

## 🤖 Dependabot

**업데이트 스케줄**: 매주 월요일 09:00 (KST)

**관리 대상**:
- NPM 패키지
- GitHub Actions

**설정**:
- PR 개수 제한: 10개
- 자동 라벨링: `dependencies`, `npm` 또는 `github-actions`
- Major 업데이트 무시: React, Next.js, Electron (안정성)

**그룹화**:
- Radix UI 패키지
- TypeScript Types
- ESLint 패키지
- LangChain 패키지

---

## 📦 Release Management

### Release Drafter

**자동 분류**:
- 🚀 Features
- 🐛 Bug Fixes
- 📚 Documentation
- 🔒 Security
- ⚡ Performance
- 🧹 Maintenance
- 🎨 UI/UX
- 🤖 LangGraph
- 📊 RAG System
- 🔌 MCP Integration

**버전 관리**:
- `major` 라벨 → Major 버전 증가
- `minor`, `enhancement`, `feature` → Minor 증가
- `patch`, `bug`, `fix` → Patch 증가

---

## 🔐 Security

### 보안 기능
- ✅ CodeQL 스캔
- ✅ Dependabot 보안 업데이트
- ✅ 비밀 스캔 (GitHub Advanced Security)
- ✅ 보안 정책 (SECURITY.md)

### 보안 보고
- GitHub Security Advisory
- 비공개 이슈
- 책임 있는 공개 정책

---

## 🎯 Best Practices

### PR 제출 전 체크리스트
- [ ] `pnpm run lint` 통과
- [ ] `pnpm run type-check` 통과
- [ ] 로컬에서 빌드 테스트
- [ ] PR 템플릿 작성 완료
- [ ] Semantic PR 제목 작성

### 코드 리뷰 가이드라인
- 건설적인 피드백
- 명확한 설명과 예시
- 대안 제시
- 칭찬도 잊지 않기

### 릴리즈 프로세스
1. 변경사항을 main에 머지
2. Release Drafter가 자동으로 노트 생성
3. 릴리즈 노트 검토 및 수정
4. 버전 태그 생성 (`v1.2.3`)
5. 자동 빌드 및 배포

---

## 📚 추가 문서

- [SETUP_GUIDE.md](SETUP_GUIDE.md) - 저장소 초기 설정 가이드
- [README_BADGES.md](README_BADGES.md) - README 배지 추가 가이드
- [../CONTRIBUTING.md](../CONTRIBUTING.md) - 기여 가이드
- [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) - 행동 강령
- [../SECURITY.md](../SECURITY.md) - 보안 정책

---

## 🛠️ 유지보수

### 정기 점검 사항

**월간**:
- [ ] Stale 이슈/PR 검토
- [ ] Dependabot PR 검토
- [ ] 라벨 사용 현황 확인

**분기별**:
- [ ] 워크플로우 실행 통계 확인
- [ ] 보안 스캔 결과 검토
- [ ] 커뮤니티 가이드라인 업데이트

**연간**:
- [ ] Actions 버전 업데이트
- [ ] 보안 정책 검토
- [ ] 전체 문서 업데이트

---

## 💡 팁

### GitHub CLI 활용

```bash
# 라벨 동기화
gh label sync --file .github/labels.yml

# 이슈 생성
gh issue create --title "Bug: Something is broken" --label bug

# PR 생성
gh pr create --title "feat: Add new feature" --body "Description"

# Release 생성
gh release create v1.0.0 --title "Release v1.0.0" --notes "Release notes"
```

### 워크플로우 디버깅

```bash
# 로컬에서 워크플로우 테스트 (act 사용)
act -j ci

# 워크플로우 실행 로그 확인
gh run list
gh run view [run-id]
```

---

**마지막 업데이트**: 2025-01-21
