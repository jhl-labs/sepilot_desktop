/**
 * Agent CLI command 테스트
 */

// Mock electron
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test'),
  },
}));

// Mock chalk (ESM 모듈)
jest.mock('chalk', () => {
  const identity = (str: string) => str;
  const chainable: any = new Proxy(identity, {
    get: () => chainable,
    apply: (_target: any, _thisArg: any, args: any[]) => args[0],
  });
  chainable.level = 3;
  return { __esModule: true, default: chainable };
});

// Mock GraphFactory
const mockStreamWithConfig = jest.fn();
jest.mock('../../../../lib/domains/agent', () => ({
  GraphFactory: {
    initialize: jest.fn().mockResolvedValue(undefined),
    streamWithConfig: mockStreamWithConfig,
  },
}));

// Mock databaseService
const mockGetSetting = jest.fn();
jest.mock('../../../../electron/services/database', () => ({
  databaseService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getSetting: mockGetSetting,
  },
}));

// Mock initializeLLMClient
const mockInitializeLLMClient = jest.fn();
jest.mock('../../../../lib/domains/llm/client', () => ({
  initializeLLMClient: mockInitializeLLMClient,
}));

// Mock LLM config migration
jest.mock('../../../../lib/domains/config/llm-config-migration', () => ({
  isLLMConfigV2: jest.fn().mockReturnValue(false),
  convertV2ToV1: jest.fn((config: any) => config),
}));

import { runAgent, AgentCLIOptions } from '../../../../electron/cli/commands/agent';
import { CLIError, ExitCode } from '../../../../electron/cli/utils/cli-error';

// Helper: 유효한 LLM config를 반환하도록 mock 설정
function setupValidConfig() {
  mockGetSetting.mockReturnValue(
    JSON.stringify({
      llm: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-api-key',
      },
    })
  );
}

// Helper: 비동기 이터레이터 생성 (stream 시뮬레이션)
async function* createMockStream(events: any[]) {
  for (const event of events) {
    yield event;
  }
}

describe('runAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // stdout.write mock
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    (process.stdout.write as jest.Mock).mockRestore?.();
  });

  describe('mode 검증', () => {
    it('잘못된 mode 전달 시 CLIError throw', async () => {
      const options: AgentCLIOptions = {
        mode: 'invalid-mode' as any,
        prompt: 'test',
      };

      await expect(runAgent(options)).rejects.toThrow(CLIError);
      await expect(runAgent(options)).rejects.toMatchObject({
        exitCode: ExitCode.INVALID_ARGUMENT,
      });
    });

    it.each([
      'instant',
      'sequential',
      'tree-of-thought',
      'deep',
      'deep-web-research',
      'coding',
      'cowork',
      'browser-agent',
      'editor-agent',
      'terminal-agent',
    ])('유효한 mode "%s" 전달 시 CLIError 없음', async (mode) => {
      setupValidConfig();

      const streamEvents = [
        { type: 'streaming', chunk: 'Hello' },
        { type: 'node', data: { messages: [{ role: 'assistant', content: 'Hello' }] } },
      ];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      const options: AgentCLIOptions = {
        mode: mode as any,
        prompt: 'test prompt',
      };

      await expect(runAgent(options)).resolves.not.toThrow();
    });
  });

  describe('런타임 초기화', () => {
    it('app_config 설정이 없으면 CLIError(NOT_FOUND) throw', async () => {
      mockGetSetting.mockReturnValue(null);

      const options: AgentCLIOptions = { prompt: 'test' };

      await expect(runAgent(options)).rejects.toThrow(CLIError);
      await expect(runAgent(options)).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
      });
    });

    it('LLM 설정이 비어 있으면 CLIError(NOT_FOUND) throw', async () => {
      mockGetSetting.mockReturnValue(JSON.stringify({}));

      const options: AgentCLIOptions = { prompt: 'test' };

      await expect(runAgent(options)).rejects.toThrow(CLIError);
      await expect(runAgent(options)).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
      });
    });

    it('API Key가 없으면 CLIError(INVALID_ARGUMENT) throw', async () => {
      mockGetSetting.mockReturnValue(
        JSON.stringify({
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        })
      );

      const options: AgentCLIOptions = { prompt: 'test' };

      await expect(runAgent(options)).rejects.toThrow(CLIError);
      await expect(runAgent(options)).rejects.toMatchObject({
        exitCode: ExitCode.INVALID_ARGUMENT,
      });
    });
  });

  describe('single-shot 모드 (prompt 있음)', () => {
    it('prompt가 있으면 single-shot 모드로 실행', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'Response text' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      const options: AgentCLIOptions = {
        prompt: 'hello world',
        mode: 'coding',
      };

      await runAgent(options);

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          thinkingMode: 'coding',
          enableRAG: false,
          enableTools: true,
        }),
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'hello world',
          }),
        ]),
        expect.objectContaining({
          conversationId: expect.any(String),
        })
      );
    });

    it('streaming chunk가 stdout에 출력됨', async () => {
      setupValidConfig();

      const streamEvents = [
        { type: 'streaming', chunk: 'Hello ' },
        { type: 'streaming', chunk: 'World' },
      ];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      const options: AgentCLIOptions = {
        prompt: 'test',
        mode: 'instant',
      };

      await runAgent(options);

      expect(process.stdout.write).toHaveBeenCalledWith('Hello ');
      expect(process.stdout.write).toHaveBeenCalledWith('World');
    });

    it('stream error 이벤트 시 CLIError throw', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'error', error: 'stream failed' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      const options: AgentCLIOptions = {
        prompt: 'test',
      };

      await expect(runAgent(options)).rejects.toThrow(CLIError);
    });

    it('tool_approval_request 이벤트 시 CLIError throw', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'tool_approval_request' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      const options: AgentCLIOptions = {
        prompt: 'test',
      };

      await expect(runAgent(options)).rejects.toThrow(CLIError);

      // exitCode 검증을 위해 다시 mock 설정
      setupValidConfig();
      mockStreamWithConfig.mockReturnValue(createMockStream([{ type: 'tool_approval_request' }]));

      await expect(runAgent({ prompt: 'test' })).rejects.toMatchObject({
        exitCode: ExitCode.INVALID_ARGUMENT,
      });
    });
  });

  describe('GraphConfig 생성', () => {
    it('기본 옵션으로 GraphConfig 생성', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      await runAgent({ prompt: 'test' });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          thinkingMode: 'coding', // 기본 mode
          enableRAG: false,
          enableTools: true,
          enableImageGeneration: false,
          inputTrustLevel: 'untrusted',
        }),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('RAG 활성화 옵션 반영', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      await runAgent({ prompt: 'test', rag: true });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({ enableRAG: true }),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('tools 비활성화 옵션 반영', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      await runAgent({ prompt: 'test', tools: false });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({ enableTools: false }),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('trust level 반영', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      await runAgent({ prompt: 'test', trust: 'trusted' });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({ inputTrustLevel: 'trusted' }),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('cwd 반영', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      await runAgent({ prompt: 'test', cwd: '/custom/dir' });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({ workingDirectory: '/custom/dir' }),
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('mode 미지정 시 기본값', () => {
    it('mode 미지정 시 coding 기본값 사용', async () => {
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      await runAgent({ prompt: 'test' });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({ thinkingMode: 'coding' }),
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('stdin pipe 지원', () => {
    const originalIsTTY = process.stdin.isTTY;

    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true });
    });

    it('TTY 모드에서는 stdin을 읽지 않음 (prompt 없으면 TUI 진입 시도)', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
      setupValidConfig();

      // prompt가 없고 TTY이면 runInteractiveTUI 진입 → readline 사용
      // 이 테스트에서는 prompt가 있는 경우를 확인
      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      await runAgent({ prompt: 'direct prompt' });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([expect.objectContaining({ content: 'direct prompt' })]),
        expect.any(Object)
      );
    });

    it('prompt가 이미 있으면 stdin pipe를 읽지 않음', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, writable: true });
      setupValidConfig();

      const streamEvents = [{ type: 'streaming', chunk: 'ok' }];
      mockStreamWithConfig.mockReturnValue(createMockStream(streamEvents));

      // prompt가 이미 있으면 stdin을 읽지 않고 바로 실행
      await runAgent({ prompt: 'existing prompt' });

      expect(mockStreamWithConfig).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([expect.objectContaining({ content: 'existing prompt' })]),
        expect.any(Object)
      );
    });
  });
});
