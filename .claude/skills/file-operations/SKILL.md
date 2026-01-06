---
name: File Operations
description: >
  파일 읽기/쓰기, PDF/Word/Excel 처리, 이미지 처리 패턴. SEPilot Desktop의
  문서 처리 기능 기반. Electron fs API, 문서 파서, 파일 시스템 작업을
  다룹니다.
---

# File Operations Skill

## Electron File System

### 기본 파일 작업

```typescript
// electron/utils/file-operations.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

export class FileOperations {
  // 사용자 데이터 디렉토리
  private get userDataPath(): string {
    return app.getPath('userData');
  }

  // 파일 읽기
  async readFile(relativePath: string): Promise<string> {
    const fullPath = path.join(this.userDataPath, relativePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  // 파일 쓰기
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.userDataPath, relativePath);

    // 디렉토리 생성 (없으면)
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');
  }

  // 파일 존재 확인
  async fileExists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.userDataPath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  // 디렉토리 목록
  async listFiles(relativePath: string): Promise<string[]> {
    const fullPath = path.join(this.userDataPath, relativePath);
    return await fs.readdir(fullPath);
  }

  // 파일 삭제
  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.userDataPath, relativePath);
    await fs.unlink(fullPath);
  }
}
```

### 안전한 파일 경로

```typescript
// Path Traversal 공격 방지
function sanitizePath(userPath: string, baseDir: string): string {
  // ".." 제거
  const safePath = userPath.replace(/\.\./g, '');

  // 절대 경로 구성
  const fullPath = path.resolve(baseDir, safePath);

  // baseDir 밖으로 벗어나는지 확인
  if (!fullPath.startsWith(baseDir)) {
    throw new Error('Invalid path: attempting to access outside base directory');
  }

  return fullPath;
}

// 사용
const userDataPath = app.getPath('userData');
const safePath = sanitizePath(userInput, userDataPath);
const content = await fs.readFile(safePath, 'utf-8');
```

## 문서 처리

### PDF 파일

```typescript
// lib/documents/pdf-parser.ts
import pdfParse from 'pdf-parse';
import * as fs from 'fs/promises';

export async function parsePDF(filePath: string): Promise<{
  text: string;
  numPages: number;
  metadata: Record<string, unknown>;
}> {
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdfParse(dataBuffer);

  return {
    text: data.text,
    numPages: data.numpages,
    metadata: data.info,
  };
}

// IPC Handler
ipcMain.handle('file:parse-pdf', async (event, { filePath }) => {
  try {
    const result = await parsePDF(filePath);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
```

### Word 파일 (.docx)

```typescript
// lib/documents/word-parser.ts
import mammoth from 'mammoth';

export async function parseWord(filePath: string): Promise<{
  text: string;
  html: string;
}> {
  // Text 추출
  const textResult = await mammoth.extractRawText({ path: filePath });

  // HTML 변환 (서식 포함)
  const htmlResult = await mammoth.convertToHtml({ path: filePath });

  return {
    text: textResult.value,
    html: htmlResult.value,
  };
}
```

### Excel 파일 (.xlsx)

```typescript
// lib/documents/excel-parser.ts
import * as XLSX from 'xlsx';

export async function parseExcel(filePath: string): Promise<{
  sheets: Array<{
    name: string;
    data: unknown[][];
  }>;
}> {
  const workbook = XLSX.readFile(filePath);

  const sheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    return { name, data };
  });

  return { sheets };
}

// Excel 쓰기
export async function writeExcel(data: unknown[][], filePath: string): Promise<void> {
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  XLSX.writeFile(workbook, filePath);
}
```

## 이미지 처리

### Sharp (이미지 최적화)

```typescript
// lib/utils/image-processing.ts
import sharp from 'sharp';

export async function resizeImage(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number
): Promise<void> {
  await sharp(inputPath)
    .resize(width, height, {
      fit: 'inside', // 비율 유지
      withoutEnlargement: true, // 업스케일 방지
    })
    .toFile(outputPath);
}

export async function convertToWebP(inputPath: string, outputPath: string): Promise<void> {
  await sharp(inputPath).webp({ quality: 80 }).toFile(outputPath);
}

export async function getImageMetadata(inputPath: string): Promise<{
  width: number;
  height: number;
  format: string;
  size: number;
}> {
  const metadata = await sharp(inputPath).metadata();
  const stats = await fs.stat(inputPath);

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    size: stats.size,
  };
}
```

## 파일 Dialog

### 파일 선택

```typescript
// electron/ipc/handlers/file.ts
import { dialog, BrowserWindow } from 'electron';

ipcMain.handle(
  'file:select',
  async (
    event,
    options?: {
      filters?: { name: string; extensions: string[] }[];
      multiple?: boolean;
    }
  ) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', ...(options?.multiple ? ['multiSelections'] : [])],
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { success: true, filePaths: result.filePaths };
  }
);

// 사용 (Frontend)
const result = await window.electron.invoke('file:select', {
  filters: [
    { name: 'Documents', extensions: ['pdf', 'docx', 'txt'] },
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
  ],
  multiple: true,
});

if (result.success && !result.canceled) {
  console.log('Selected files:', result.filePaths);
}
```

### 파일 저장

```typescript
ipcMain.handle(
  'file:save',
  async (
    event,
    options?: {
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }
  ) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };

    const result = await dialog.showSaveDialog(window, {
      defaultPath: options?.defaultPath,
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { success: true, filePath: result.filePath };
  }
);
```

## 파일 감시

```typescript
// electron/services/file-watcher.ts
import * as fs from 'fs';
import { EventEmitter } from 'events';

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();

  watch(filePath: string): void {
    if (this.watchers.has(filePath)) return;

    const watcher = fs.watch(filePath, (eventType, filename) => {
      this.emit('change', { filePath, eventType, filename });
    });

    this.watchers.set(filePath, watcher);
  }

  unwatch(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
    }
  }

  unwatchAll(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
```

## 파일 업로드/다운로드

### Drag & Drop

```typescript
// components/FileDropZone.tsx
import { useState } from 'react';

export function FileDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files);
    onFiles(files);

    // Electron에서 파일 처리
    for (const file of files) {
      const content = await file.text();
      await window.electron.invoke('file:process', {
        name: file.name,
        type: file.type,
        content,
      });
    }
  };

  return (
    <div
      className={`drop-zone ${dragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      파일을 드래그하여 업로드하세요
    </div>
  );
}
```

## 스트리밍 (큰 파일)

```typescript
// 큰 파일을 청크로 읽기
import * as fs from 'fs';

export async function* readFileByChunks(
  filePath: string,
  chunkSize: number = 1024 * 1024 // 1MB
): AsyncGenerator<Buffer> {
  const stream = fs.createReadStream(filePath, { highWaterMark: chunkSize });

  for await (const chunk of stream) {
    yield chunk as Buffer;
  }
}

// 사용
const chunks: Buffer[] = [];
for await (const chunk of readFileByChunks('/path/to/large/file.dat')) {
  chunks.push(chunk);
  console.log(`Read ${chunk.length} bytes`);
}
const fullContent = Buffer.concat(chunks);
```

## 파일 유형 감지

```typescript
// lib/utils/mime-types.ts
import * as path from 'path';

const mimeTypes: Record<string, string> = {
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json',
  '.md': 'text/markdown',
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

export function isTextFile(filePath: string): boolean {
  const mimeType = getMimeType(filePath);
  return mimeType.startsWith('text/');
}

export function isImageFile(filePath: string): boolean {
  const mimeType = getMimeType(filePath);
  return mimeType.startsWith('image/');
}
```

## Best Practices

### 1. 항상 절대 경로 사용

```typescript
// ✅ Good
const userDataPath = app.getPath('userData');
const fullPath = path.join(userDataPath, 'conversations', 'conv-1.json');

// ❌ Bad
const fullPath = './conversations/conv-1.json'; // 현재 디렉토리에 따라 다름
```

### 2. Path Traversal 방지

```typescript
// ✅ Good
const safePath = sanitizePath(userInput, baseDir);

// ❌ Bad
const unsafePath = path.join(baseDir, userInput); // ../../../etc/passwd 가능
```

### 3. 에러 처리

```typescript
// ✅ Good
try {
  const content = await fs.readFile(filePath, 'utf-8');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error('File not found:', filePath);
  } else {
    console.error('Failed to read file:', error);
  }
}
```

### 4. 큰 파일은 스트리밍

```typescript
// ✅ Good - 스트리밍
const stream = fs.createReadStream(largeFile);
stream.on('data', (chunk) => processChunk(chunk));

// ❌ Bad - 전체 로드 (메모리 부족 가능)
const content = await fs.readFile(largeFile); // 수 GB 파일이면 OOM
```

## 실제 예제

기존 구현 참고:

- `lib/documents/` - PDF, Word 파서
- `lib/utils/file-utils.ts` - 파일 유틸리티
- `lib/utils/mime-types.ts` - MIME 타입 감지
- `electron/ipc/handlers/file.ts` - 파일 IPC 핸들러
