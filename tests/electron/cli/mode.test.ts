import { detectCLIModeFromArgv } from '../../../electron/cli/mode';

describe('detectCLIModeFromArgv', () => {
  const electronPath = '/path/to/electron';

  it('명령어 없음 -> false', () => {
    expect(detectCLIModeFromArgv([electronPath, '.'])).toBe(false);
  });

  it('글로벌 옵션 뒤 명령어 -> true', () => {
    expect(detectCLIModeFromArgv([electronPath, '.', '--json', 'info'])).toBe(true);
  });

  it('OAuth 프로토콜 -> false', () => {
    expect(detectCLIModeFromArgv([electronPath, 'sepilot://oauth/callback?code=abc'])).toBe(false);
  });

  it('알 수 없는 명령어 -> false', () => {
    expect(detectCLIModeFromArgv([electronPath, '.', '--json', 'unknown'])).toBe(false);
  });
});
