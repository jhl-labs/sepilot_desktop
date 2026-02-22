import type { Message } from '@/types';
import type { WorkingMemory } from '../types';

interface BuildWorkingMemoryInput {
  previous?: WorkingMemory | null;
  messages: Message[];
  planSteps: string[];
  currentPlanStep: number;
  modifiedFiles: string[];
  deletedFiles: string[];
  decisionNote?: string;
  toolOutcome?: string;
}

function truncate(text: string, maxLen: number): string {
  if (!text) {
    return '';
  }
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function appendWithLimit(items: string[], value: string | undefined, maxLen: number): string[] {
  if (!value || value.trim().length === 0) {
    return items;
  }
  const next = [...items, truncate(value.trim(), 180)];
  return next.slice(-maxLen);
}

export function buildWorkingMemory(input: BuildWorkingMemoryInput): WorkingMemory {
  const previous = input.previous;
  const lastUserMessage = [...(input.messages || [])].reverse().find((msg) => msg.role === 'user');
  const activePlanStep =
    input.planSteps[input.currentPlanStep] ||
    previous?.latestPlanStep ||
    (input.planSteps.length > 0 ? input.planSteps[0] : '');

  const keyDecisions = appendWithLimit(previous?.keyDecisions || [], input.decisionNote, 12);
  const recentToolOutcomes = appendWithLimit(
    previous?.recentToolOutcomes || [],
    input.toolOutcome,
    12
  );

  const touchedFiles = Array.from(new Set([...(input.modifiedFiles || []), ...(input.deletedFiles || [])])).slice(-20);

  return {
    taskSummary: truncate(lastUserMessage?.content || previous?.taskSummary || '', 220),
    latestPlanStep: truncate(activePlanStep, 220),
    keyDecisions,
    recentToolOutcomes,
    fileChangeSummary: {
      modified: input.modifiedFiles.length,
      deleted: input.deletedFiles.length,
      files: touchedFiles,
    },
    lastUpdated: new Date().toISOString(),
  };
}
