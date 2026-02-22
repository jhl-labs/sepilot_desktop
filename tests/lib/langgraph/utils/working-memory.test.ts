import type { Message } from '@/types';
import { buildWorkingMemory } from '@/lib/domains/agent/utils/working-memory';

describe('working-memory', () => {
  it('captures latest user task summary and file change summary', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'Implement API route', created_at: Date.now() },
    ];

    const snapshot = buildWorkingMemory({
      previous: null,
      messages,
      planSteps: ['Read files', 'Implement route'],
      currentPlanStep: 1,
      modifiedFiles: ['src/api/route.ts'],
      deletedFiles: [],
      decisionNote: 'Will edit route file',
      toolOutcome: 'file_edit: success',
    });

    expect(snapshot.taskSummary).toContain('Implement API route');
    expect(snapshot.latestPlanStep).toContain('Implement route');
    expect(snapshot.fileChangeSummary.modified).toBe(1);
    expect(snapshot.keyDecisions.length).toBe(1);
    expect(snapshot.recentToolOutcomes.length).toBe(1);
  });

  it('keeps decision and tool outcome lists bounded', () => {
    let previous = buildWorkingMemory({
      previous: null,
      messages: [{ id: '1', role: 'user', content: 'Task', created_at: Date.now() }],
      planSteps: [],
      currentPlanStep: 0,
      modifiedFiles: [],
      deletedFiles: [],
    });

    for (let i = 0; i < 20; i++) {
      previous = buildWorkingMemory({
        previous,
        messages: [{ id: `${i + 2}`, role: 'user', content: 'Task', created_at: Date.now() }],
        planSteps: [],
        currentPlanStep: 0,
        modifiedFiles: [],
        deletedFiles: [],
        decisionNote: `decision-${i}`,
        toolOutcome: `tool-${i}`,
      });
    }

    expect(previous.keyDecisions.length).toBeLessThanOrEqual(12);
    expect(previous.recentToolOutcomes.length).toBeLessThanOrEqual(12);
  });
});
