---
name: React & shadcn/ui Components
description: >
  React component development guidelines using TypeScript and shadcn/ui.
  Use when creating UI components, forms, dialogs, or interactive elements.
  Ensures consistent styling, accessibility, and follows SEPilot design patterns.
---

# React & shadcn/ui Development Skill

## Component Structure

SEPilot Desktop follows a clean component architecture:

```
components/
├── ui/                    # shadcn/ui primitives (don't edit directly)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── tabs.tsx
│   ├── badge.tsx
│   ├── switch.tsx
│   ├── alert-dialog.tsx
│   └── collapsible.tsx
├── gallery/               # Feature-specific components
│   └── GalleryView.tsx
└── UpdateNotificationDialog.tsx  # Standalone features
```

## Creating Components

### Basic Component Pattern

```typescript
// components/MyComponent.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MyComponentProps {
  title: string;
  onSubmit: (data: string) => Promise<void>;
  disabled?: boolean;
}

export function MyComponent({
  title,
  onSubmit,
  disabled = false
}: MyComponentProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState('');

  const handleSubmit = async (): Promise<void> => {
    setLoading(true);
    try {
      await onSubmit(value);
      setValue(''); // Clear on success
    } catch (error) {
      console.error('Submit failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || loading}
        />
        <Button onClick={handleSubmit} disabled={disabled || loading}>
          {loading ? 'Submitting...' : 'Submit'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

## Available shadcn/ui Components

### Buttons

```typescript
import { Button } from '@/components/ui/button';

<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Link</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

### Dialogs

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      <DialogTitle>Confirmation</DialogTitle>
      <DialogDescription>
        Are you sure you want to proceed?
      </DialogDescription>
    </DialogHeader>
    {/* Dialog content */}
  </DialogContent>
</Dialog>
```

### Alert Dialogs

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Forms with Select

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

<Select value={model} onValueChange={setModel}>
  <SelectTrigger>
    <SelectValue placeholder="Select a model" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="gpt-4">GPT-4</SelectItem>
    <SelectItem value="claude-3">Claude 3</SelectItem>
  </SelectContent>
</Select>
```

### Tabs

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

<Tabs defaultValue="chat">
  <TabsList>
    <TabsTrigger value="chat">Chat</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>
  <TabsContent value="chat">
    {/* Chat content */}
  </TabsContent>
  <TabsContent value="settings">
    {/* Settings content */}
  </TabsContent>
</Tabs>
```

### Switch

```typescript
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

<div className="flex items-center space-x-2">
  <Switch id="dark-mode" checked={isDark} onCheckedChange={setIsDark} />
  <Label htmlFor="dark-mode">Dark Mode</Label>
</div>
```

### Badges

```typescript
import { Badge } from '@/components/ui/badge';

<Badge variant="default">Active</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Draft</Badge>
```

## Styling with Tailwind CSS

### Using cn() Utility

```typescript
import { cn } from '@/lib/utils';

<button
  className={cn(
    'px-4 py-2 rounded',
    disabled && 'opacity-50 cursor-not-allowed',
    variant === 'primary' && 'bg-blue-500 text-white',
    variant === 'secondary' && 'bg-gray-200 text-gray-900'
  )}
/>
```

### Common Patterns

```typescript
// Responsive layout
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Flex layout
<div className="flex items-center justify-between">

// Spacing
<div className="space-y-4"> {/* Vertical spacing */}
<div className="space-x-2"> {/* Horizontal spacing */}

// Text styles
<h1 className="text-2xl font-bold">Title</h1>
<p className="text-sm text-muted-foreground">Description</p>

// Hover states
<button className="hover:bg-gray-100 transition-colors">
```

## State Management

### useState for Local State

```typescript
const [isOpen, setIsOpen] = useState(false);
const [data, setData] = useState<MyType | null>(null);
```

### useEffect for Side Effects

```typescript
useEffect(() => {
  // Fetch data or setup listeners
  const fetchData = async (): Promise<void> => {
    const result = await window.electron.invoke('get-data');
    setData(result);
  };

  fetchData();
}, [dependency]);
```

### Custom Hooks

```typescript
function useConversation(id: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async (content: string): Promise<void> => {
    setLoading(true);
    try {
      await window.electron.invoke('send-message', { id, content });
    } finally {
      setLoading(false);
    }
  };

  return { messages, loading, sendMessage };
}
```

## IPC Integration

### Invoking Backend

```typescript
const handleSubmit = async (): Promise<void> => {
  try {
    const result = await window.electron.invoke('my-action', { data });
    if (result.success) {
      setData(result.data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

### Listening to Events

```typescript
useEffect(() => {
  const handleUpdate = (data: UpdateData): void => {
    setStreamData((prev) => [...prev, data]);
  };

  window.electron.on('stream:data', handleUpdate);

  return () => {
    window.electron.off('stream:data', handleUpdate);
  };
}, []);
```

## Accessibility

Always include:

- ARIA labels for interactive elements
- Keyboard navigation support
- Focus management
- Semantic HTML

```typescript
<button
  aria-label="Close dialog"
  onClick={handleClose}
  onKeyDown={(e) => e.key === 'Escape' && handleClose()}
>
  <XIcon />
</button>
```

## Component Composition

Break large components into smaller ones:

```typescript
// ❌ Bad - monolithic component
export function ConversationView() {
  // 300 lines of code...
}

// ✅ Good - composed components
export function ConversationView() {
  return (
    <div>
      <ConversationHeader />
      <ConversationMessages />
      <ConversationInput />
    </div>
  );
}
```

## Error Boundaries

```typescript
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <div>Something went wrong.</div>;
    }
    return this.props.children;
  }
}
```

## Real-World Example

See `components/UpdateNotificationDialog.tsx` for a complete example integrating:

- shadcn/ui components (AlertDialog, Button)
- IPC communication
- TypeScript types
- State management
- Error handling
