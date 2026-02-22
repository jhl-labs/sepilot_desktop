# app/ - Next.js App Router

> Next.js 16 App Router 기반 프론트엔드 페이지 및 라우트 정의

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 파일](#주요-파일)
- [라우트 구조](#라우트-구조)
- [새 페이지 추가 가이드](#새-페이지-추가-가이드)
- [레이아웃 시스템](#레이아웃-시스템)
- [API Routes](#api-routes)
- [주의사항](#주의사항)
- [관련 문서](#관련-문서)

---

## 개요

`app/` 디렉토리는 Next.js 16의 **App Router** 기반 프론트엔드를 담당합니다. 모든 페이지, 레이아웃, API Routes가 이 디렉토리 아래에 위치합니다.

### 핵심 특징

- **App Router**: Next.js 13+의 새로운 라우팅 시스템
- **Server Components**: 기본적으로 React Server Components 사용
- **File-based Routing**: 파일 시스템 기반 자동 라우팅
- **Layouts**: 중첩 가능한 레이아웃 시스템
- **Loading/Error States**: 파일 기반 로딩 및 에러 상태 관리

---

## 폴더 구조

```
app/
├── layout.tsx                    # Root 레이아웃 (전체 앱에 적용)
├── page.tsx                      # 메인 페이지 (/)
├── globals.css                   # 글로벌 스타일 (Tailwind CSS)
├── favicon.ico                   # 파비콘
│
├── api/                          # API Routes
│   └── chat/
│       └── stream/
│           └── route.ts          # POST /api/chat/stream - 스트리밍 채팅 API
│
├── notification/                 # 알림 페이지
│   ├── page.tsx                  # /notification
│   └── layout.tsx                # 알림 전용 레이아웃 (선택적)
│
└── quick-input/                  # 빠른 입력 페이지
    └── page.tsx                  # /quick-input
```

---

## 주요 파일

### layout.tsx (Root Layout)

**역할**: 전체 애플리케이션의 최상위 레이아웃

```typescript
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SEPilot Desktop',
  description: 'AI-powered Desktop Application',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
```

**특징**:

- `suppressHydrationWarning`: Electron 환경에서 hydration 경고 억제
- `lang="ko"`: 기본 언어 한국어
- `Inter` 폰트 적용

### page.tsx (메인 페이지)

**역할**: 루트 경로(`/`)의 메인 페이지

```typescript
// app/page.tsx
'use client';

import { MainLayout } from '@/components/layout/MainLayout';

export default function Home() {
  return <MainLayout />;
}
```

**특징**:

- `'use client'`: Client Component (상태 관리 필요)
- `MainLayout` 컴포넌트를 렌더링 (실제 채팅 UI 등)

### globals.css

**역할**: 글로벌 스타일 정의

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    /* ... 기타 CSS 변수 */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... 다크 모드 변수 */
  }
}
```

**특징**:

- Tailwind CSS 지시문
- CSS 변수 기반 테마 시스템
- 다크 모드 지원

---

## 라우트 구조

### 현재 라우트

| 경로               | 파일                           | 설명                     |
| ------------------ | ------------------------------ | ------------------------ |
| `/`                | `app/page.tsx`                 | 메인 페이지 (MainLayout) |
| `/notification`    | `app/notification/page.tsx`    | 알림 페이지              |
| `/quick-input`     | `app/quick-input/page.tsx`     | 빠른 입력 페이지         |
| `/api/chat/stream` | `app/api/chat/stream/route.ts` | 스트리밍 채팅 API        |

### 라우트 규칙

**파일 컨벤션**:

- `page.tsx`: 라우트 엔드포인트 (실제 렌더링되는 페이지)
- `layout.tsx`: 레이아웃 (하위 페이지에 공유)
- `loading.tsx`: 로딩 상태 (Suspense 폴백)
- `error.tsx`: 에러 상태 (Error Boundary)
- `route.ts`: API Route (서버 엔드포인트)

**예시 - 새 라우트 추가**:

```
app/
└── settings/              # /settings 라우트
    ├── layout.tsx         # 설정 페이지 레이아웃
    ├── page.tsx           # /settings (기본)
    ├── loading.tsx        # 로딩 상태
    ├── error.tsx          # 에러 상태
    └── profile/           # /settings/profile 라우트
        └── page.tsx       # /settings/profile
```

---

## 새 페이지 추가 가이드

### 1. 디렉토리 생성

```bash
# 예시: /dashboard 페이지 추가
mkdir -p app/dashboard
```

### 2. page.tsx 생성

```typescript
// app/dashboard/page.tsx
'use client';

import { useState } from 'react';

export default function DashboardPage() {
  const [data, setData] = useState(null);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">대시보드 페이지입니다.</p>
    </div>
  );
}
```

### 3. layout.tsx 추가 (선택적)

```typescript
// app/dashboard/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* 사이드바 */}
      <aside className="w-64 bg-muted">
        <nav>{/* 네비게이션 메뉴 */}</nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```

### 4. loading.tsx 추가 (선택적)

```typescript
// app/dashboard/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  );
}
```

### 5. error.tsx 추가 (선택적)

```typescript
// app/dashboard/error.tsx
'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-bold">오류가 발생했습니다</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
        다시 시도
      </button>
    </div>
  );
}
```

### 6. 네비게이션 추가

메인 레이아웃에서 새 페이지로 이동할 수 있도록 네비게이션 추가:

```typescript
// components/layout/MainLayout.tsx
import Link from 'next/link';

export function MainLayout() {
  return (
    <div>
      <nav>
        <Link href="/">홈</Link>
        <Link href="/dashboard">대시보드</Link>
        <Link href="/settings">설정</Link>
      </nav>
      {/* ... */}
    </div>
  );
}
```

---

## 레이아웃 시스템

### 중첩 레이아웃

Next.js App Router는 중첩 레이아웃을 지원합니다:

```
app/
├── layout.tsx                # Root Layout (전체)
└── settings/
    ├── layout.tsx            # Settings Layout (settings/* 전체)
    ├── page.tsx              # /settings
    └── profile/
        └── page.tsx          # /settings/profile
```

**렌더링 결과**:

```
Root Layout
  └─ Settings Layout
       └─ Profile Page
```

### 레이아웃 공유

여러 라우트에서 동일한 레이아웃을 공유하려면 상위 디렉토리에 `layout.tsx`를 배치합니다.

**예시**:

```typescript
// app/dashboard/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

이 레이아웃은 `/dashboard`, `/dashboard/analytics`, `/dashboard/settings` 모두에 적용됩니다.

---

## API Routes

### 기존 API Route

**POST /api/chat/stream**:

```typescript
// app/api/chat/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    // 스트리밍 응답
    const stream = new ReadableStream({
      async start(controller) {
        // LLM 스트리밍 처리
        // ...
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### 새 API Route 추가

**예시: GET /api/users**

```bash
# 디렉토리 생성
mkdir -p app/api/users
```

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const users = await fetchUsers(); // 데이터 가져오기
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user = await createUser(body);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
```

**지원되는 HTTP 메서드**:

- `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

---

## 주의사항

### ❌ 하지 말아야 할 것

1. **Server Component에서 상태 사용 금지**

   ```typescript
   // ❌ 잘못된 예
   // app/page.tsx (Server Component)
   import { useState } from 'react'; // 에러!

   export default function Page() {
     const [count, setCount] = useState(0); // 불가능
     return <div>{count}</div>;
   }
   ```

   **해결**: `'use client'` 지시문 추가

   ```typescript
   // ✅ 올바른 예
   'use client';

   import { useState } from 'react';

   export default function Page() {
     const [count, setCount] = useState(0);
     return <div>{count}</div>;
   }
   ```

2. **layout.tsx에서 useEffect 사용 금지**
   - Layout은 Server Component이므로 `useEffect` 사용 불가
   - Client Component로 변환하면 전체 앱이 Client로 렌더링됨
   - 대신 `page.tsx`에서 `'use client'` 사용

3. **API Route에서 Electron API 직접 호출 금지**

   ```typescript
   // ❌ 잘못된 예
   // app/api/data/route.ts
   export async function GET() {
     const data = await window.electronAPI.getData(); // 불가능 (서버 환경)
     return NextResponse.json({ data });
   }
   ```

   **해결**: API Route는 서버 환경이므로 직접 Electron API 호출 불가. 대신 IPC를 통해 Main Process와 통신하도록 클라이언트 코드에서 처리.

4. **globals.css 외부에서 글로벌 CSS import 금지**
   - 글로벌 CSS는 `app/layout.tsx`에서만 import
   - 컴포넌트별 CSS는 CSS Modules 또는 Tailwind 사용

### ✅ 반드시 해야 할 것

1. **'use client' 지시문 필수**
   - 상태, 이벤트 핸들러, 브라우저 API 사용 시 필수
   - 파일 최상단에 위치

2. **Metadata 설정**

   ```typescript
   // app/dashboard/page.tsx
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'Dashboard - SEPilot Desktop',
     description: 'Dashboard page',
   };

   export default function DashboardPage() {
     return <div>Dashboard</div>;
   }
   ```

3. **Error Boundary 활용**
   - 각 주요 라우트에 `error.tsx` 추가
   - 사용자 친화적인 에러 메시지 제공

4. **Loading State 제공**
   - 데이터 로딩이 있는 페이지는 `loading.tsx` 추가
   - Suspense를 활용한 점진적 렌더링

---

## 관련 문서

- [Next.js 16 App Router 공식 문서](https://nextjs.org/docs/app)
- [components/README.md](../components/README.md) - UI 컴포넌트 개발 가이드
- [components/layout/README.md](../components/layout/README.md) - 레이아웃 컴포넌트
- [docs/development/new-component-guide.md](../docs/development/new-component-guide.md) - 컴포넌트 추가 가이드
- [CLAUDE.md](../CLAUDE.md) - 프로젝트 전체 가이드

---

## 요약

`app/` 디렉토리 핵심 원칙:

1. **File-based Routing**: 파일 시스템 = 라우트 구조
2. **Server Components 기본**: `'use client'` 없으면 Server Component
3. **Layout 시스템**: 중첩 가능한 레이아웃으로 코드 재사용
4. **특수 파일**: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`
5. **Electron 환경**: `suppressHydrationWarning` 필수

새 페이지 추가 시 이 가이드를 참고하여 일관성을 유지하세요.
