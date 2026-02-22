/**
 * CLI isCLIMode() 함수 테스트
 */

jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test'),
  },
}));

jest.mock('chalk', () => {
  const identity = (str: string) => str;
  const chainable: any = new Proxy(identity, {
    get: () => chainable,
    apply: (_target: any, _thisArg: any, args: any[]) => args[0],
  });
  chainable.level = 3;
  return { __esModule: true, default: chainable };
});

jest.mock(
  '../../../package.json',
  () => ({
    version: '0.9.2',
  }),
  { virtual: true }
);

import { isCLIMode } from '../../../electron/cli/index';

describe('isCLIMode', () => {
  const electronPath = '/path/to/electron';

  it('명령어 없음 -> false', () => {
    expect(isCLIMode([electronPath, '.'])).toBe(false);
  });

  it.each(['ext', 'config', 'logs', 'info', 'build', 'agent', 'version', 'help'])(
    '유효 명령어 "%s" -> true',
    (cmd) => {
      expect(isCLIMode([electronPath, '.', cmd])).toBe(true);
    }
  );

  it('--version -> true', () => {
    expect(isCLIMode([electronPath, '.', '--version'])).toBe(true);
  });

  it('-v -> true', () => {
    expect(isCLIMode([electronPath, '.', '-v'])).toBe(true);
  });

  it('--help -> true', () => {
    expect(isCLIMode([electronPath, '.', '--help'])).toBe(true);
  });

  it('-h -> true', () => {
    expect(isCLIMode([electronPath, '.', '-h'])).toBe(true);
  });

  it('OAuth 프로토콜(sepilot://) -> false', () => {
    expect(isCLIMode([electronPath, 'sepilot://oauth/callback?code=abc'])).toBe(false);
  });

  it.each(['foo', 'bar', 'unknown', 'run'])('잘못된 명령어 "%s" -> false', (cmd) => {
    expect(isCLIMode([electronPath, '.', cmd])).toBe(false);
  });

  it('유효 명령어 + 추가 인자 -> true', () => {
    expect(isCLIMode([electronPath, '.', 'agent', '--prompt', 'hello'])).toBe(true);
  });

  it('글로벌 옵션 뒤 유효 명령어 -> true', () => {
    expect(isCLIMode([electronPath, '.', '--json', 'info'])).toBe(true);
  });

  it('여러 글로벌 옵션 뒤 유효 명령어 -> true', () => {
    expect(isCLIMode([electronPath, '.', '--verbose', '--no-color', 'agent', '--prompt', 'hi'])).toBe(true);
  });
});
