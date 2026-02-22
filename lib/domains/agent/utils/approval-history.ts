import type {
  ApprovalDecisionStatus,
  ApprovalHistoryEntry,
  ApprovalHistorySource,
} from '../types';

type HistoryLike = ApprovalHistoryEntry | string | null | undefined;

function inferDecisionFromLegacyText(text: string): ApprovalDecisionStatus {
  const normalized = text.toLowerCase();
  if (normalized.includes('pending approval')) {
    return 'feedback';
  }
  if (normalized.includes('denied')) {
    return 'denied';
  }
  return 'approved';
}

function inferSourceFromLegacyText(text: string): ApprovalHistorySource {
  const normalized = text.toLowerCase();
  if (normalized.includes('denied by user') || normalized.includes('user')) {
    return 'user';
  }
  if (normalized.includes('dangerous') || normalized.includes('pending approval')) {
    return 'policy';
  }
  return 'system';
}

function parseLegacyEntry(raw: string): ApprovalHistoryEntry {
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
  const timestamp = match?.[1] || new Date().toISOString();
  const summary = (match?.[2] || raw || '').trim();

  return {
    id: `approval-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    decision: inferDecisionFromLegacyText(summary),
    source: inferSourceFromLegacyText(summary),
    summary,
    metadata: { legacy: true, raw },
  };
}

export function normalizeApprovalHistoryEntry(entry: HistoryLike): ApprovalHistoryEntry | null {
  if (!entry) {
    return null;
  }
  if (typeof entry === 'string') {
    return parseLegacyEntry(entry);
  }
  if (typeof entry !== 'object') {
    return null;
  }

  const id =
    typeof entry.id === 'string' && entry.id.trim().length > 0
      ? entry.id
      : `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const timestamp =
    typeof entry.timestamp === 'string' && entry.timestamp.trim().length > 0
      ? entry.timestamp
      : new Date().toISOString();

  const decision: ApprovalDecisionStatus =
    entry.decision === 'approved' || entry.decision === 'feedback' || entry.decision === 'denied'
      ? entry.decision
      : 'approved';

  const source: ApprovalHistorySource =
    entry.source === 'system' || entry.source === 'policy' || entry.source === 'user'
      ? entry.source
      : 'system';

  return {
    id,
    timestamp,
    decision,
    source,
    summary: entry.summary || '',
    riskLevel:
      entry.riskLevel === 'low' || entry.riskLevel === 'medium' || entry.riskLevel === 'high'
        ? entry.riskLevel
        : undefined,
    toolCallIds: Array.isArray(entry.toolCallIds)
      ? entry.toolCallIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : undefined,
    metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : undefined,
  };
}

export function normalizeApprovalHistoryEntries(entries: HistoryLike[]): ApprovalHistoryEntry[] {
  const normalized = entries
    .map((entry) => normalizeApprovalHistoryEntry(entry))
    .filter((entry): entry is ApprovalHistoryEntry => Boolean(entry));

  // Keep insertion order while removing duplicate ids.
  const seen = new Set<string>();
  const deduped: ApprovalHistoryEntry[] = [];
  for (const entry of normalized) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    deduped.push(entry);
  }
  return deduped;
}

export function mergeApprovalHistoryEntries(
  existing: HistoryLike[],
  updates: HistoryLike[]
): ApprovalHistoryEntry[] {
  return normalizeApprovalHistoryEntries([...(existing || []), ...(updates || [])]);
}

export function createApprovalHistoryEntry(params: {
  decision: ApprovalDecisionStatus;
  source: ApprovalHistorySource;
  summary: string;
  riskLevel?: 'low' | 'medium' | 'high';
  toolCallIds?: string[];
  timestamp?: string;
  metadata?: Record<string, unknown>;
}): ApprovalHistoryEntry {
  return {
    id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: params.timestamp || new Date().toISOString(),
    decision: params.decision,
    source: params.source,
    summary: params.summary,
    riskLevel: params.riskLevel,
    toolCallIds: params.toolCallIds,
    metadata: params.metadata,
  };
}
