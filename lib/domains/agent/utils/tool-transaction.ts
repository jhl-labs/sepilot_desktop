import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { getToolPathFromArguments } from './tool-approval-risk';

interface FileSnapshot {
  absolutePath: string;
  existed: boolean;
  content: string | null;
}

export interface ToolExecutionTransaction {
  id: string;
  createdAt: string;
  files: FileSnapshot[];
}

function resolveWithinWorkspace(filePath: string, workspaceRoot: string): string | null {
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workspaceRoot, filePath);
  const relative = path.relative(workspaceRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return absolutePath;
}

export async function createToolExecutionTransaction(
  toolCalls: Array<{ arguments?: unknown }>,
  workspaceRoot: string
): Promise<ToolExecutionTransaction | null> {
  const fileCandidates = Array.from(
    new Set(
      toolCalls
        .map((toolCall) => getToolPathFromArguments(toolCall.arguments))
        .filter(
          (filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0
        )
    )
  );

  if (fileCandidates.length === 0) {
    return null;
  }

  const files: FileSnapshot[] = [];
  for (const filePath of fileCandidates) {
    const absolutePath = resolveWithinWorkspace(filePath, workspaceRoot);
    if (!absolutePath) {
      continue;
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      files.push({
        absolutePath,
        existed: true,
        content,
      });
    } catch {
      files.push({
        absolutePath,
        existed: false,
        content: null,
      });
    }
  }

  if (files.length === 0) {
    return null;
  }

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    files,
  };
}

export async function rollbackToolExecutionTransaction(
  transaction: ToolExecutionTransaction
): Promise<{ restored: number; deleted: number; errors: string[] }> {
  let restored = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const snapshot of transaction.files) {
    try {
      if (snapshot.existed) {
        await fs.mkdir(path.dirname(snapshot.absolutePath), { recursive: true });
        await fs.writeFile(snapshot.absolutePath, snapshot.content || '', 'utf-8');
        restored += 1;
      } else {
        await fs.unlink(snapshot.absolutePath).catch(() => undefined);
        deleted += 1;
      }
    } catch (error: any) {
      errors.push(`${snapshot.absolutePath}: ${error?.message || String(error)}`);
    }
  }

  return {
    restored,
    deleted,
    errors,
  };
}
