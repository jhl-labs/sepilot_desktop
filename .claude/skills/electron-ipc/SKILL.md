---
name: Electron IPC Communication
description: >
  Expert knowledge of Electron Inter-Process Communication patterns for SEPilot Desktop.
  Use this when adding IPC handlers, creating frontend-backend communication,
  implementing streaming responses, or debugging IPC issues. Ensures secure
  and efficient communication between renderer and main processes.
---

# Electron IPC Communication Skill

## Architecture Pattern

SEPilot Desktop uses Electron IPC for all frontend-backend communication:

- **Frontend → Backend**: `window.electron.invoke('channel-name', data)`
- **Backend → Frontend**: `event.sender.send('channel-name', data)`
- **Streaming**: Use IPC events (never HTTP) for real-time data

## Handler Location

All IPC handlers are in `electron/ipc/handlers/`:

- `langgraph.ts` - LangGraph agent execution with streaming
- `update.ts` - Application auto-update functionality
- Add new handlers here following the same pattern

## Creating New Handlers

### Backend Handler (electron/ipc/handlers/)

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron';

export function setupMyFeatureHandlers() {
  // Request-response pattern
  ipcMain.handle('myfeature:action', async (event: IpcMainInvokeEvent, data: InputType) => {
    // 1. Validate input
    if (!data || !data.requiredField) {
      throw new Error('Invalid input');
    }

    // 2. Perform work
    const result = await doWork(data);

    // 3. Return results
    return { success: true, data: result };
  });

  // Streaming pattern (for LLM responses, etc.)
  ipcMain.handle('myfeature:stream', async (event: IpcMainInvokeEvent, data: InputType) => {
    const stream = createStream(data);

    stream.on('data', (chunk) => {
      // Send incremental updates
      event.sender.send('myfeature:stream:data', chunk);
    });

    stream.on('end', () => {
      event.sender.send('myfeature:stream:end');
    });

    stream.on('error', (error) => {
      event.sender.send('myfeature:stream:error', error.message);
    });

    return { success: true };
  });
}
```

### Frontend Usage (app/ or components/)

```typescript
// Simple request-response
const result = await window.electron.invoke('myfeature:action', {
  requiredField: 'value',
});

// Streaming
window.electron.on('myfeature:stream:data', (data) => {
  setStreamData((prev) => [...prev, data]);
});

window.electron.on('myfeature:stream:end', () => {
  setIsStreaming(false);
});

window.electron.on('myfeature:stream:error', (error) => {
  console.error('Stream error:', error);
});

await window.electron.invoke('myfeature:stream', { prompt: 'Hello' });
```

## Security Checklist

- [ ] Validate all incoming IPC data (type, shape, values)
- [ ] Use TypeScript strict mode for type safety
- [ ] Sanitize user input before using in bash/file operations
- [ ] Never expose sensitive file paths to frontend
- [ ] Use `app.getPath('userData')` for persistent storage
- [ ] Avoid command injection in `execFile` or `spawn`

## Type Definitions

Define IPC types in `lib/types/` or inline:

```typescript
interface MyFeatureRequest {
  prompt: string;
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

interface MyFeatureResponse {
  success: boolean;
  data?: ResultType;
  error?: string;
}
```

## Testing IPC

```typescript
// In tests
const result = await window.electron.invoke('myfeature:action', testData);
expect(result.success).toBe(true);
```

## Real-World Examples

See existing handlers:

- `electron/ipc/handlers/langgraph.ts` - Streaming LangGraph responses
- `electron/ipc/handlers/update.ts` - Update checks and installation

## Common Patterns

### File Operations

```typescript
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

const userDataPath = app.getPath('userData');
const filePath = path.join(userDataPath, 'conversations', `${id}.json`);
await fs.writeFile(filePath, JSON.stringify(data));
```

### Error Handling

```typescript
ipcMain.handle('myfeature:action', async (event, data) => {
  try {
    const result = await doWork(data);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error in myfeature:action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
```

## Quick Reference

| Pattern                  | Use Case         | Example                                             |
| ------------------------ | ---------------- | --------------------------------------------------- |
| `handle` + `invoke`      | Request-response | `ipcMain.handle()` + `window.electron.invoke()`     |
| `handle` + `sender.send` | Streaming        | Initiate with `handle`, stream with `sender.send()` |
| `on` listener            | Receive streams  | `window.electron.on('channel', callback)`           |
