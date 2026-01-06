# Create Component Prompt

shadcn/ui 기반 React 컴포넌트 생성을 위한 프롬프트

## 사용 방법

1. Cursor Chat 열기 (Ctrl/Cmd + L)
2. 아래 프롬프트를 수정하여 사용

## 프롬프트

```
SEPilot Desktop 프로젝트의 React 컴포넌트를 생성해주세요:

**컴포넌트 이름**: [컴포넌트 이름]

**설명**: [컴포넌트가 수행할 작업]

**요구사항**:
- TypeScript strict mode 준수
- shadcn/ui 컴포넌트 활용 (Button, Card, Input 등)
- 필요시 Zustand store 사용
- Props 타입 명확히 정의
- 'use client' 디렉티브 (Client Component인 경우)

**추가 요구사항**:
- [추가 요구사항 1]
- [추가 요구사항 2]

다음 파일을 생성해주세요:
1. 컴포넌트 파일: `components/[category]/[ComponentName].tsx`
2. (필요시) 스토리북 파일: `components/[category]/[ComponentName].stories.tsx`
3. (필요시) 테스트 파일: `tests/frontend/components/[ComponentName].test.tsx`
```

## 예시

### Input

```
SEPilot Desktop 프로젝트의 React 컴포넌트를 생성해주세요:

**컴포넌트 이름**: MessageList

**설명**: 채팅 메시지 목록을 표시하는 컴포넌트

**요구사항**:
- TypeScript strict mode 준수
- shadcn/ui Card 컴포넌트 사용
- Zustand store에서 메시지 가져오기
- 메시지가 없을 때 EmptyState 표시
- Virtual scrolling 적용 (메시지 많을 때)

**추가 요구사항**:
- React.memo로 최적화
- 로딩 상태 표시
- 에러 상태 처리

파일 위치: `components/chat/MessageList.tsx`
```

### Expected Output

```typescript
'use client';

import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { useChatStore } from '@/lib/store/chat-store';
import { MessageItem } from './MessageItem';
import { EmptyState } from './EmptyState';
import { Loader2 } from 'lucide-react';

interface MessageListProps {
  conversationId: string;
}

export const MessageList = memo(({ conversationId }: MessageListProps) => {
  const messages = useChatStore((state) =>
    state.messages.get(conversationId) || []
  );
  const isLoading = useChatStore((state) => state.isLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col space-y-4 p-4">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
});

MessageList.displayName = 'MessageList';
```
