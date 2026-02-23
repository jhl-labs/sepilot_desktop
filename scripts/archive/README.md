# Archived Scripts

이 폴더에는 더 이상 사용되지 않거나 다른 스크립트로 대체된 스크립트들이 보관되어 있습니다.

## 📦 보관된 스크립트 목록

### 대체된 스크립트

- **build-extension.js** → `build-workspace-extensions.js`로 대체
  - 단일 Extension 빌드 스크립트
  - 이제 `build-workspace-extensions.js`가 모든 Extension을 한 번에 빌드

- **package-extension.js** → `package-all-extensions.js`로 대체
  - 단일 Extension 패키징 스크립트
  - 이제 `package-all-extensions.js`가 모든 Extension을 한 번에 패키징

### 개발/디버깅 전용

- **repro-bad-token.js** - 토큰 에러 재현 테스트
  - 특정 버그를 재현하기 위한 임시 스크립트

- **repro-mcp.js** - MCP 이슈 재현
  - MCP 관련 이슈를 재현하기 위한 임시 스크립트

### 초기 설정용

- **create-icon.js** - Placeholder 아이콘 생성
  - 프로젝트 초기 설정 시 사용하는 아이콘 생성 스크립트
  - `build-icon.js`와는 다른 용도 (초기 생성 vs 빌드)

- **fix-extension-types.js** - Extension 타입 수정 유틸리티
  - 특정 타입 문제를 수정하기 위한 일회성 스크립트

## 🔄 복원이 필요한 경우

이 스크립트들은 삭제되지 않고 보관되어 있으므로, 필요한 경우 언제든지 복원할 수 있습니다:

```bash
# scripts/archive/ 에서 scripts/ 로 이동
mv scripts/archive/script-name.js scripts/
```

## 📌 참고

- 이 스크립트들은 package.json의 scripts 섹션에서 참조되지 않습니다
- 특정 디버깅이나 일회성 작업을 위해 필요한 경우 직접 실행할 수 있습니다
- 정기적으로 검토하여 완전히 삭제할지 결정합니다
