import {
  filterUnexecutedToolCalls,
  mergeExecutedToolCallIds,
} from '@/lib/domains/agent/utils/tool-call-idempotency';

describe('tool-call-idempotency', () => {
  it('filters already executed tool calls by id', () => {
    const calls = [
      { id: 'tc-1', name: 'file_read', arguments: { path: 'a.ts' } },
      { id: 'tc-2', name: 'file_edit', arguments: { path: 'b.ts' } },
    ];

    const result = filterUnexecutedToolCalls(calls, ['tc-1']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tc-2');
  });

  it('keeps tool calls without id to avoid accidental drop', () => {
    const calls = [
      { id: 'tc-1', name: 'file_read', arguments: { path: 'a.ts' } },
      { name: 'file_edit', arguments: { path: 'b.ts' } },
    ];

    const result = filterUnexecutedToolCalls(calls, ['tc-1']);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'file_edit' });
  });

  it('merges executed tool call ids uniquely', () => {
    const merged = mergeExecutedToolCallIds(['tc-1', 'tc-2'], ['tc-2', 'tc-3', '']);
    expect(merged.sort()).toEqual(['tc-1', 'tc-2', 'tc-3']);
  });
});
