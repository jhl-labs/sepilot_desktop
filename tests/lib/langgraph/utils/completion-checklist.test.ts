import { buildCompletionChecklist } from '@/lib/domains/agent/utils/completion-checklist';

describe('completion-checklist', () => {
  it('marks checklist passed when verification and required files are satisfied', () => {
    const checklist = buildCompletionChecklist({
      taskSummary: 'Implement feature',
      requiredFiles: ['src/a.ts'],
      modifiedFiles: ['src/a.ts', 'src/b.ts'],
      planSteps: ['step1', 'step2'],
      currentPlanStep: 1,
      verificationStatus: 'passed',
      verificationFailedChecks: [],
      hadExecutionError: false,
    });

    expect(checklist.allPassed).toBe(true);
    expect(checklist.items.find((item) => item.id === 'verification')?.status).toBe('passed');
  });

  it('marks required files item as failed when required file was untouched', () => {
    const checklist = buildCompletionChecklist({
      taskSummary: 'Update required file',
      requiredFiles: ['src/required.ts'],
      modifiedFiles: ['src/other.ts'],
      planSteps: ['step1'],
      currentPlanStep: 0,
      verificationStatus: 'failed',
      verificationFailedChecks: ['lint'],
      hadExecutionError: false,
    });

    expect(checklist.allPassed).toBe(false);
    expect(checklist.items.find((item) => item.id === 'required_files')?.status).toBe('failed');
    expect(checklist.items.find((item) => item.id === 'verification')?.status).toBe('failed');
  });
});
