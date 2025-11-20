# GitHub Repository Setup Guide

이 가이드는 SEPilot Desktop 저장소를 GitHub에서 최적으로 설정하는 방법을 안내합니다.

## 목차

- [초기 설정](#초기-설정)
- [GitHub Actions 설정](#github-actions-설정)
- [브랜치 보호 규칙](#브랜치-보호-규칙)
- [라벨 설정](#라벨-설정)
- [시크릿 설정](#시크릿-설정)
- [선택적 설정](#선택적-설정)

## 초기 설정

### 1. Repository 생성

```bash
# GitHub CLI를 사용하는 경우
gh repo create vtopia-dev/sepilot_desktop --public --description "LLM Desktop Application with LangGraph, RAG, and MCP"

# 또는 GitHub 웹사이트에서 직접 생성
```

### 2. Repository 기본 설정

GitHub 웹사이트에서 Settings 탭으로 이동:

#### General
- ✅ **Issues** 활성화
- ✅ **Discussions** 활성화 (선택사항)
- ✅ **Projects** 활성화 (선택사항)
- ✅ **Wiki** 비활성화 (문서는 README.md와 docs/ 폴더 사용)
- ✅ **Sponsorships** 활성화 (선택사항)

#### Pull Requests
- ✅ **Allow squash merging** 활성화
- ✅ **Allow merge commits** 활성화
- ✅ **Allow rebase merging** 활성화
- ✅ **Automatically delete head branches** 활성화

## GitHub Actions 설정

### 1. Actions 권한 설정

**Settings → Actions → General**

- Workflow permissions:
  - ✅ **Read and write permissions** 선택
  - ✅ **Allow GitHub Actions to create and approve pull requests** 체크

### 2. Required workflows

다음 워크플로우들이 자동으로 실행됩니다:

- ✅ CI (Lint, Type Check, Build)
- ✅ CodeQL Security Scan
- ✅ Auto Labeler
- ✅ Stale Issues/PRs
- ✅ PR Size Labeler
- ✅ Lint PR Title
- ✅ Greetings
- ✅ Release Drafter
- ✅ Auto-merge Dependabot

## 브랜치 보호 규칙

### main 브랜치 보호

**Settings → Branches → Add branch protection rule**

#### Branch name pattern
```
main
```

#### 필수 설정
- ✅ **Require a pull request before merging**
  - ✅ Required approvals: 1
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners (선택사항)

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - Required status checks:
    - `Lint`
    - `Type Check`
    - `Build (ubuntu-latest)`
    - `Build (windows-latest)`
    - `Build (macos-latest)`

- ✅ **Require conversation resolution before merging**

- ✅ **Require signed commits** (선택사항, 권장)

- ✅ **Require linear history** (선택사항)

- ✅ **Include administrators** (선택사항)

#### 선택적 설정
- ⬜ **Allow force pushes** (비활성화 권장)
- ⬜ **Allow deletions** (비활성화 권장)

### develop 브랜치 보호 (선택사항)

개발 브랜치를 사용하는 경우 유사한 규칙 적용:

```
develop
```

- main보다 덜 엄격한 규칙 적용 가능
- Status checks 필수
- 1명 이상의 리뷰 필수

## 라벨 설정

### 자동 라벨 생성

GitHub CLI를 사용하여 라벨을 자동으로 생성:

```bash
# GitHub CLI 설치 확인
gh --version

# 저장소 루트에서 실행
gh label sync --file .github/labels.yml
```

### 수동 라벨 생성

**Settings → Labels** 에서 `.github/labels.yml` 파일의 라벨을 수동으로 생성할 수 있습니다.

## 시크릿 설정

### 필수 시크릿

**Settings → Secrets and variables → Actions → New repository secret**

현재 대부분의 워크플로우는 `GITHUB_TOKEN`을 사용하므로 추가 시크릿이 필요하지 않습니다.

### 릴리즈용 시크릿 (선택사항)

macOS 코드 사인을 위한 시크릿 (릴리즈 시 필요):

#### CSC_LINK
- **설명**: macOS 코드 서명 인증서 (Base64 인코딩)
- **값 생성 방법**:
  ```bash
  base64 -i certificate.p12 | pbcopy
  ```

#### CSC_KEY_PASSWORD
- **설명**: 인증서 비밀번호
- **값**: 인증서 생성 시 설정한 비밀번호

### Windows 코드 서명 (선택사항)

#### WINDOWS_CSC_LINK
- Windows 코드 서명 인증서 (Base64)

#### WINDOWS_CSC_KEY_PASSWORD
- 인증서 비밀번호

## 선택적 설정

### 1. Code Owners 설정

`.github/CODEOWNERS` 파일 생성:

```
# Global owners
* @vtopia-dev

# Electron specific
/electron/ @vtopia-dev

# LangGraph integration
/lib/langgraph/ @vtopia-dev

# Documentation
*.md @vtopia-dev
```

### 2. Discussions 카테고리

**Discussions 탭 → Categories** 에서 다음 카테고리 생성:

- 📢 **Announcements** - 공지사항
- 💡 **Ideas** - 기능 아이디어
- 🙏 **Q&A** - 질문과 답변
- 💬 **General** - 일반 토론
- 🎉 **Show and tell** - 작품 공유

### 3. Projects (선택사항)

**Projects 탭** 에서 프로젝트 보드 생성:

- **SEPilot Desktop Roadmap**
  - Columns: Backlog, To Do, In Progress, Done
  - Link issues and PRs

### 4. Release Settings

**Settings → General → Features**

- ✅ Releases 활성화
- Release Drafter가 자동으로 릴리즈 노트를 생성합니다

### 5. Security

#### Dependabot Alerts
**Settings → Security & analysis**

- ✅ **Dependency graph** 활성화
- ✅ **Dependabot alerts** 활성화
- ✅ **Dependabot security updates** 활성화

#### Code Scanning
- ✅ **CodeQL analysis** 활성화 (워크플로우로 이미 설정됨)

#### Secret Scanning
- ✅ **Secret scanning** 활성화 (GitHub Advanced Security)

### 6. Notifications

**Settings → Notifications**

팀원들에게 적절한 알림 설정 권장:

- ✅ Issues 생성 시
- ✅ PR 리뷰 요청 시
- ✅ PR 머지 시
- ✅ 릴리즈 생성 시

## 확인 체크리스트

완료 후 다음 항목들을 확인하세요:

- [ ] Repository 기본 설정 완료
- [ ] GitHub Actions 활성화 및 권한 설정
- [ ] main 브랜치 보호 규칙 설정
- [ ] 라벨 생성 완료
- [ ] Dependabot 활성화
- [ ] CodeQL 스캔 활성화
- [ ] Issue 템플릿 작동 확인
- [ ] PR 템플릿 작동 확인
- [ ] CI 워크플로우 정상 작동 확인
- [ ] 첫 PR 생성 및 머지 테스트

## 추가 리소스

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Dependabot Documentation](https://docs.github.com/en/code-security/dependabot)
- [CodeQL Documentation](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)

## 문제 해결

### GitHub Actions가 실행되지 않는 경우

1. Settings → Actions → General에서 워크플로우 권한 확인
2. 워크플로우 파일 YAML 구문 확인
3. GitHub Actions 탭에서 실패 로그 확인

### Dependabot PR이 생성되지 않는 경우

1. `.github/dependabot.yml` 파일 위치 확인
2. YAML 구문 확인
3. Settings → Security & analysis에서 Dependabot 활성화 확인

### 라벨이 자동으로 추가되지 않는 경우

1. `.github/labeler.yml` 파일 확인
2. labeler 워크플로우 실행 로그 확인
3. 라벨이 저장소에 실제로 존재하는지 확인

---

설정 과정에서 문제가 발생하면 Issues를 통해 문의해주세요!
