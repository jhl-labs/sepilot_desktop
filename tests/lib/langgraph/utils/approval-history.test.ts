import {
  createApprovalHistoryEntry,
  mergeApprovalHistoryEntries,
  normalizeApprovalHistoryEntry,
} from '@/lib/domains/agent/utils/approval-history';

describe('approval-history', () => {
  it('normalizes legacy string entries into structured objects', () => {
    const normalized = normalizeApprovalHistoryEntry(
      '[2026-02-11T00:00:00.000Z] pending approval: command_execute: npm install'
    );

    expect(normalized).toBeTruthy();
    expect(normalized?.timestamp).toBe('2026-02-11T00:00:00.000Z');
    expect(normalized?.decision).toBe('feedback');
    expect(normalized?.summary).toContain('pending approval');
    expect(normalized?.metadata?.legacy).toBe(true);
  });

  it('merges legacy and structured entries into normalized list', () => {
    const structured = createApprovalHistoryEntry({
      decision: 'approved',
      source: 'user',
      summary: 'approved after user confirmation',
      riskLevel: 'medium',
      toolCallIds: ['tc-1'],
    });

    const merged = mergeApprovalHistoryEntries(
      ['[2026-02-11T00:00:00.000Z] denied dangerous: rm -rf .'],
      [structured]
    );

    expect(merged).toHaveLength(2);
    expect(merged[0].decision).toBe('denied');
    expect(merged[1].summary).toBe('approved after user confirmation');
  });

  it('deduplicates by id when merging structured entries', () => {
    const entry = createApprovalHistoryEntry({
      decision: 'approved',
      source: 'system',
      summary: 'auto approved',
      riskLevel: 'low',
    });

    const merged = mergeApprovalHistoryEntries([entry], [entry]);
    expect(merged).toHaveLength(1);
  });
});
