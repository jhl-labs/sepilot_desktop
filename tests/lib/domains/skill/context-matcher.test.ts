import { ContextMatcher } from '@/lib/domains/skill/context-matcher';
import type { SkillManifest } from '@/types/skill';

describe('ContextMatcher', () => {
  const matcher = new ContextMatcher();

  it('parses @mentions that include dot-separated skill ids', () => {
    const mentions = matcher.parseManualSkillSelection('please use @local.react-reviewer for this');
    expect(mentions).toEqual(['local.react-reviewer']);
  });

  it('returns top match with score 1.0 for dot-separated @mentions', () => {
    const manifests: SkillManifest[] = [
      {
        id: 'local.react-reviewer',
        name: 'React Reviewer',
        version: '1.0.0',
        author: 'tester',
        description: 'react review',
        category: 'web-development',
        tags: ['react'],
      },
    ];

    const results = matcher.match('need help from @local.react-reviewer', manifests);

    expect(results).toHaveLength(1);
    expect(results[0].skillId).toBe('local.react-reviewer');
    expect(results[0].score).toBe(1);
    expect(results[0].matchedPatterns).toEqual(['@mention']);
  });
});
