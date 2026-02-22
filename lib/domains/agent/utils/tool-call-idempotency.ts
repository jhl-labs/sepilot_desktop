import type { ToolCall } from '@/types';

export function filterUnexecutedToolCalls<T extends Partial<Pick<ToolCall, 'id'>>>(
  toolCalls: T[] | null | undefined,
  executedToolCallIds: string[] | null | undefined
): T[] {
  const executed = new Set((executedToolCallIds || []).filter(Boolean));
  return (toolCalls || []).filter((call) => {
    if (!call?.id) {
      return true;
    }
    return !executed.has(call.id);
  });
}

export function mergeExecutedToolCallIds(
  existingIds: string[] | null | undefined,
  newIds: string[] | null | undefined
): string[] {
  const merged = new Set<string>();
  for (const id of existingIds || []) {
    if (id) {
      merged.add(id);
    }
  }
  for (const id of newIds || []) {
    if (id) {
      merged.add(id);
    }
  }
  return Array.from(merged);
}
