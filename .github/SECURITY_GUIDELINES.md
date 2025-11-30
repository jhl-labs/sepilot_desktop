# GitHub Actions Security Guidelines

이 문서는 SEPilot Desktop 프로젝트의 GitHub Actions 워크플로우에 대한 보안 가이드라인입니다.

## Secrets Management

### 현재 등록된 Secrets

- `CODECOV_TOKEN`: Codecov 통합을 위한 토큰
- `GITHUB_TOKEN`: 자동으로 제공되는 토큰 (등록 불필요)

### Secrets 추가 시 주의사항

1. **최소 권한 원칙**
   - 필요한 최소한의 권한만 부여
   - Read-only 토큰 우선 사용

2. **토큰 만료**
   - 가능한 경우 만료 기간 설정
   - 정기적으로 토큰 갱신

3. **범위 제한**
   - 특정 환경에만 접근 가능하도록 설정
   - 프로덕션 환경은 별도 관리

4. **감사 로그**
   - Secrets 사용 내역 정기 검토
   - 의심스러운 활동 모니터링

## Workflow Permissions

### 기본 원칙

모든 워크플로우는 명시적인 `permissions` 블록을 포함해야 합니다:

```yaml
permissions:
  contents: read # 저장소 읽기만 허용
  pull-requests: write # PR 코멘트 작성 허용
```

### 권한 유형

- `contents: read` - 코드 읽기 (대부분의 워크플로우)
- `contents: write` - 코드 쓰기 (릴리스, auto-merge)
- `pull-requests: write` - PR 코멘트 (테스트 결과)
- `issues: write` - 이슈 코멘트
- `security-events: write` - 보안 스캔 결과 업로드
- `actions: read` - Actions 아티팩트 읽기

### 위험한 권한 조합

다음 권한은 함께 사용 시 주의가 필요합니다:

```yaml
# ⚠️ 위험: 모든 권한 허용
permissions: write-all

# ⚠️ 위험: contents와 pull-requests 모두 write
permissions:
  contents: write
  pull-requests: write
```

## Fork PR Security

### Pull Request 트리거

Fork에서 온 PR은 secrets에 접근할 수 없도록 해야 합니다:

```yaml
# ✅ 안전: pull_request 사용
on:
  pull_request:

# ⚠️ 위험: pull_request_target 사용 시 주의
on:
  pull_request_target:  # Fork PR도 secrets 접근 가능
```

### Dependabot PR

Dependabot PR은 반드시 같은 저장소에서만 실행되도록 검증:

```yaml
if: |
  github.actor == 'dependabot[bot]' &&
  github.event.pull_request.head.repo.full_name == github.repository
```

## Third-Party Actions

### 버전 고정

Third-party actions는 태그가 아닌 커밋 SHA를 사용:

```yaml
# ❌ 위험: 태그 사용
- uses: actions/checkout@v4

# ✅ 권장: 커밋 SHA 사용 (+ 주석으로 버전 표시)
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
```

### 신뢰할 수 있는 Actions

다음 출처의 actions만 사용:

- GitHub 공식 (actions/_, github/_)
- 검증된 파트너 (pnpm/_, codecov/_)
- 충분한 star와 활발한 유지보수

### 새로운 Action 추가 전 확인사항

- [ ] 저장소의 star 수와 fork 수
- [ ] 최근 커밋 날짜
- [ ] 오픈 이슈와 PR 수
- [ ] 보안 취약점 이력
- [ ] 코드 리뷰 (permissions 요청 확인)

## Environment Variables

### 민감한 정보 노출 방지

```yaml
# ❌ 위험: 환경 변수 출력
- run: echo "Token is ${{ secrets.MY_TOKEN }}"

# ✅ 안전: 마스킹된 변수 사용
- run: |
    echo "::add-mask::${{ secrets.MY_TOKEN }}"
    echo "Processing token..."
```

### 디버그 모드 주의

```yaml
# ⚠️ 주의: 디버그 모드에서는 secrets가 노출될 수 있음
- run: set -x # bash debug mode
```

## 워크플로우별 보안 체크리스트

### CI 워크플로우

- [ ] `permissions` 명시
- [ ] Fork PR에서 secrets 접근 불가
- [ ] 테스트 실패 시 민감한 정보 노출 안 함
- [ ] 아티팩트에 credentials 포함 안 함

### 보안 스캔 워크플로우

- [ ] `security-events: write` 권한만 부여
- [ ] SARIF 파일 업로드 시 민감한 정보 제거
- [ ] 스캔 결과를 PR에 코멘트 시 필터링

### 릴리스 워크플로우

- [ ] `contents: write` 권한 필요
- [ ] 수동 트리거만 허용 (`workflow_dispatch`)
- [ ] 릴리스 태그 검증
- [ ] 체크섬 생성 및 검증

### Auto-merge 워크플로우

- [ ] Dependabot만 허용
- [ ] 같은 저장소 PR만 허용
- [ ] Patch/Minor 업데이트만 자동 머지
- [ ] CI 통과 확인

## 정기 점검 사항

### 매주

- [ ] 실패한 워크플로우 검토
- [ ] 보안 스캔 결과 확인
- [ ] Dependabot PR 리뷰

### 매월

- [ ] Secrets 사용 내역 감사
- [ ] Third-party actions 업데이트 확인
- [ ] 워크플로우 권한 검토

### 매 분기

- [ ] 보안 정책 문서 업데이트
- [ ] SBOM 생성 및 검토
- [ ] License compliance 확인

## 사고 대응

### Secrets 유출 의심 시

1. **즉시 조치**
   - 해당 Secret 삭제 및 재생성
   - 관련 서비스의 토큰 무효화
   - Git history 확인

2. **조사**
   - 워크플로우 실행 로그 검토
   - 최근 PR 및 커밋 확인
   - 접근 로그 분석

3. **예방**
   - 워크플로우 보안 강화
   - 모니터링 강화
   - 팀원 교육

### 악의적인 PR 발견 시

1. PR 즉시 닫기
2. 사용자 차단 (필요시)
3. 보안 팀에 보고
4. 워크플로우 보안 재검토

## 참고 자료

- [GitHub Actions Security Best Practices](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [OWASP CI/CD Security](https://owasp.org/www-project-devsecops-guideline/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)

---

**최종 업데이트**: 2025-12-01
