---
description: Build the application and fix any errors
---

# Build Application

애플리케이션을 빌드하고 발생하는 에러를 수정합니다.

## Build Steps

1. **Type check first**:

   ```bash
   pnpm run type-check
   ```

   타입 에러가 있으면 먼저 수정

2. **Run lint**:

   ```bash
   pnpm run lint
   ```

   린트 에러 수정

3. **Build application**:
   ```bash
   pnpm run build
   ```

## Build Modes

### Development Build

개발용 빌드 (빠르지만 최적화 안됨):

```bash
pnpm run dev
```

### Production Build

프로덕션 빌드 (최적화됨):

```bash
pnpm run build
```

### Electron Package

실행 파일 생성:

```bash
pnpm run package
```

## Common Build Errors

### TypeScript Errors

```
error TS2339: Property 'x' does not exist on type 'Y'
```

- 타입 정의 확인
- 인터페이스 업데이트
- 타입 가드 추가

### Import Errors

```
Cannot find module '@/lib/utils'
```

- tsconfig.json paths 설정 확인
- 파일 경로 확인
- 누락된 파일 추가

### Dependency Errors

```
Module not found: Can't resolve 'package-name'
```

```bash
pnpm install package-name
```

### Next.js Build Errors

```
Error: Build optimization failed
```

- 사용하지 않는 import 제거
- 동적 import 사용 검토
- next.config.js 설정 확인

## Build Optimization

### Bundle Size Analysis

```bash
pnpm run analyze
```

### Code Splitting

큰 컴포넌트는 동적 import:

```typescript
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  ssr: false,
  loading: () => <div>Loading...</div>,
});
```

### Tree Shaking

사용하지 않는 코드 자동 제거:

```typescript
// ✅ Named imports (tree-shakeable)
import { Button } from '@/components/ui/button';

// ❌ Default import (not tree-shakeable)
import AllComponents from '@/components/ui';
```

## After Build

1. 빌드 성공 확인
2. 애플리케이션 실행하여 동작 확인
3. 주요 기능 테스트
4. 커밋 전 `/security` 실행하여 보안 검사

## Distribution

빌드 완료 후 배포:

```bash
# macOS
pnpm run build:mac

# Windows
pnpm run build:win

# Linux
pnpm run build:linux

# Directory only (빠른 테스트용)
pnpm run package
```

## Troubleshooting

### Clean Build

캐시 문제가 있을 경우:

```bash
rm -rf .next out dist
pnpm run build
```

### Dependency Issues

의존성 재설치:

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```
