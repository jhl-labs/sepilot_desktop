---
name: TypeScript Strict Mode
description: >
  TypeScript strict type checking guidelines for SEPilot Desktop.
  Use when creating types, writing functions, or refactoring code.
  Ensures all code has explicit types, avoids 'any', and passes
  type checking with strict mode enabled.
---

# TypeScript Strict Mode Skill

## Requirements

All code in SEPilot Desktop uses TypeScript strict mode:

- **Explicit return types** on all functions
- **Explicit types** on all variables (or clear inference)
- **No `any` type** without documented justification
- **Union types** preferred over optional properties
- **Null safety** - handle undefined/null explicitly

## Type Definition Patterns

### Creating Types

Store shared types in `lib/types/`:

```typescript
// lib/types/index.ts
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  model?: string;
}

export type ToolResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Function Types

Always specify return type:

```typescript
// ✅ Good - explicit return type
function processMessage(msg: ConversationMessage): ToolResult<string> {
  return { success: true, data: msg.content };
}

// ❌ Bad - no return type
function processMessage(msg: ConversationMessage) {
  return { success: true, data: msg.content };
}
```

### Async Functions

```typescript
async function fetchData(id: string): Promise<ToolResult<Data>> {
  try {
    const data = await api.get(id);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### Component Props

```typescript
interface ButtonProps {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
}

export function Button({
  label,
  onClick,
  variant = 'primary',
  disabled = false
}: ButtonProps): JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
```

## Handling Unknown Types

When dealing with external data:

```typescript
// ✅ Good - validate and narrow type
function parseResponse(data: unknown): ConversationMessage {
  if (!isConversationMessage(data)) {
    throw new Error('Invalid message format');
  }
  return data;
}

function isConversationMessage(data: unknown): data is ConversationMessage {
  return (
    typeof data === 'object' && data !== null && 'id' in data && 'role' in data && 'content' in data
  );
}

// ❌ Bad - unsafe cast
function parseResponse(data: unknown): ConversationMessage {
  return data as ConversationMessage;
}
```

## Generic Types

Use generics for reusable patterns:

```typescript
interface ApiResponse<T> {
  data: T;
  status: number;
  timestamp: number;
}

async function fetchApi<T>(url: string): Promise<ApiResponse<T>> {
  const response = await fetch(url);
  const data = await response.json();
  return {
    data: data as T,
    status: response.status,
    timestamp: Date.now(),
  };
}
```

## IPC Type Safety

```typescript
// Define request/response types
interface LangGraphRequest {
  prompt: string;
  graph: 'deep-thinking' | 'sequential' | 'tree-of-thought';
  config?: {
    temperature?: number;
    maxTokens?: number;
  };
}

interface LangGraphResponse {
  success: boolean;
  threadId?: string;
  error?: string;
}

// Use in handlers
ipcMain.handle(
  'langgraph:execute',
  async (event, request: LangGraphRequest): Promise<LangGraphResponse> => {
    // Implementation
  }
);

// Use in frontend
const response = await window.electron.invoke('langgraph:execute', {
  prompt: 'Analyze this...',
  graph: 'deep-thinking',
} satisfies LangGraphRequest);
```

## Enums vs Union Types

Prefer union types for simple cases:

```typescript
// ✅ Good - simple union
type Theme = 'light' | 'dark' | 'auto';

// ✅ Good - enum for complex cases with methods
enum GraphType {
  DeepThinking = 'deep-thinking',
  Sequential = 'sequential',
  TreeOfThought = 'tree-of-thought',
}
```

## Utility Types

Use TypeScript utility types:

```typescript
// Pick specific properties
type UpdateConfig = Pick<AgentConfig, 'name' | 'description'>;

// Make all properties optional
type PartialConfig = Partial<AgentConfig>;

// Make all properties required
type RequiredConfig = Required<AgentConfig>;

// Exclude properties
type ConfigWithoutTools = Omit<AgentConfig, 'tools'>;
```

## Error Handling Types

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function handleError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR');
  }
  return new AppError('An unknown error occurred', 'UNKNOWN_ERROR');
}
```

## Type Guards

Create type guards for runtime checks:

```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

// Usage
if (isArrayOf(data, isString)) {
  // data is now typed as string[]
  data.forEach((str) => console.log(str.toUpperCase()));
}
```

## Validation

Run type checking:

```bash
pnpm run type-check
```

Run lint:

```bash
pnpm run lint
```

## Common Mistakes

❌ **Avoid:**

```typescript
// Using 'any'
function process(data: any) {}

// Implicit return type
function getData() {
  return data;
}

// Unsafe cast
const result = response as MyType;
```

✅ **Prefer:**

```typescript
// Use unknown and validate
function process(data: unknown): void {
  if (isValidData(data)) {
    // now data is typed
  }
}

// Explicit return type
function getData(): MyType | null {
  return data;
}

// Type guard
if (isMyType(response)) {
  // response is now MyType
}
```
