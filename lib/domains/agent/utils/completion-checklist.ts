import type { CompletionChecklist, CompletionChecklistItem } from '../types';

interface BuildChecklistInput {
  taskSummary: string;
  requiredFiles: string[];
  modifiedFiles: string[];
  planSteps: string[];
  currentPlanStep: number;
  verificationStatus: 'not_run' | 'passed' | 'failed';
  verificationFailedChecks: string[];
  hadExecutionError: boolean;
}

function createItem(
  id: string,
  title: string,
  status: CompletionChecklistItem['status'],
  detail?: string
): CompletionChecklistItem {
  return { id, title, status, detail };
}

export function buildCompletionChecklist(input: BuildChecklistInput): CompletionChecklist {
  const items: CompletionChecklistItem[] = [];

  const hasFileTouch = input.modifiedFiles.length > 0;
  items.push(
    createItem(
      'task_scope',
      'Task scope progressed',
      hasFileTouch || !input.requiredFiles.length ? 'passed' : 'pending',
      input.taskSummary || undefined
    )
  );

  if (input.requiredFiles.length > 0) {
    const untouched = input.requiredFiles.filter(
      (required) => !input.modifiedFiles.some((modified) => modified.endsWith(required))
    );
    items.push(
      createItem(
        'required_files',
        'Required files touched',
        untouched.length === 0 ? 'passed' : 'failed',
        untouched.length > 0 ? `Untouched: ${untouched.join(', ')}` : undefined
      )
    );
  } else {
    items.push(createItem('required_files', 'Required files touched', 'skipped'));
  }

  if (input.planSteps.length > 0) {
    const completedSteps = Math.min(input.currentPlanStep + 1, input.planSteps.length);
    const isPlanComplete = completedSteps >= input.planSteps.length;
    items.push(
      createItem(
        'plan_steps',
        'Planned steps completed',
        isPlanComplete ? 'passed' : 'pending',
        `${completedSteps}/${input.planSteps.length}`
      )
    );
  } else {
    items.push(createItem('plan_steps', 'Planned steps completed', 'skipped'));
  }

  if (input.verificationStatus === 'passed') {
    items.push(createItem('verification', 'Automated verification', 'passed'));
  } else if (input.verificationStatus === 'failed') {
    items.push(
      createItem(
        'verification',
        'Automated verification',
        'failed',
        input.verificationFailedChecks.join('; ')
      )
    );
  } else {
    items.push(createItem('verification', 'Automated verification', 'pending'));
  }

  items.push(
    createItem(
      'execution_health',
      'Execution health',
      input.hadExecutionError ? 'failed' : 'passed'
    )
  );

  const allPassed = items.every((item) => item.status === 'passed' || item.status === 'skipped');

  return {
    generatedAt: new Date().toISOString(),
    allPassed,
    items,
  };
}
