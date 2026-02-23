/**
 * GraphFactory - GraphRegistry 기반 그래프 팩토리
 *
 * 기능:
 * - 그래프 초기화 및 등록 (initialize)
 * - GraphConfig 기반 그래프 선택 (getGraphByConfig)
 * - 초기 상태 생성 (createInitialState)
 * - 스트리밍 실행 (streamWithConfig)
 *
 * 주의: Electron Main Process에서만 사용
 */

import { GraphRegistry } from './graph-registry';
import { logger } from '@/lib/utils/logger';
import type { Message } from '@/types';
import type { GraphConfig, GraphOptions, StreamEvent } from '../types';
import { emitStreamingChunk } from '@/lib/domains/llm/streaming-callback';

/**
 * Extension dist 파일이 런타임에 import()될 때,
 * SDK의 globalThis 레지스트리를 참조할 수 있도록 미리 설정합니다.
 *
 * webpack 번들된 Main Process 코드와 런타임 로드된 Extension dist 파일이
 * 서로 다른 SDK 모듈 인스턴스를 가질 수 있어, registerXxx()로 등록한 값이
 * Extension 측에서 조회되지 않는 문제를 해결합니다.
 */
let _sdkGlobalsSeeded = false;

/* eslint-disable @typescript-eslint/no-require-imports, curly */
function ensureSDKGlobalsForExtensions(): void {
  if (_sdkGlobalsSeeded) return;

  try {
    // AgentStateRegistry — 런타임 require()는 Extension SDK 글로벌 레지스트리 시딩에 필수
    const { AgentStateAnnotation, CodingAgentStateAnnotation } = require('../state');
    const stateRegistryKey = '__SEPILOT_SDK_AGENT_STATE_REGISTRY__';
    if (!(globalThis as any)[stateRegistryKey]) {
      (globalThis as any)[stateRegistryKey] = {
        getAgentStateAnnotation: () => AgentStateAnnotation,
        getCodingAgentStateAnnotation: () => CodingAgentStateAnnotation,
        createAgentState: (partial: any) => {
          const { createInitialAgentState } = require('../state');
          return { ...createInitialAgentState(), ...partial };
        },
        createCodingAgentState: (partial: any) => {
          const { createInitialCodingAgentState } = require('../state');
          return { ...createInitialCodingAgentState(), ...partial };
        },
      };
    }

    // ToolsRegistry
    const { toolsNode, shouldUseTool } = require('../nodes/tools');
    const toolsRegistryKey = '__SEPILOT_SDK_AGENT_TOOLS_REGISTRY__';
    if (!(globalThis as any)[toolsRegistryKey]) {
      (globalThis as any)[toolsRegistryKey] = {
        toolsNode,
        shouldUseTool,
      };
    }

    // HostServices
    const hostServicesKey = '__SEPILOT_SDK_HOST_SERVICES__';
    if (!(globalThis as any)[hostServicesKey]) {
      const { BaseGraph } = require('../base/base-graph');
      const { getLLMClient } = require('../../llm/client');
      const {
        emitStreamingChunk,
        setCurrentConversationId,
        getCurrentConversationId,
      } = require('../../llm/streaming-callback');
      (globalThis as any)[hostServicesKey] = {
        graph: { getBaseGraphClass: () => BaseGraph },
        llm: {
          getLLMClient: () => getLLMClient(),
          getLLMService: () => require('../../llm/service').LLMService,
        },
        streaming: {
          emitChunk: (chunk: string, conversationId?: string) =>
            emitStreamingChunk(chunk, conversationId),
          setCurrentConversationId,
          getCurrentConversationId,
        },
        mcp: {
          executeBuiltinTool: (...args: any[]) =>
            require('../../mcp/tools/builtin-tools').executeBuiltinTool(...args),
          getGoogleSearchTools: () => {
            const m = require('../../mcp/tools/google-search-tools');
            return [
              m.googleSearchTool,
              m.googleSearchNewsTool,
              m.googleSearchScholarTool,
              m.googleSearchImagesTool,
              m.googleSearchAdvancedTool,
              m.googleExtractResultsTool,
              m.googleGetRelatedSearchesTool,
              m.googleVisitResultTool,
              m.googleNextPageTool,
            ].filter(Boolean);
          },
          getBrowserTools: () => {
            const m = require('../../mcp/tools/builtin-tools');
            return [
              m.browserGetInteractiveElementsTool,
              m.browserGetPageContentTool,
              m.browserClickElementTool,
              m.browserTypeTextTool,
              m.browserScrollTool,
              m.browserNavigateTool,
              m.browserCreateTabTool,
              m.browserSwitchTabTool,
              m.browserCloseTabTool,
              m.browserListTabsTool,
              m.browserTakeScreenshotTool,
              m.browserGetSelectedTextTool,
              m.browserSearchElementsTool,
              m.browserWaitForElementTool,
              m.browserCaptureAnnotatedScreenshotTool,
              m.browserClickCoordinateTool,
              m.browserClickMarkerTool,
              m.browserGetClickableCoordinateTool,
              m.browserAnalyzeWithVisionTool,
            ].filter(Boolean);
          },
          getMCPServerManager: () => require('../../mcp/server-manager').MCPServerManager,
        },
        language: {
          getUserLanguage: async (source?: string) => {
            const { getUserLanguage } = await import('../utils/language-utils');
            return getUserLanguage(source || 'Extension');
          },
          getLanguageInstruction: (lang: string) => {
            const { getLanguageInstruction } = require('../utils/language-utils');
            return getLanguageInstruction(lang);
          },
        },
      };
    }

    _sdkGlobalsSeeded = true;
    logger.info('[GraphFactory] SDK globalThis registries seeded for extension runtime');
  } catch (error) {
    logger.warn('[GraphFactory] Failed to seed SDK globals (non-fatal):', error);
  }
}
/* eslint-enable @typescript-eslint/no-require-imports, curly */

/**
 * GraphFactory 클래스 (정적 메서드만 사용)
 */
export class GraphFactory {
  private static initialized = false;
  private static registry = GraphRegistry.getInstance();

  // Active BrowserAgent instances for cancellation
  private static activeBrowserAgentGraphs = new Map<string, any>();

  private static isSkillSystemMessage(message: Message): boolean {
    return (
      message.role === 'system' &&
      typeof message.id === 'string' &&
      message.id.startsWith('system-skill-')
    );
  }

  private static stripSkillSystemMessages(messages: Message[]): Message[] {
    return (messages || []).filter((message) => !this.isSkillSystemMessage(message));
  }

  private static getLastUserQuery(messages: Message[]): string {
    const lastUser = (messages || [])
      .slice()
      .reverse()
      .find((message) => message.role === 'user' && typeof message.content === 'string');
    return lastUser?.content?.trim() || '';
  }

  private static async injectSkillsIfNeeded(
    messages: Message[],
    conversationId: string,
    context: string
  ): Promise<Message[]> {
    const sanitizedMessages = this.stripSkillSystemMessages(messages);
    const query = this.getLastUserQuery(sanitizedMessages);

    if (!query) {
      return sanitizedMessages;
    }

    try {
      const { skillsInjector } = await import('../skills-injector');
      const injectionResult = await skillsInjector.injectSkills(query, conversationId || 'unknown');

      if (injectionResult.injectedSkills.length === 0) {
        return sanitizedMessages;
      }

      const skillMessages = skillsInjector.getMessagesFromResult(injectionResult);

      if (conversationId) {
        const skillNameList =
          injectionResult.injectedSkillNames?.length > 0
            ? injectionResult.injectedSkillNames.join(', ')
            : injectionResult.injectedSkills.join(', ');
        emitStreamingChunk(`\n🎯 **Skill 활성화:** ${skillNameList}\n\n`, conversationId);
      }

      logger.info('[GraphFactory] Skills injected for graph execution:', {
        context,
        conversationId,
        count: injectionResult.injectedSkills.length,
        skillIds: injectionResult.injectedSkills,
        tokens: injectionResult.totalTokens,
      });

      return [...sanitizedMessages, ...skillMessages];
    } catch (error) {
      logger.error('[GraphFactory] Skills injection failed, continuing without skills:', {
        context,
        conversationId,
        error,
      });
      return sanitizedMessages;
    }
  }

  /**
   * Optional 그래프 등록 공통 헬퍼
   */
  private static async registerOptionalGraph(
    key: string,
    loader: () => Promise<any>,
    options: {
      successLog: string;
      failureLog: string;
      fallbackGraph?: any;
      fallbackLog?: string;
    }
  ): Promise<void> {
    try {
      const GraphClass = await loader();
      this.registry.register(key, GraphClass as any);
      logger.debug(options.successLog);
    } catch (error) {
      logger.warn(options.failureLog, error);
      if (options.fallbackGraph) {
        this.registry.register(key, options.fallbackGraph as any);
        if (options.fallbackLog) {
          logger.debug(options.fallbackLog);
        }
      }
    }
  }

  /**
   * 동적 import 결과에서 그래프 클래스를 안전하게 추출
   */
  private static resolveGraphClass(moduleObj: any, exportName: string): any {
    return moduleObj?.[exportName] || moduleObj?.default?.[exportName] || moduleObj?.default;
  }

  /**
   * Extension 추출 경로(userData/resources)에서 그래프 클래스를 로드
   */
  private static async loadGraphClassFromExtensionPath(
    extensionId: string,
    relativePath: string,
    exportName: string
  ): Promise<any> {
    const fs = await import('fs');
    const path = await import('path');
    const { pathToFileURL } = await import('url');

    const candidates: string[] = [];

    // 1) userData/extensions/{id}/... (sepx 추출 경로)
    try {
      const { app } = await import('electron');
      const userDataPath = app?.getPath?.('userData');
      if (userDataPath) {
        candidates.push(path.join(userDataPath, 'extensions', extensionId, relativePath));
      }
    } catch {
      // Electron이 없는 환경에서는 무시
    }

    // 2) 개발 모드 resources/extensions/{id}/...
    candidates.push(path.join(process.cwd(), 'resources', 'extensions', extensionId, relativePath));

    // 3) 패키지 resources/extensions/{id}/...
    const resourcesPath = (process as any).resourcesPath;
    if (resourcesPath) {
      candidates.push(path.join(resourcesPath, 'extensions', extensionId, relativePath));
    }

    for (const candidate of Array.from(new Set(candidates))) {
      if (!candidate || !fs.existsSync(candidate)) {
        continue;
      }

      const fileUrl = pathToFileURL(candidate).href;
      const mod = await import(/* webpackIgnore: true */ fileUrl);
      const graphClass = this.resolveGraphClass(mod, exportName);

      if (graphClass) {
        logger.info(`[GraphFactory] Loaded ${extensionId} graph from file path`, { candidate });
        return graphClass;
      }
    }

    throw new Error(
      `[GraphFactory] ${exportName} not found for extension "${extensionId}" (searched ${candidates.length} path(s))`
    );
  }

  /**
   * BrowserAgentGraph 로더
   * 1순위: npm 패키지 import
   * 2순위: sepx 추출 경로 파일 import
   */
  private static async loadBrowserAgentGraphClass(): Promise<any> {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Extension module resolved at runtime
      const mod = await import(
        /* webpackIgnore: true */ '@sepilot/extension-browser/agents/browser-agent-graph'
      );
      const graphClass = this.resolveGraphClass(mod, 'BrowserAgentGraph');
      if (graphClass) {
        return graphClass;
      }
    } catch (error) {
      logger.warn(
        '[GraphFactory] Package import failed for browser-agent graph, trying file path',
        {
          error,
        }
      );
    }

    return this.loadGraphClassFromExtensionPath(
      'browser',
      'dist/agents/browser-agent-graph.js',
      'BrowserAgentGraph'
    );
  }

  /**
   * 모든 그래프를 GraphRegistry에 등록
   * 애플리케이션 시작 시 한 번만 호출
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('[GraphFactory] Already initialized');
      return;
    }

    logger.info('[GraphFactory] Initializing graphs...');

    // Seed SDK globalThis registries before loading extension graphs
    ensureSDKGlobalsForExtensions();

    try {
      // Import all graph classes
      const { ChatGraph } = await import('../graphs/chat-graph');
      const { RAGGraph } = await import('../graphs/rag-graph');
      const { AgentGraph } = await import('../graphs/agent-graph');
      const { SequentialThinkingGraph } = await import('../graphs/sequential-thinking-graph');
      const { DeepThinkingGraph } = await import('../graphs/deep-thinking-graph');
      const { TreeOfThoughtGraph } = await import('../graphs/tree-of-thought-graph');
      const { CodingAgentGraph } = await import('../graphs/coding-agent-graph');
      const { DeepWebResearchGraph } = await import('../graphs/deep-web-research-graph');

      // Register core graphs
      this.registry.register('chat', ChatGraph as any);
      this.registry.register('rag', RAGGraph as any);
      this.registry.register('agent', AgentGraph as any);
      this.registry.register('sequential-thinking', SequentialThinkingGraph as any);
      this.registry.register('deep-thinking', DeepThinkingGraph as any);
      this.registry.register('tree-of-thought', TreeOfThoughtGraph as any);
      this.registry.register('coding-agent', CodingAgentGraph as any);
      this.registry.register('deep-web-research', DeepWebResearchGraph as any);

      // Extension graphs - Try to load but don't fail if extension side is unavailable
      await this.registerOptionalGraph(
        'browser-agent',
        async () => this.loadBrowserAgentGraphClass(),
        {
          successLog: '[GraphFactory] Registered browser-agent graph',
          failureLog: '[GraphFactory] Failed to load browser-agent graph (Extension not built?):',
        }
      );

      await this.registerOptionalGraph(
        'editor-agent',
        async () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Extension module resolved at runtime
          const { EditorAgentGraph } = await import(
            /* webpackIgnore: true */ '@sepilot/extension-editor/agents/editor-agent-graph'
          );
          return EditorAgentGraph;
        },
        {
          successLog: '[GraphFactory] Registered editor-agent graph',
          failureLog:
            '[GraphFactory] Failed to load editor-agent graph, using CodingAgentGraph as fallback:',
          fallbackGraph: CodingAgentGraph,
          fallbackLog:
            '[GraphFactory] Registered editor-agent graph (fallback to CodingAgentGraph)',
        }
      );

      await this.registerOptionalGraph(
        'terminal-agent',
        async () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Extension module resolved at runtime
          const { TerminalAgentGraph } = (await import(
            /* webpackIgnore: true */ '@sepilot/extension-terminal/agents/terminal-agent-graph'
          )) as { TerminalAgentGraph: any };
          return TerminalAgentGraph;
        },
        {
          successLog: '[GraphFactory] Registered terminal-agent graph',
          failureLog: '[GraphFactory] Failed to load terminal-agent graph (Extension not built?):',
        }
      );

      this.initialized = true;

      const stats = this.registry.getStats();
      logger.info(`[GraphFactory] Initialized ${stats.registered} graphs`);
    } catch (error) {
      logger.error('[GraphFactory] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * ThinkingMode와 설정을 기반으로 그래프 키 결정
   */
  private static normalizeConfig(config: GraphConfig): GraphConfig {
    if (config.thinkingMode !== 'cowork') {
      return config;
    }

    // Cowork mode should always keep tools available and decide adaptively whether to use them.
    return {
      ...config,
      enableTools: true,
      inputTrustLevel: config.inputTrustLevel || 'untrusted',
    };
  }

  /**
   * ThinkingMode와 설정을 기반으로 그래프 키 결정
   */
  private static getGraphKeyFromConfig(config: GraphConfig): string {
    switch (config.thinkingMode) {
      case 'instant':
        // Instant: RAG와 Tools 토글에 따라 선택
        if (config.enableRAG && config.enableTools) {
          return 'agent'; // RAG + Tools: Agent 그래프
        } else if (config.enableRAG) {
          return 'rag'; // RAG만
        } else if (config.enableTools) {
          return 'agent'; // Tools만
        } else {
          return 'chat'; // 둘 다 없음
        }

      case 'sequential':
        return 'sequential-thinking';

      case 'tree-of-thought':
        return 'tree-of-thought';

      case 'deep':
        return 'deep-thinking';

      case 'deep-web-research':
        return 'deep-web-research';

      case 'coding':
        return 'coding-agent';

      case 'cowork':
        // cowork는 streamCoworkAgentGraph()에서 처리되므로 여기는 fallback용
        return 'coding-agent';

      case 'browser-agent':
        return 'browser-agent';

      case 'editor-agent':
        return 'editor-agent';

      case 'terminal-agent':
        return 'terminal-agent';

      default:
        logger.warn(`[GraphFactory] Unknown thinking mode: ${config.thinkingMode}, using chat`);
        return 'chat';
    }
  }

  /**
   * GraphConfig에 따라 적절한 그래프 선택
   */
  static async getGraphByConfig(config: GraphConfig) {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const graphKey = this.getGraphKeyFromConfig(config);
    const graph = this.registry.get(graphKey);

    if (!graph) {
      logger.error(`[GraphFactory] Graph not found for key: ${graphKey}`);
      throw new Error(`Graph not found: ${graphKey}`);
    }

    // StateType 매핑
    let stateType: string;
    switch (graphKey) {
      case 'chat':
      case 'sequential-thinking':
      case 'deep-thinking':
        stateType = 'chat';
        break;
      case 'rag':
        stateType = 'rag';
        break;
      case 'agent':
      case 'deep-web-research':
      case 'browser-agent':
      case 'editor-agent':
        stateType = 'agent';
        break;
      case 'tree-of-thought':
        stateType = 'tree-of-thought';
        break;
      case 'coding-agent':
        stateType = 'coding-agent';
        break;
      case 'terminal-agent':
        stateType = 'terminal-agent';
        break;
      default:
        stateType = 'chat';
    }

    return { graph, stateType, graphKey };
  }

  /**
   * 그래프 타입에 따라 초기 상태 생성
   */
  static async createInitialState(
    stateType: string,
    messages: Message[] = [],
    conversationId: string = ''
  ) {
    const {
      createInitialChatState,
      createInitialRAGState,
      createInitialAgentState,
      createInitialCodingAgentState,
    } = await import('../state');

    switch (stateType) {
      case 'chat':
        return createInitialChatState(messages, conversationId);
      case 'rag':
        return createInitialRAGState(messages, conversationId);
      case 'agent':
        return createInitialAgentState(messages, conversationId);
      case 'tree-of-thought':
        return createInitialChatState(messages, conversationId);
      case 'coding-agent':
        return createInitialCodingAgentState(messages, conversationId);
      case 'terminal-agent':
        // TerminalAgent는 streamTerminalAgentGraph에서 직접 생성
        return createInitialAgentState(messages, conversationId);
      default:
        logger.warn(`[GraphFactory] Unknown state type: ${stateType}, using chat`);
        return createInitialChatState(messages, conversationId);
    }
  }

  /**
   * 그래프 실행 (스트리밍) - GraphConfig 기반
   */
  static async *streamWithConfig(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const normalizedConfig = this.normalizeConfig(config);
    const conversationId = options?.conversationId || '';
    const messagesWithSkills = await this.injectSkillsIfNeeded(
      messages,
      conversationId,
      normalizedConfig.thinkingMode
    );

    // Special handling for graphs with custom streaming logic
    if (normalizedConfig.thinkingMode === 'browser-agent') {
      yield* this.streamBrowserAgentGraph(normalizedConfig, messagesWithSkills, options);
      return;
    }

    if (normalizedConfig.thinkingMode === 'terminal-agent') {
      yield* this.streamTerminalAgentGraph(normalizedConfig, messagesWithSkills, options);
      return;
    }

    if (normalizedConfig.thinkingMode === 'coding') {
      yield* this.streamCodingAgentGraph(normalizedConfig, messagesWithSkills, options);
      return;
    }

    if (normalizedConfig.thinkingMode === 'cowork') {
      yield* this.streamCoworkAgentGraph(normalizedConfig, messagesWithSkills, options);
      return;
    }

    if (normalizedConfig.thinkingMode === 'deep-web-research') {
      yield* this.streamDeepWebResearchGraph(normalizedConfig, messagesWithSkills, options);
      return;
    }

    if (normalizedConfig.thinkingMode === 'editor-agent') {
      yield* this.streamEditorAgentGraph(normalizedConfig, messagesWithSkills, options);
      return;
    }

    // Agent graph with Human-in-the-loop
    if (normalizedConfig.enableTools && normalizedConfig.thinkingMode === 'instant') {
      yield* this.streamAgentGraph(normalizedConfig, messagesWithSkills, options);
      return;
    }

    // Standard graph streaming
    const { graph, stateType } = await this.getGraphByConfig(normalizedConfig);
    const initialState = await this.createInitialState(
      stateType,
      messagesWithSkills,
      conversationId
    );

    logger.info('[GraphFactory] Starting stream with config:', normalizedConfig);
    logger.info('[GraphFactory] Using state type:', stateType);

    const stream = await graph.stream(initialState, {
      maxIterations: 100,
    });

    yield* this.processGraphStream(stream);
  }

  /**
   * Coding Agent 그래프 스트리밍 (Human-in-the-loop)
   */
  private static async *streamCodingAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    yield* this.streamCodingBackedGraph('coding', config, messages, options);
  }

  /**
   * Cowork Agent 그래프 스트리밍 (Supervisor-Worker 패턴)
   */
  private static async *streamCoworkAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      logger.info('[GraphFactory] Starting cowork agent stream (Supervisor-Worker)');

      const { CoworkStreamRunner } = await import('../graphs/cowork-graph');
      const { createInitialCoworkState } = await import('../state');

      const runner = new CoworkStreamRunner();
      const initialState = createInitialCoworkState(
        messages,
        conversationId,
        config.workingDirectory || process.cwd()
      );

      for await (const event of runner.stream(initialState, config, options)) {
        yield event;
      }
    } catch (error: any) {
      logger.error('[GraphFactory] Cowork agent stream error:', error);
      yield {
        type: 'error',
        error: error.message || 'Cowork agent graph execution failed',
      };
    }
  }

  /**
   * Browser Agent 그래프 스트리밍
   */
  private static async *streamBrowserAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      logger.info('[GraphFactory] Starting browser agent stream');

      // Ensure SDK globals are seeded before loading extension module
      ensureSDKGlobalsForExtensions();

      const BrowserAgentGraph = await this.loadBrowserAgentGraphClass();
      const { createInitialAgentState } = await import('../state');
      const { useChatStore } = await import('@/lib/store/chat-store');
      const { browserAgentLLMConfig } = useChatStore.getState();

      const browserAgentGraph = new BrowserAgentGraph();
      const initialState = createInitialAgentState(messages, conversationId);

      // Inject Browser Agent Config
      (initialState as any).browserContext = {
        llmConfig: browserAgentLLMConfig,
      };

      // Store instance for cancellation
      if (conversationId) {
        this.activeBrowserAgentGraphs.set(conversationId, browserAgentGraph);
      }

      // Use the BrowserAgentGraph's stream method
      for await (const event of browserAgentGraph.stream(initialState, {
        maxIterations: options?.maxIterations || 30,
      })) {
        // Handle progress events
        if (event.progress) {
          yield {
            type: 'progress',
            data: event.progress,
          };
          continue;
        }

        // Handle regular node events
        const entries = Object.entries(event);
        if (entries.length > 0) {
          const [nodeName, stateUpdate] = entries[0];
          yield {
            type: 'node',
            node: nodeName,
            data: stateUpdate,
          };
        }
      }

      // Remove from active graphs
      if (conversationId) {
        this.activeBrowserAgentGraphs.delete(conversationId);
      }

      yield { type: 'end' };
    } catch (error: any) {
      logger.error('[GraphFactory] Browser agent stream error:', error);
      yield {
        type: 'error',
        error: error.message || 'Browser agent graph execution failed',
      };
    }
  }

  /**
   * Agent 그래프 스트리밍 (Human-in-the-loop)
   */
  private static async *streamAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      logger.info('[GraphFactory] Starting agent stream with Human-in-the-loop support');

      const { AgentGraph } = await import('../graphs/agent-graph');
      const { createInitialAgentState } = await import('../state');

      const agentGraph = new AgentGraph();
      const initialState = createInitialAgentState(messages, conversationId);

      // Use the AgentGraph's stream method with tool approval callback
      for await (const event of agentGraph.stream(
        initialState,
        options?.maxIterations || 50,
        options?.toolApprovalCallback
      )) {
        // Pass through all events
        yield event;
      }

      yield { type: 'end' };
    } catch (error: any) {
      logger.error('[GraphFactory] Agent stream error:', error);
      yield {
        type: 'error',
        error: error.message || 'Agent graph execution failed',
      };
    }
  }

  /**
   * Deep Web Research 그래프 스트리밍
   */
  private static async *streamDeepWebResearchGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      logger.info('[GraphFactory] Starting Deep Web Research stream');

      const { graph } = await this.getGraphByConfig(config);
      const { createInitialAgentState } = await import('../state');

      const initialState = createInitialAgentState(messages, conversationId);

      const stream = await graph.stream(initialState, {
        maxIterations: 100,
      });

      // Reuse common stream normalization logic to preserve event contract
      for await (const event of this.processGraphStream(stream)) {
        if (event.type === 'end') {
          continue;
        }
        yield event;
      }

      // processGraphStream에서 completion이 이미 normalize 되어 전달됨
      yield { type: 'end' };
    } catch (error: any) {
      logger.error('[GraphFactory] Deep Web Research stream error:', error);
      yield {
        type: 'error',
        error: error.message || 'Deep Web Research execution failed',
      };
    }
  }

  /**
   * Editor Agent 그래프 스트리밍
   */
  static async *streamEditorAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    yield* this.streamCodingBackedGraph('editor', config, messages, options);
  }

  /**
   * CodingAgentGraph 기반 스트리밍 공통 처리 (coding/editor)
   */
  private static async *streamCodingBackedGraph(
    mode: 'coding' | 'editor',
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      logger.info(
        mode === 'editor'
          ? '[GraphFactory] Starting Editor Agent stream'
          : '[GraphFactory] Starting coding agent stream with Human-in-the-loop support'
      );

      const { CodingAgentGraph } = await import('../graphs/coding-agent-graph');
      const { createInitialCodingAgentState } = await import('../state');

      const codingAgentGraph = new CodingAgentGraph();
      const initialState = createInitialCodingAgentState(
        messages,
        conversationId,
        options?.maxIterations || 50,
        config.workingDirectory || process.cwd(),
        config.activeFileSelection
      );

      if (mode === 'editor') {
        (initialState as any).editorContext = {
          useTools: config.enableTools,
          enabledTools: config.enabledTools,
          workingDirectory: config.workingDirectory,
          activeFileSelection: config.activeFileSelection,
          useRag: config.enableRAG || false,
          enableMCPTools: (config as any).enableMCPTools || false,
          enablePlanning: (config as any).enablePlanning || false,
          enableVerification: (config as any).enableVerification || false,
        };
      }

      for await (const event of codingAgentGraph.stream(initialState, {
        toolApprovalCallback: options?.toolApprovalCallback,
        discussInputCallback: options?.discussInputCallback,
      })) {
        yield event;
      }

      yield { type: 'end' };
    } catch (error: any) {
      logger.error(
        mode === 'editor'
          ? '[GraphFactory] Editor Agent stream error:'
          : '[GraphFactory] Coding agent stream error:',
        error
      );
      yield {
        type: 'error',
        error:
          error.message ||
          (mode === 'editor'
            ? 'Editor Agent execution failed'
            : 'Coding agent graph execution failed'),
      };
    }
  }

  /**
   * Terminal Agent 그래프 스트리밍
   */
  private static async *streamTerminalAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      logger.info('[GraphFactory] Starting terminal agent stream');

      const { graph } = await this.getGraphByConfig(config);
      const { useChatStore } = await import('@/lib/store/chat-store');

      // Get Terminal state from store
      const store = useChatStore.getState();
      const recentBlocks = store.getRecentTerminalBlocks?.(5) || [];
      const currentCwd = store.currentCwd || store.workingDirectory || '';
      const currentShell = store.currentShell || 'bash';

      // Create initial state for Terminal Agent
      const initialState = {
        messages,
        conversationId,
        toolCalls: [],
        toolResults: [],
        recentBlocks,
        currentCwd,
        currentShell,
        platform: process.platform,
      };

      // Stream events from Terminal Agent
      for await (const event of graph.stream(initialState)) {
        yield event;
      }

      yield { type: 'end' };
    } catch (error: any) {
      logger.error('[GraphFactory] Terminal Agent stream error:', error);
      yield {
        type: 'error',
        error: error.message || 'Terminal Agent execution failed',
      };
    }
  }

  /**
   * Editor Agent 스트리밍 실행 (Raw State)
   * Used by llm-editor-autocomplete and llm-editor-action
   */
  static async *streamEditorAgent(
    initialState: any,
    toolApprovalCallback?: any
  ): AsyncGenerator<StreamEvent> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const graph = this.registry.get('editor-agent');
      if (!graph) {
        throw new Error('Editor Agent graph not found');
      }

      const conversationId = initialState?.conversationId || '';
      const messagesWithSkills = await this.injectSkillsIfNeeded(
        initialState?.messages || [],
        conversationId,
        'editor-agent-direct'
      );
      const stateWithSkills = {
        ...initialState,
        messages: messagesWithSkills,
      };

      for await (const event of graph.stream(stateWithSkills, toolApprovalCallback)) {
        yield event;
      }
    } catch (error: any) {
      logger.error('[GraphFactory] Editor Agent stream error:', error);
      yield {
        type: 'error',
        error: error.message || 'Editor Agent execution failed',
      };
    }
  }

  /**
   * Graph stream 처리 공통 로직
   */
  private static async *processGraphStream(
    stream: AsyncIterableIterator<any>
  ): AsyncGenerator<StreamEvent> {
    let emittedErrorEvent = false;

    try {
      for await (const event of stream) {
        if (!event) {
          continue;
        }

        // BaseGraph.stream() emits typed events: message / complete / error
        if (typeof event === 'object' && 'type' in event) {
          if (event.type === 'error') {
            emittedErrorEvent = true;
            yield {
              type: 'error',
              error: event.error || 'Graph execution failed',
            };
            continue;
          }

          if (event.type === 'message' && event.message) {
            // Backward compatibility: many consumers still read node.data.messages
            yield {
              type: 'node',
              node: 'generate',
              data: {
                messages: [event.message],
              },
            };
            continue;
          }

          if (event.type === 'complete') {
            yield { type: 'completion' };
            continue;
          }

          if (event.type === 'completion') {
            yield event as StreamEvent;
            continue;
          }

          if (event.type === 'end') {
            // processGraphStream emits terminal end event itself.
            continue;
          }

          // Pass through already-normalized stream events
          if (
            event.type === 'node' ||
            event.type === 'edge' ||
            event.type === 'tool_approval_request' ||
            event.type === 'tool_approval_result' ||
            event.type === 'progress' ||
            event.type === 'streaming' ||
            event.type === 'referenced_documents'
          ) {
            yield event as StreamEvent;
            continue;
          }

          // Forward compatibility: pass through typed events not explicitly normalized above.
          yield event as StreamEvent;
          continue;
        }

        if (typeof event !== 'object') {
          continue;
        }

        const entries = Object.entries(event as Record<string, unknown>);

        if (entries.length > 0) {
          const [nodeName, stateUpdate] = entries[0];
          yield {
            type: 'node',
            node: nodeName,
            data: stateUpdate,
          };
        }
      }

      yield { type: 'end' };
    } catch (error: any) {
      logger.error('[GraphFactory] Stream error:', error);
      if (!emittedErrorEvent) {
        yield {
          type: 'error',
          error: error.message || 'Graph execution failed',
        };
      }
    }
  }

  /**
   * Browser Agent 중단
   */
  static stopBrowserAgent(conversationId: string): boolean {
    const browserAgentGraph = this.activeBrowserAgentGraphs.get(conversationId);
    if (browserAgentGraph) {
      logger.info('[GraphFactory] Stopping Browser Agent for conversation:', conversationId);
      browserAgentGraph.stop();
      this.activeBrowserAgentGraphs.delete(conversationId);
      return true;
    }
    logger.warn('[GraphFactory] No active Browser Agent found for conversation:', conversationId);
    return false;
  }

  /**
   * Registry 통계 가져오기
   */
  static getStats() {
    return this.registry.getStats();
  }
}
