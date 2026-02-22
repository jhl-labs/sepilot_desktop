/**
 * Agent CLI command
 *
 * - Single-shot mode for CI/E2E
 * - Interactive TUI mode for headless environments
 */

import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import type { Message, AppConfig } from '../../../types';
import type { GraphConfig, ThinkingMode, InputTrustLevel } from '../../../lib/domains/agent/types';
import { GraphFactory } from '../../../lib/domains/agent';
import { databaseService } from '../../services/database';
import { initializeLLMClient } from '../../../lib/domains/llm/client';
import { isLLMConfigV2, convertV2ToV1 } from '../../../lib/domains/config/llm-config-migration';
import { CLIError, ExitCode } from '../utils/cli-error';
import {
  isJsonMode,
  printHeader,
  printInfo,
  printJson,
  printSection,
  printWarning,
} from '../utils/output';

export interface AgentCLIOptions {
  prompt?: string;
  mode?: ThinkingMode;
  rag?: boolean;
  tools?: boolean;
  trust?: InputTrustLevel;
  cwd?: string;
}

const SUPPORTED_MODES: ThinkingMode[] = [
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
];

async function initializeAgentRuntime(): Promise<void> {
  await databaseService.initialize();

  const configStr = databaseService.getSetting('app_config');
  if (!configStr) {
    throw new CLIError(
      'LLM 설정이 없습니다. GUI에서 먼저 모델/API Key를 설정해주세요.',
      ExitCode.NOT_FOUND
    );
  }

  const config: AppConfig = JSON.parse(configStr);
  if (!config.llm) {
    throw new CLIError('LLM 설정이 비어 있습니다.', ExitCode.NOT_FOUND);
  }

  let llmConfig = config.llm;
  if (isLLMConfigV2(llmConfig)) {
    llmConfig = convertV2ToV1(llmConfig);
  }

  if (!llmConfig.apiKey) {
    throw new CLIError('API Key가 없어 Agent를 실행할 수 없습니다.', ExitCode.INVALID_ARGUMENT);
  }

  initializeLLMClient(llmConfig);
  await GraphFactory.initialize();
}

function validateMode(mode: string): ThinkingMode {
  if (SUPPORTED_MODES.includes(mode as ThinkingMode)) {
    return mode as ThinkingMode;
  }

  throw new CLIError(
    `지원하지 않는 mode입니다: ${mode}. 지원값: ${SUPPORTED_MODES.join(', ')}`,
    ExitCode.INVALID_ARGUMENT
  );
}

async function runTurn(
  messages: Message[],
  graphConfig: GraphConfig,
  conversationId: string,
  jsonMode: boolean
): Promise<string> {
  let streamed = '';
  let finalAssistant = '';

  for await (const streamEvent of GraphFactory.streamWithConfig(graphConfig, messages, {
    conversationId,
  })) {
    if (streamEvent.type === 'streaming' && streamEvent.chunk) {
      streamed += streamEvent.chunk;
      if (!jsonMode) {
        process.stdout.write(streamEvent.chunk);
      }
      continue;
    }

    if (streamEvent.type === 'node' && streamEvent.data?.messages) {
      const lastMessage = streamEvent.data.messages[streamEvent.data.messages.length - 1];
      if (lastMessage?.role === 'assistant' && typeof lastMessage.content === 'string') {
        finalAssistant = lastMessage.content;
      }
      continue;
    }

    if (streamEvent.type === 'error') {
      throw new CLIError(streamEvent.error || 'Agent execution failed', ExitCode.ERROR);
    }

    if (streamEvent.type === 'tool_approval_request') {
      throw new CLIError(
        '이 mode는 사용자 승인 도구를 요구합니다. --mode instant 또는 --no-tools로 실행해보세요.',
        ExitCode.INVALID_ARGUMENT
      );
    }
  }

  const answer = streamed || finalAssistant;

  if (!jsonMode && streamed) {
    process.stdout.write('\n');
  }

  return answer;
}

function createGraphConfig(options: AgentCLIOptions): GraphConfig {
  const mode = options.mode || 'coding';
  const tools = options.tools ?? true;

  return {
    thinkingMode: mode,
    enableRAG: options.rag ?? false,
    enableTools: tools,
    enableImageGeneration: false,
    inputTrustLevel: options.trust ?? 'untrusted',
    workingDirectory: options.cwd || process.cwd(),
  };
}

async function runSinglePrompt(options: AgentCLIOptions): Promise<void> {
  const conversationId = randomUUID();
  const message: Message = {
    id: randomUUID(),
    conversation_id: conversationId,
    role: 'user',
    content: options.prompt || '',
    created_at: Date.now(),
  };

  const graphConfig = createGraphConfig(options);
  const jsonMode = isJsonMode();
  const response = await runTurn([message], graphConfig, conversationId, jsonMode);

  if (jsonMode) {
    printJson({
      conversationId,
      mode: graphConfig.thinkingMode,
      response,
    });
    return;
  }

  if (!response.trim()) {
    printWarning('응답이 비어 있습니다. 모델/설정을 확인해주세요.');
  }
}

/**
 * stdin에서 pipe 입력 읽기
 * echo "질문" | sepilot agent 같은 패턴 지원
 */
async function readStdinPipe(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim() || null);
    });
    process.stdin.on('error', () => {
      resolve(null);
    });
  });
}

function printTUIHelp(): void {
  printSection('사용 가능한 명령어');
  printInfo(':help        - 도움말 표시');
  printInfo(':config      - 현재 Agent 설정 확인');
  printInfo(':mode <mode> - thinking mode 변경');
  printInfo(':clear       - 대화 초기화');
  printInfo(':exit        - 종료 (:quit도 가능)');
  console.log();
  printInfo(`지원 모드: ${SUPPORTED_MODES.join(', ')}`);
  console.log();
}

async function runInteractiveTUI(options: AgentCLIOptions): Promise<void> {
  const graphConfig = createGraphConfig(options);
  const conversationId = randomUUID();
  const messages: Message[] = [];

  printHeader('SEPilot Agent TUI');
  printInfo('종료: :exit 또는 Ctrl+C');
  printInfo('도움말: :help');
  printInfo('한 줄 입력 후 Enter로 실행됩니다.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const ask = () =>
    new Promise<string>((resolve) => {
      rl.question('sepilot> ', resolve);
    });

  while (true) {
    const input = (await ask()).trim();

    if (!input) {
      continue;
    }

    // 명령어는 대소문자 구분 없이 처리
    const command = input.toLowerCase();

    if (command === ':exit' || command === ':quit') {
      rl.close();
      break;
    }

    if (command === ':help') {
      printTUIHelp();
      continue;
    }

    if (command === ':config') {
      printSection('Current Agent Config');
      console.log(JSON.stringify(graphConfig, null, 2));
      continue;
    }

    if (command.startsWith(':mode')) {
      const newMode = input.slice(5).trim();
      if (!newMode) {
        printInfo(`현재 mode: ${graphConfig.thinkingMode}`);
        printInfo(`지원 모드: ${SUPPORTED_MODES.join(', ')}`);
      } else if (SUPPORTED_MODES.includes(newMode as ThinkingMode)) {
        graphConfig.thinkingMode = newMode as ThinkingMode;
        printInfo(`mode가 '${newMode}'(으)로 변경되었습니다.`);
      } else {
        printWarning(`지원하지 않는 mode입니다: ${newMode}`);
        printInfo(`지원 모드: ${SUPPORTED_MODES.join(', ')}`);
      }
      continue;
    }

    if (command === ':clear') {
      messages.length = 0;
      printInfo('대화가 초기화되었습니다.');
      continue;
    }

    const userMessage: Message = {
      id: randomUUID(),
      conversation_id: conversationId,
      role: 'user',
      content: input,
      created_at: Date.now(),
    };

    messages.push(userMessage);

    try {
      const answer = await runTurn(messages, graphConfig, conversationId, false);
      messages.push({
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'assistant',
        content: answer,
        created_at: Date.now(),
      });
    } catch (error) {
      messages.pop(); // 실패한 user 메시지 롤백
      printWarning(error instanceof Error ? error.message : String(error));
    }
  }
}

export async function runAgent(options: AgentCLIOptions): Promise<void> {
  if (options.mode) {
    options.mode = validateMode(options.mode);
  }

  // stdin pipe 지원: echo "질문" | sepilot agent
  if (!options.prompt) {
    const stdinInput = await readStdinPipe();
    if (stdinInput) {
      options.prompt = stdinInput;
    }
  }

  await initializeAgentRuntime();

  if (options.prompt?.trim()) {
    await runSinglePrompt(options);
    return;
  }

  await runInteractiveTUI(options);
}
