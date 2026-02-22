# components/ui/ - shadcn/ui 기본 컴포넌트

> shadcn/ui 기반의 재사용 가능한 UI 빌딩 블록

## 📋 목차

- [개요](#개요)
- [사용 가능한 컴포넌트](#사용-가능한-컴포넌트)
- [새 컴포넌트 추가](#새-컴포넌트-추가)
- [컴포넌트 커스터마이징](#컴포넌트-커스터마이징)
- [테마 설정](#테마-설정)
- [사용 예제](#사용-예제)
- [관련 문서](#관련-문서)

---

## 개요

components/ui/ 폴더는 shadcn/ui 기반의 기본 UI 컴포넌트를 포함합니다. 모든 컴포넌트는 Radix UI를 기반으로 하며, Tailwind CSS로 스타일링됩니다.

**핵심 특징:**

- **접근성**: ARIA 속성 자동 지원
- **커스터마이징**: CVA(Class Variance Authority)로 variant 관리
- **다크 모드**: 자동 다크/라이트 모드 지원
- **타입 안전성**: 완전한 TypeScript 타입 지원

---

## 사용 가능한 컴포넌트

### Form Controls (입력 요소)

- `button.tsx` - 버튼
- `input.tsx` - 텍스트 입력
- `textarea.tsx` - 여러 줄 입력
- `select.tsx` - 선택 드롭다운
- `checkbox.tsx` - 체크박스
- `radio-group.tsx` - 라디오 버튼 그룹
- `switch.tsx` - 토글 스위치
- `slider.tsx` - 슬라이더

### Display (표시)

- `badge.tsx` - 배지
- `card.tsx` - 카드 레이아웃
- `alert.tsx` - 알림
- `avatar.tsx` - 아바타
- `separator.tsx` - 구분선
- `progress.tsx` - 프로그레스 바
- `skeleton.tsx` - 스켈레톤 로더

### Overlay (오버레이)

- `dialog.tsx` - 모달 다이얼로그
- `alert-dialog.tsx` - 알림 다이얼로그
- `popover.tsx` - 팝오버
- `tooltip.tsx` - 툴팁
- `hover-card.tsx` - 호버 카드
- `sheet.tsx` - 사이드 시트

### Navigation (탐색)

- `tabs.tsx` - 탭
- `dropdown-menu.tsx` - 드롭다운 메뉴
- `context-menu.tsx` - 컨텍스트 메뉴
- `command.tsx` - 명령어 팔레트
- `navigation-menu.tsx` - 탐색 메뉴

### Layout (레이아웃)

- `accordion.tsx` - 아코디언
- `collapsible.tsx` - 접을 수 있는 콘텐츠
- `scroll-area.tsx` - 스크롤 영역
- `resizable.tsx` - 크기 조절 가능 패널

### Feedback (피드백)

- `toast.tsx` - 토스트 알림
- `sonner.tsx` - 토스트 라이브러리 (Sonner)
- `custom-notification.tsx` - 커스텀 알림

---

## 새 컴포넌트 추가

### shadcn CLI 사용

```bash
# 사용 가능한 컴포넌트 목록
npx shadcn@latest add --help

# 특정 컴포넌트 추가
npx shadcn@latest add calendar

# 여러 컴포넌트 동시 추가
npx shadcn@latest add calendar date-picker
```

추가된 컴포넌트는 자동으로 `components/ui/` 폴더에 생성됩니다.

---

## 컴포넌트 커스터마이징

### Variant 추가

**예시: Button에 success variant 추가**

```tsx
// components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',

        // 새 variant 추가
        success:
          'bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

**사용:**

```tsx
<Button variant="success">저장 완료</Button>
```

### 기본 스타일 변경

```tsx
// base classes 수정
const buttonVariants = cva(
  // 이 부분이 모든 variant에 공통으로 적용됨
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    /* variants */
  }
);
```

---

## 테마 설정

### CSS 변수

**`app/globals.css`에서 테마 색상 정의:**

```css
@layer base {
  :root {
    /* Light mode */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;

    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;

    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;

    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;

    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;

    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;

    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;

    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;

    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;

    --radius: 0.5rem;
  }

  .dark {
    /* Dark mode */
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;

    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;

    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;

    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;

    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;

    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;

    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;

    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;

    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
```

### Radius 조정

```css
:root {
  --radius: 0.5rem; /* 기본 (rounded-md) */
}

/* 더 둥글게 */
:root {
  --radius: 1rem; /* rounded-lg */
}

/* 더 각지게 */
:root {
  --radius: 0.25rem; /* rounded-sm */
}
```

---

## 사용 예제

### Button

```tsx
import { Button } from "@/components/ui/button"

// 기본
<Button>클릭</Button>

// Variant
<Button variant="destructive">삭제</Button>
<Button variant="outline">취소</Button>
<Button variant="ghost">닫기</Button>
<Button variant="link">더 보기</Button>

// Size
<Button size="sm">작은 버튼</Button>
<Button size="lg">큰 버튼</Button>
<Button size="icon">
  <Icon />
</Button>

// Disabled
<Button disabled>비활성화</Button>

// 로딩 상태
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  로딩 중...
</Button>
```

### Dialog

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';

function MyDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>다이얼로그 열기</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>제목</DialogTitle>
          <DialogDescription>설명 텍스트</DialogDescription>
        </DialogHeader>

        <div className="py-4">{/* 콘텐츠 */}</div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Form (react-hook-form)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const formSchema = z.object({
  username: z.string().min(2, '최소 2자 이상 입력하세요'),
  email: z.string().email('유효한 이메일을 입력하세요'),
});

function MyForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      email: '',
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>사용자 이름</FormLabel>
              <FormControl>
                <Input placeholder="이름을 입력하세요" {...field} />
              </FormControl>
              <FormDescription>공개적으로 표시될 이름입니다</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input type="email" placeholder="email@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">제출</Button>
      </form>
    </Form>
  );
}
```

### Toast

```tsx
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

function MyComponent() {
  const { toast } = useToast();

  const showToast = () => {
    toast({
      title: '성공!',
      description: '작업이 완료되었습니다',
    });
  };

  const showError = () => {
    toast({
      variant: 'destructive',
      title: '오류 발생',
      description: '작업을 완료할 수 없습니다',
    });
  };

  return (
    <>
      <Button onClick={showToast}>성공 토스트</Button>
      <Button onClick={showError}>에러 토스트</Button>
    </>
  );
}
```

### Select

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

<Select onValueChange={handleChange} defaultValue="option1">
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="선택하세요" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">옵션 1</SelectItem>
    <SelectItem value="option2">옵션 2</SelectItem>
    <SelectItem value="option3">옵션 3</SelectItem>
  </SelectContent>
</Select>;
```

### Tabs

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">탭 1</TabsTrigger>
    <TabsTrigger value="tab2">탭 2</TabsTrigger>
    <TabsTrigger value="tab3">탭 3</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">탭 1 콘텐츠</TabsContent>
  <TabsContent value="tab2">탭 2 콘텐츠</TabsContent>
  <TabsContent value="tab3">탭 3 콘텐츠</TabsContent>
</Tabs>;
```

### Card

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>카드 제목</CardTitle>
    <CardDescription>카드 설명</CardDescription>
  </CardHeader>
  <CardContent>
    <p>카드 본문 내용</p>
  </CardContent>
  <CardFooter>
    <Button>액션</Button>
  </CardFooter>
</Card>;
```

---

## 관련 문서

### 컴포넌트 가이드

- [components/README.md](../README.md) - 전체 컴포넌트 개발 가이드

### 외부 리소스

- [shadcn/ui 공식 문서](https://ui.shadcn.com/)
- [Radix UI 공식 문서](https://www.radix-ui.com/)
- [Class Variance Authority (CVA)](https://cva.style/)
- [Tailwind CSS 공식 문서](https://tailwindcss.com/)

### 프로젝트 가이드

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 가이드

---

## 변경 이력

- **2025-02-10**: Phase 1 리팩토링 완료 (Chat Unified 통합)
- **2025-01-17**: 초기 shadcn/ui 컴포넌트 구축
