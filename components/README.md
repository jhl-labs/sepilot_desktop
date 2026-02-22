# components/ - React 컴포넌트

> SEPilot Desktop의 재사용 가능한 UI 컴포넌트 모음

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [컴포넌트별 설명](#컴포넌트별-설명)
- [새 컴포넌트 추가 가이드](#새-컴포넌트-추가-가이드)
- [shadcn/ui 사용법](#shadcnui-사용법)
- [스타일링 규칙](#스타일링-규칙)
- [다국어 지원](#다국어-지원)
- [명명 규칙](#명명-규칙)
- [예제 코드](#예제-코드)
- [관련 문서](#관련-문서)

---

## 개요

components/ 폴더는 SEPilot Desktop의 모든 React 컴포넌트를 포함합니다. shadcn/ui를 기반으로 하며, Tailwind CSS로 스타일링됩니다.

**핵심 원칙:**

- **재사용성**: 작고 독립적인 컴포넌트
- **접근성**: Radix UI 기반으로 ARIA 지원
- **타입 안전성**: TypeScript strict mode
- **일관성**: shadcn/ui 디자인 시스템 준수

**기술 스택:**

- React 19 + TypeScript 5.9
- shadcn/ui + Radix UI
- Tailwind CSS 4
- i18next (다국어)
- Zustand (상태 관리)

---

## 폴더 구조

```
components/
├── ui/                           # shadcn/ui 기본 컴포넌트 (30+ 파일)
│   ├── button.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── select.tsx
│   └── ...
│
├── chat/                         # 채팅 UI
│   ├── unified/                  # 통합 채팅 컴포넌트
│   │   ├── UnifiedChatArea.tsx
│   │   ├── UnifiedChatInput.tsx
│   │   ├── hooks/                # 채팅 훅
│   │   ├── plugins/              # 채팅 플러그인
│   │   └── components/           # 서브 컴포넌트
│   ├── ChatContainer.tsx         # 메인 채팅 컨테이너
│   ├── CodeDiffViewer.tsx        # 코드 Diff 뷰어
│   └── WorkingDirectoryIndicator.tsx  # 작업 디렉토리 표시
│
├── layout/                       # 레이아웃 컴포넌트
│   ├── MainLayout.tsx            # 메인 레이아웃
│   ├── Sidebar.tsx               # 사이드바
│   ├── ChatHistory.tsx           # 대화 히스토리
│   └── WikiTree.tsx              # Wiki 트리
│
├── settings/                     # 설정 UI (20+ 탭)
│   ├── scheduler/                # 스케줄러 설정
│   └── ...                       # LLM, MCP, Extension 등
│
├── rag/                          # RAG 문서 관리 UI
├── markdown/                     # Markdown 렌더링
├── mcp/                          # MCP 관련 UI
├── skills/                       # 스킬 관련 UI
├── persona/                      # 페르소나 관련 UI
├── gallery/                      # 이미지 갤러리
├── providers/                    # React Context Provider
├── theme/                        # 테마 컴포넌트
│
├── ErrorBoundary.tsx             # 에러 바운더리
├── ConversationReportDialog.tsx  # 대화 리포트 다이얼로그
└── UpdateNotificationDialog.tsx  # 업데이트 알림 다이얼로그
```

---

## 컴포넌트별 설명

### 🎨 ui/ - shadcn/ui 기본 컴포넌트

**역할:** 재사용 가능한 기본 UI 빌딩 블록

**주요 컴포넌트:**

- `button.tsx` - 버튼 (variants: default, destructive, outline, secondary, ghost, link)
- `dialog.tsx` - 모달 다이얼로그
- `input.tsx` - 텍스트 입력
- `select.tsx` - 선택 드롭다운
- `textarea.tsx` - 여러 줄 입력
- `card.tsx` - 카드 레이아웃
- `badge.tsx` - 배지
- `alert.tsx` - 알림
- `toast.tsx` - 토스트 알림
- `dropdown-menu.tsx` - 드롭다운 메뉴
- `context-menu.tsx` - 컨텍스트 메뉴
- `tooltip.tsx` - 툴팁
- `popover.tsx` - 팝오버
- `tabs.tsx` - 탭
- `accordion.tsx` - 아코디언
- `scroll-area.tsx` - 스크롤 영역
- `separator.tsx` - 구분선

**특징:**

- Radix UI 기반 (접근성 보장)
- Tailwind CSS + CVA (Class Variance Authority)
- 완전한 TypeScript 타입 지원
- 다크/라이트 모드 자동 지원

**사용 예:**

```tsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';

<Button variant="default" size="sm">저장</Button>
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>...</DialogContent>
</Dialog>
```

---

### 💬 chat/ - 채팅 UI

**역할:** 채팅 인터페이스 및 메시지 렌더링

**주요 컴포넌트:**

#### ChatContainer.tsx

메인 채팅 컨테이너, UnifiedChatArea와 UnifiedChatInput을 조합

```tsx
export default function ChatContainer() {
  return (
    <div className="flex flex-col h-full">
      <UnifiedChatArea />
      <UnifiedChatInput />
    </div>
  );
}
```

#### unified/UnifiedChatArea.tsx (18KB)

통합 채팅 영역, 메시지 버블, Tool 결과, Interactive Select 표시

**주요 기능:**

- 메시지 스트리밍 렌더링
- Tool Approval 다이얼로그
- 이미지 표시
- Code Diff 뷰어 통합
- 자동 스크롤

#### unified/UnifiedChatInput.tsx (46KB)

통합 입력 컴포넌트, 파일 업로드, 이미지 첨부, LLM 상태 표시

**주요 기능:**

- 멀티라인 입력
- 파일 드래그 앤 드롭
- 이미지 프리뷰
- Markdown 단축키
- LLM 스트리밍 상태 표시

#### CodeDiffViewer.tsx

코드 변경사항 Diff 뷰어 (react-diff-view)

#### WorkingDirectoryIndicator.tsx

현재 작업 디렉토리 표시

---

### 📐 layout/ - 레이아웃 컴포넌트

**역할:** 앱 전체 레이아웃 구조

**주요 컴포넌트:**

#### MainLayout.tsx

메인 레이아웃 (Sidebar + Content 영역)

```tsx
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

#### Sidebar.tsx

사이드바 (대화 히스토리, Wiki 트리, Extension 메뉴)

#### ChatHistory.tsx

대화 목록 표시 및 관리

#### WikiTree.tsx

Wiki 형식의 계층 구조 트리 (대화 그룹)

---

### ⚙️ settings/ - 설정 UI

**역할:** 앱 설정 인터페이스 (20+ 탭)

**주요 설정 카테고리:**

- LLM 설정 (Provider, API 키, 모델)
- MCP 서버 설정
- Extension 관리
- RAG 설정 (VectorDB)
- 네트워크 (프록시, SSL)
- 스케줄러 설정
- 테마 및 언어
- 단축키

**특징:**

- Tabs 기반 UI
- Form validation (react-hook-form)
- 설정 암호화 (민감 정보)
- 실시간 검증

---

### 📚 rag/ - RAG 문서 관리 UI

**역할:** 문서 업로드, 인덱싱, 검색 UI

**주요 기능:**

- 문서 업로드 (PDF, Word, Excel, 이미지)
- 인덱싱 진행률 표시
- 문서 검색 및 프리뷰
- 벡터 DB 통계

---

### 📝 markdown/ - Markdown 렌더링

**역할:** Markdown 콘텐츠 렌더링 (react-markdown, remark-gfm)

**주요 기능:**

- GitHub Flavored Markdown
- 코드 하이라이팅 (Prism.js)
- 수식 렌더링 (KaTeX)
- Mermaid 다이어그램
- 링크 미리보기

---

### 🔌 mcp/ - MCP 관련 UI

**역할:** MCP 서버 관리 및 도구 선택 UI

**주요 컴포넌트:**

- MCP 서버 목록
- 도구 브라우저
- 도구 실행 로그

---

### 🎯 skills/ - 스킬 관련 UI

**역할:** 프로젝트별 전문 지식 관리 UI

**주요 기능:**

- 스킬 생성/편집
- 스킬 카테고리
- GitHub에서 스킬 다운로드

---

### 🎭 persona/ - 페르소나 관련 UI

**역할:** AI 페르소나 관리 UI

**주요 기능:**

- 페르소나 프로필
- 시스템 프롬프트 편집
- 페르소나 전환

---

### 🖼️ gallery/ - 이미지 갤러리

**역할:** 생성된 이미지 브라우저

**주요 기능:**

- 이미지 그리드
- 확대 보기
- 메타데이터 표시

---

### 🌐 providers/ - React Context Provider

**역할:** 전역 React Context 제공

**주요 Provider:**

- ThemeProvider (다크/라이트 모드)
- I18nProvider (다국어)
- ToastProvider (토스트 알림)

---

### 🎨 theme/ - 테마 컴포넌트

**역할:** 테마 전환 UI

**주요 컴포넌트:**

- ThemeToggle (다크/라이트 전환 버튼)

---

## 새 컴포넌트 추가 가이드

### 1. 컴포넌트 위치 결정

**질문:**

- 재사용 가능한 기본 UI인가? → `ui/`
- 특정 Feature에 속하는가? → `chat/`, `rag/`, `settings/` 등
- 레이아웃인가? → `layout/`

### 2. 컴포넌트 파일 생성

**예시: 새 Dialog 컴포넌트**

```bash
# PascalCase 파일명
touch components/chat/ExportChatDialog.tsx
```

### 3. 컴포넌트 구조

**템플릿:**

```tsx
// components/chat/ExportChatDialog.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';

interface ExportChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportChatDialog({ open, onOpenChange }: ExportChatDialogProps) {
  const { t } = useTranslation();
  const { currentConversationId, conversations } = useChatStore();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const conversation = conversations.find((c) => c.id === currentConversationId);
      if (!conversation) return;

      // Export 로직
      await window.electronAPI.chat.exportConversation(conversation);

      onOpenChange(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.exportDialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">{t('chat.exportDialog.description')}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? t('common.exporting') : t('common.export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. 컴포넌트 사용

```tsx
// components/chat/ChatContainer.tsx
import { ExportChatDialog } from './ExportChatDialog';

export default function ChatContainer() {
  const [showExport, setShowExport] = useState(false);

  return (
    <>
      <Button onClick={() => setShowExport(true)}>대화 내보내기</Button>
      <ExportChatDialog open={showExport} onOpenChange={setShowExport} />
    </>
  );
}
```

### 5. 체크리스트

새 컴포넌트 추가 시 확인:

- [ ] TypeScript interface 정의
- [ ] Props 타입 정의
- [ ] 다국어 지원 (useTranslation)
- [ ] 접근성 (ARIA 속성)
- [ ] 에러 처리
- [ ] 로딩 상태
- [ ] 모바일 반응형
- [ ] 다크 모드 지원
- [ ] 테스트 작성

---

## shadcn/ui 사용법

### 1. 새 UI 컴포넌트 추가

**shadcn CLI 사용:**

```bash
# 예: Slider 컴포넌트 추가
npx shadcn@latest add slider

# 결과: components/ui/slider.tsx 생성
```

**사용 가능한 컴포넌트 목록:**

```bash
npx shadcn@latest add --help
```

### 2. 커스터마이징

**예시: Button variant 추가**

```tsx
// components/ui/button.tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
        // 새 variant 추가
        success: 'bg-green-500 text-white hover:bg-green-600',
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

### 3. 테마 설정

**`app/globals.css`에서 CSS 변수 설정:**

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  /* ... */
}
```

---

## 스타일링 규칙

### 1. Tailwind CSS 클래스 순서

**권장 순서:**

1. Layout (flex, grid, block)
2. Position (relative, absolute)
3. Spacing (p-4, m-2)
4. Size (w-full, h-screen)
5. Typography (text-sm, font-bold)
6. Visual (bg-white, border)
7. Effects (shadow, opacity)
8. Interactions (hover:, focus:)
9. Responsive (md:, lg:)

**예시:**

```tsx
<div className="flex flex-col gap-4 p-6 w-full h-screen bg-background border rounded-lg shadow-md hover:shadow-lg md:w-1/2">
```

### 2. 조건부 클래스

**clsx 또는 cn 유틸리티 사용:**

```tsx
import { cn } from '@/lib/utils';

<Button
  className={cn('w-full', isActive && 'bg-primary', isDisabled && 'opacity-50 cursor-not-allowed')}
/>;
```

### 3. 커스텀 CSS

**CSS Modules 또는 Tailwind @apply 사용:**

```css
/* styles/chat.module.css */
.chatBubble {
  @apply rounded-lg p-4 shadow-sm;
  max-width: 70%;
}

.chatBubbleUser {
  @apply bg-primary text-primary-foreground ml-auto;
}

.chatBubbleAssistant {
  @apply bg-muted mr-auto;
}
```

### 4. 반응형 디자인

**모바일 우선 접근:**

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* 모바일: 1열, 태블릿: 2열, 데스크톱: 3열 */}
</div>
```

---

## 다국어 지원

### 1. useTranslation 훅 사용

```tsx
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('chat.title')}</h1>
      <p>{t('chat.description', { name: 'SEPilot' })}</p>
    </div>
  );
}
```

### 2. 번역 파일 구조

```
locales/
├── ko/
│   ├── translation.json    # 공통 번역
│   ├── chat.json           # 채팅 관련
│   └── settings.json       # 설정 관련
├── en/
│   ├── translation.json
│   ├── chat.json
│   └── settings.json
└── zh/
    ├── translation.json
    ├── chat.json
    └── settings.json
```

### 3. 번역 키 추가

**`locales/ko/chat.json`:**

```json
{
  "chat": {
    "title": "채팅",
    "newChat": "새 대화",
    "exportDialog": {
      "title": "대화 내보내기",
      "description": "대화를 Markdown 파일로 내보냅니다."
    }
  }
}
```

### 4. 동적 번역

```tsx
// 변수 포함
t('chat.greeting', { name: 'John' });
// → "안녕하세요, John님!"

// 복수형
t('chat.messageCount', { count: 5 });
// → "5개의 메시지"

// 날짜 포맷
t('chat.timestamp', { date: new Date() });
```

---

## 명명 규칙

### 1. 컴포넌트 파일명

**PascalCase 사용:**

- `ChatContainer.tsx` (O)
- `chat-container.tsx` (X)
- `chatContainer.tsx` (X)

### 2. 컴포넌트 이름

**명확한 의미:**

- `ExportChatDialog` (O) - 역할이 명확
- `Dialog1` (X) - 의미 불명확
- `MyDialog` (X) - 소유권 표현 지양

### 3. Props 인터페이스

**컴포넌트명 + Props:**

```tsx
interface ChatContainerProps {
  conversationId: string;
  onClose?: () => void;
}

export function ChatContainer({ conversationId, onClose }: ChatContainerProps) {
  // ...
}
```

### 4. 이벤트 핸들러

**on + 동사 형태:**

```tsx
const handleSubmit = () => { /* ... */ };
const handleFileUpload = () => { /* ... */ };
const handleCancel = () => { /* ... */ };

<Button onClick={handleSubmit}>전송</Button>
<Input onChange={handleInputChange} />
```

---

## 예제 코드

### 예제 1: 기본 Dialog 컴포넌트

```tsx
// components/chat/ConfirmDeleteDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description?: string;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: ConfirmDeleteDialogProps) {
  const { t } = useTranslation();

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 예제 2: Form 컴포넌트 (react-hook-form)

```tsx
// components/settings/LLMSettingsForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const formSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama']),
  apiKey: z.string().min(1, 'API 키를 입력하세요'),
  model: z.string().min(1, '모델을 선택하세요'),
});

type FormData = z.infer<typeof formSchema>;

export function LLMSettingsForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4',
    },
  });

  const onSubmit = async (data: FormData) => {
    console.log('Form submitted:', data);
    await window.electronAPI.config.save('llm', data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Provider 선택" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Key</FormLabel>
              <FormControl>
                <Input type="password" placeholder="sk-..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">저장</Button>
      </form>
    </Form>
  );
}
```

### 예제 3: 상태 관리와 통합

```tsx
// components/chat/ChatMessageList.tsx
import { useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './unified/components/MessageBubble';

export function ChatMessageList() {
  const { currentConversationId, conversations } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find((c) => c.id === currentConversationId);
  const messages = conversation?.messages || [];

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <ScrollArea className="flex-1 p-4" ref={scrollRef}>
      <div className="space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  );
}
```

---

## 관련 문서

### 아키텍처

- [docs/architecture/folder-structure.md](../docs/architecture/folder-structure.md) - 전체 폴더 구조
- [docs/architecture/dependency-rules.md](../docs/architecture/dependency-rules.md) - 의존성 규칙

### 라이브러리

- [lib/README.md](../lib/README.md) - 비즈니스 로직 라이브러리
- [lib/store/README.md](../lib/store/README.md) - Zustand 상태 관리

### UI 프레임워크

- [shadcn/ui 공식 문서](https://ui.shadcn.com/)
- [Radix UI 문서](https://www.radix-ui.com/)
- [Tailwind CSS 문서](https://tailwindcss.com/)

### 개발 가이드

- [CLAUDE.md](../CLAUDE.md) - 프로젝트 전체 가이드

---

## 변경 이력

- **2025-02-10**: Phase 1 리팩토링 완료 (Chat Unified 통합)
- **2025-01-17**: 초기 컴포넌트 구조 확립
