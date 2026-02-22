import { SkillsInjector } from '@/lib/domains/agent/skills-injector';

const mockMatch = jest.fn();
const mockGetEnabledSkills = jest.fn();
const mockLoadSkill = jest.fn();
const mockRecordUsage = jest.fn();

jest.mock('@/lib/domains/skill/context-matcher', () => ({
  contextMatcher: {
    match: (...args: any[]) => mockMatch(...args),
  },
}));

jest.mock('@/lib/domains/skill/manager', () => ({
  skillManager: {
    getEnabledSkills: (...args: any[]) => mockGetEnabledSkills(...args),
    loadSkill: (...args: any[]) => mockLoadSkill(...args),
    recordUsage: (...args: any[]) => mockRecordUsage(...args),
  },
}));

describe('SkillsInjector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('injects manually selected skill even when matcher returns nothing', async () => {
    const injector = new SkillsInjector();

    mockGetEnabledSkills.mockResolvedValue([
      {
        id: 'local.react-reviewer',
        manifest: {
          id: 'local.react-reviewer',
          name: 'React Reviewer',
          description: 'react review skill',
          category: 'web-development',
          version: '1.0.0',
          author: 'tester',
          tags: ['react'],
        },
      },
    ]);

    mockMatch.mockReturnValue([]);
    mockLoadSkill.mockResolvedValue({
      package: {
        manifest: {
          id: 'local.react-reviewer',
          name: 'React Reviewer',
          description: 'react review skill',
          category: 'web-development',
          version: '1.0.0',
          author: 'tester',
          tags: ['react'],
        },
        content: {
          systemPrompt: 'review react code',
        },
      },
    });

    const result = await injector.injectSkills('please help', 'conv-1', ['local.react-reviewer']);

    expect(result.injectedSkills).toEqual(['local.react-reviewer']);
    expect(result.systemPrompts.length).toBe(1);
    expect(mockRecordUsage).toHaveBeenCalledWith(
      'local.react-reviewer',
      'conv-1',
      'manual-selection'
    );
  });
});
