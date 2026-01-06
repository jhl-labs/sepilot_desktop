# UI Design System Skill

SEPilot Desktop의 shadcn/ui 기반 디자인 시스템 및 Tailwind CSS 패턴 가이드

## 디자인 시스템 개요

### 기술 스택

- **shadcn/ui**: 컴포넌트 라이브러리 (Radix UI 기반)
- **Tailwind CSS**: 유틸리티 CSS 프레임워크
- **class-variance-authority (cva)**: 타입 안전한 variant 관리
- **lucide-react**: 아이콘 라이브러리

### 디렉토리 구조

```
components/
├── ui/                    # shadcn/ui 기본 컴포넌트
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── dialog.tsx
│   └── ...
├── chat/                  # 도메인별 컴포넌트
│   ├── MessageList.tsx
│   └── ChatInput.tsx
├── settings/
│   └── SettingsPanel.tsx
└── layout/
    └── Sidebar.tsx
```

## shadcn/ui 컴포넌트

### Button 컴포넌트

```typescript
import { Button } from '@/components/ui/button';

// Variants
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// States
<Button disabled>Disabled</Button>
<Button onClick={() => console.log('Clicked')}>Click me</Button>
```

**Button 구조 (components/ui/button.tsx):**

```typescript
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
```

### Card 컴포넌트

```typescript
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

**Card 구조:**

```typescript
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
);

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
```

### Input 컴포넌트

```typescript
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="Enter your email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</div>
```

### Dialog 컴포넌트

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>
        This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Select 컴포넌트

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>
```

## Tailwind CSS 패턴

### Flexbox 레이아웃

```typescript
// 수평 레이아웃
<div className="flex items-center gap-2">
  <Button>Button 1</Button>
  <Button>Button 2</Button>
</div>

// 수직 레이아웃
<div className="flex flex-col space-y-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

// 정렬
<div className="flex justify-between items-center">
  <span>Left</span>
  <span>Right</span>
</div>

// 센터 정렬
<div className="flex items-center justify-center h-screen">
  <div>Centered content</div>
</div>
```

### Grid 레이아웃

```typescript
// 기본 그리드
<div className="grid grid-cols-3 gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>

// 반응형 그리드
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card>Card 1</Card>
  <Card>Card 2</Card>
  <Card>Card 3</Card>
</div>

// Auto-fit 그리드
<div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
  <Card>Auto-sized Card</Card>
</div>
```

### 색상 (Design Tokens)

```typescript
// 배경색
<div className="bg-background">Default background</div>
<div className="bg-card">Card background</div>
<div className="bg-primary">Primary background</div>
<div className="bg-secondary">Secondary background</div>
<div className="bg-muted">Muted background</div>

// 텍스트 색상
<p className="text-foreground">Default text</p>
<p className="text-muted-foreground">Muted text</p>
<p className="text-primary">Primary text</p>
<p className="text-destructive">Destructive text</p>

// 테두리
<div className="border border-input">Input border</div>
<div className="border border-border">Default border</div>
```

### 간격 (Spacing)

```typescript
// Padding
<div className="p-4">Padding 1rem</div>
<div className="px-6 py-4">Padding X: 1.5rem, Y: 1rem</div>
<div className="pt-2 pb-4">Padding Top: 0.5rem, Bottom: 1rem</div>

// Margin
<div className="m-4">Margin 1rem</div>
<div className="mx-auto">Center horizontally</div>
<div className="mt-8 mb-4">Margin Top: 2rem, Bottom: 1rem</div>

// Gap (Flexbox/Grid)
<div className="flex gap-2">Gap 0.5rem</div>
<div className="grid gap-4">Gap 1rem</div>

// Space (Flexbox 자식간 간격)
<div className="flex space-x-4">Space X: 1rem</div>
<div className="flex flex-col space-y-2">Space Y: 0.5rem</div>
```

### 반응형 디자인

```typescript
// 브레이크포인트: sm (640px), md (768px), lg (1024px), xl (1280px)

// 숨기기/보이기
<div className="hidden md:block">Desktop only</div>
<div className="block md:hidden">Mobile only</div>

// 크기 조정
<div className="w-full md:w-1/2 lg:w-1/3">
  Responsive width
</div>

// 폰트 크기
<h1 className="text-2xl md:text-3xl lg:text-4xl">
  Responsive heading
</h1>

// 패딩
<div className="p-4 md:p-6 lg:p-8">
  Responsive padding
</div>
```

### 다크 모드

```typescript
// 다크 모드 클래스
<div className="bg-white dark:bg-gray-900">
  Background adapts to dark mode
</div>

<p className="text-gray-900 dark:text-gray-100">
  Text adapts to dark mode
</p>

// shadcn/ui는 자동으로 다크 모드 지원
<Card>Card with automatic dark mode</Card>
```

## cn() 유틸리티

### 조건부 클래스

```typescript
import { cn } from '@/lib/utils';

// 조건부 클래스 추가
<div className={cn('base-class', isActive && 'active-class')}>
  Conditional class
</div>

// 여러 조건
<Button
  className={cn(
    'base-button',
    isPrimary && 'bg-primary',
    isDisabled && 'opacity-50 cursor-not-allowed',
    className  // 외부에서 전달된 클래스
  )}
>
  Button
</Button>

// 객체 문법
<div className={cn({
  'bg-red-500': hasError,
  'bg-green-500': isSuccess,
  'bg-gray-500': isNeutral,
})}>
  Status indicator
</div>
```

### 컴포넌트에서 cn() 사용

```typescript
interface MyComponentProps {
  className?: string;
  variant?: 'default' | 'outline';
}

export function MyComponent({ className, variant = 'default' }: MyComponentProps) {
  return (
    <div
      className={cn(
        'base-styles p-4 rounded-lg',
        variant === 'default' && 'bg-primary text-white',
        variant === 'outline' && 'border border-primary text-primary',
        className  // 항상 마지막에 배치 (외부 클래스 우선)
      )}
    >
      Content
    </div>
  );
}
```

## 아이콘 사용

### lucide-react

```typescript
import { Search, Settings, User, ChevronRight, X } from 'lucide-react';

// 기본 사용
<Search className="h-4 w-4" />
<Settings className="h-5 w-5" />

// 버튼과 함께
<Button>
  <Search className="h-4 w-4" />
  Search
</Button>

// 아이콘 버튼
<Button size="icon" variant="ghost">
  <X className="h-4 w-4" />
</Button>

// 색상
<User className="h-6 w-6 text-primary" />
<Settings className="h-6 w-6 text-muted-foreground" />
```

## class-variance-authority (cva)

### Variant 정의

```typescript
import { cva, type VariantProps } from 'class-variance-authority';

const alertVariants = cva(
  'p-4 rounded-lg border',  // base styles
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive: 'bg-destructive/10 text-destructive border-destructive',
        success: 'bg-green-500/10 text-green-500 border-green-500',
      },
      size: {
        sm: 'text-sm p-3',
        md: 'text-base p-4',
        lg: 'text-lg p-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ variant, size, className, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant, size, className }))} {...props} />;
}
```

### Compound Variants

```typescript
const buttonVariants = cva('base-class', {
  variants: {
    variant: {
      primary: 'bg-blue-500',
      secondary: 'bg-gray-500',
    },
    size: {
      sm: 'text-sm',
      lg: 'text-lg',
    },
  },
  compoundVariants: [
    // primary + sm 조합일 때만 적용
    {
      variant: 'primary',
      size: 'sm',
      className: 'font-bold',
    },
  ],
});
```

## 커스텀 컴포넌트 패턴

### 1. Composition 패턴 (Card 스타일)

```typescript
// 컴포넌트 정의
const MessageCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('bg-card rounded-lg p-4', className)} {...props} />
  )
);

const MessageCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-2 mb-2', className)} {...props} />
  )
);

// 사용
<MessageCard>
  <MessageCardHeader>
    <Avatar />
    <span>Username</span>
  </MessageCardHeader>
  <p>Message content</p>
</MessageCard>
```

### 2. Render Props 패턴

```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export function List<T>({ items, renderItem, className }: ListProps<T>) {
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item, index) => (
        <div key={index}>{renderItem(item, index)}</div>
      ))}
    </div>
  );
}

// 사용
<List
  items={messages}
  renderItem={(message) => (
    <Card>
      <CardContent>{message.content}</CardContent>
    </Card>
  )}
/>
```

### 3. Polymorphic 컴포넌트

```typescript
type PolymorphicProps<E extends React.ElementType> = {
  as?: E;
} & React.ComponentPropsWithoutRef<E>;

export function Text<E extends React.ElementType = 'span'>({
  as,
  className,
  ...props
}: PolymorphicProps<E>) {
  const Component = as || 'span';
  return <Component className={cn('text-base', className)} {...props} />;
}

// 사용
<Text>Default span</Text>
<Text as="p">Paragraph</Text>
<Text as="h1" className="text-2xl">Heading</Text>
```

## 애니메이션

### Tailwind 트랜지션

```typescript
// Hover 효과
<Button className="transition-colors hover:bg-primary/90">
  Hover me
</Button>

// 트랜지션 지속 시간
<div className="transition-all duration-300 ease-in-out">
  Smooth transition
</div>

// Transform
<div className="hover:scale-105 transition-transform">
  Scale on hover
</div>

// Opacity
<div className="opacity-0 hover:opacity-100 transition-opacity">
  Fade in on hover
</div>
```

### Framer Motion (선택 사항)

```typescript
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  Animated content
</motion.div>
```

## 접근성 (Accessibility)

### ARIA 속성

```typescript
// 버튼
<Button aria-label="Close dialog">
  <X className="h-4 w-4" />
</Button>

// 입력
<Input aria-describedby="email-error" aria-invalid={hasError} />
{hasError && <span id="email-error" role="alert">Invalid email</span>}

// 대화상자
<Dialog aria-labelledby="dialog-title" aria-describedby="dialog-description">
  <DialogTitle id="dialog-title">Title</DialogTitle>
  <DialogDescription id="dialog-description">Description</DialogDescription>
</Dialog>
```

### 키보드 네비게이션

```typescript
// Tab index
<div tabIndex={0} onKeyDown={handleKeyDown}>
  Focusable element
</div>

// Enter/Space 키 처리
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleClick();
  }
};
```

## 체크리스트

- [ ] shadcn/ui 컴포넌트 우선 사용 (`components/ui/`)
- [ ] 새 UI 필요 시 shadcn/ui CLI로 추가: `npx shadcn-ui@latest add [component]`
- [ ] `cn()` 유틸리티로 조건부 클래스 처리
- [ ] cva로 variant 관리 (타입 안전)
- [ ] Tailwind 유틸리티 클래스 사용 (커스텀 CSS 최소화)
- [ ] 반응형 디자인 (`sm:`, `md:`, `lg:`)
- [ ] 다크 모드 지원 (`dark:`)
- [ ] lucide-react로 아이콘 사용
- [ ] 접근성 (ARIA, 키보드 네비게이션)
- [ ] `className` prop을 항상 마지막에 전달 (외부 override 허용)
- [ ] `React.forwardRef` 사용 (ref 전달)
- [ ] `displayName` 설정 (디버깅)

## 참고

- **shadcn/ui 문서**: https://ui.shadcn.com/
- **Tailwind CSS 문서**: https://tailwindcss.com/docs
- **class-variance-authority**: https://cva.style/docs
- **lucide-react**: https://lucide.dev/
- **프로젝트 UI 컴포넌트**: `components/ui/`
