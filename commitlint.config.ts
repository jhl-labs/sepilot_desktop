import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 한국어 커밋 메시지 허용 (subject 대소문자 제한 해제)
    'subject-case': [0],
    // CLAUDE.md에 정의된 type만 허용
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'refactor',
        'test',
        'style',
        'perf',
        'ci',
        'build',
        'revert',
      ],
    ],
  },
};

export default config;
