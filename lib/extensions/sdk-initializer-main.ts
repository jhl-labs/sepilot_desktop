/**
 * Main Process SDK 초기화
 *
 * Extension 로드 전에 SDK에 Main Process용 서비스 구현체를 등록합니다.
 * Agent 서비스 (LLM, Streaming, Tools, Language, Skills 등)가 여기서 등록됩니다.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { logger } from '../utils/logger';
import type { AgentGraphServices } from '@sepilot/extension-sdk/agent';
import { registerAgentStateRegistry } from '@sepilot/extension-sdk/agent';
import { registerToolsRegistry } from '@sepilot/extension-sdk/agent';
import { registerHostServices } from '@sepilot/extension-sdk/services';

let _mainProcessServices: AgentGraphServices | null = null;

/**
 * Main Process SDK 초기화
 *
 * AgentGraphServices 구현체를 생성하여 등록합니다.
 * Extension Agent가 이 서비스를 사용하여 LLM, 스트리밍, 도구 등을 호출합니다.
 */
export function initializeMainProcessSDK(): void {
  try {
    // AgentGraphServices 구현체 생성 (lazy - 실제 사용 시 초기화)
    _mainProcessServices = createAgentGraphServices();

    // State Registry 등록
    registerAgentStateRegistry({
      getAgentStateAnnotation: () => require('../domains/agent/state').AgentStateAnnotation,
      getCodingAgentStateAnnotation: () =>
        require('../domains/agent/state').CodingAgentStateAnnotation,
      createAgentState: (partial) => {
        const { createInitialAgentState } = require('../domains/agent/state');
        return { ...createInitialAgentState(), ...partial };
      },
      createCodingAgentState: (partial) => {
        const { createInitialCodingAgentState } = require('../domains/agent/state');
        return { ...createInitialCodingAgentState(), ...partial };
      },
    });

    // Tools Registry 등록
    registerToolsRegistry({
      toolsNode: require('../domains/agent/nodes/tools').toolsNode,
      shouldUseTool: require('../domains/agent/nodes/tools').shouldUseTool,
    });

    // Host Services 등록
    registerHostServices({
      database: {
        getSetting: (key) =>
          require('../../electron/services/database').databaseService.getSetting(key),
        setSetting: (key, val) =>
          require('../../electron/services/database').databaseService.setSetting(key, val),
        query: (sql, params) =>
          require('../../electron/services/database').databaseService.query(sql, params),
      },
      network: {
        getNetworkConfig: () => require('../http').getNetworkConfig(),
        createOctokitAgent: () => require('../http').createOctokitAgent(),
      },
      imagegen: {
        getComfyUIClient: () => require('../domains/integration/comfyui/client').getComfyUIClient(),
        initializeComfyUIClient: (c) =>
          require('../domains/integration/comfyui/client').initializeComfyUIClient(c),
        generateWithNanoBanana: (c) =>
          require('../domains/integration/imagegen/nanobanana-client').generateWithNanoBanana(c),
      },
      mcp: {
        executeBuiltinTool: (...args: any[]) =>
          require('../domains/mcp/tools/builtin-tools').executeBuiltinTool(...args),
        getGoogleSearchTools: () => {
          const m = require('../domains/mcp/tools/google-search-tools');
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
          const m = require('../domains/mcp/tools/builtin-tools');
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
        getMCPServerManager: () => require('../domains/mcp/server-manager').MCPServerManager,
      },
      llm: {
        getLLMClient: () => require('../domains/llm/client').getLLMClient(),
        getLLMService: () => require('../domains/llm/service').LLMService,
      },
      language: {
        getUserLanguage: async (source?: string) => {
          const { getUserLanguage } = await import('../domains/agent/utils/language-utils');
          return getUserLanguage(source || 'Extension');
        },
        getLanguageInstruction: (lang: string) => {
          const { getLanguageInstruction } = require('../domains/agent/utils/language-utils');
          return getLanguageInstruction(lang);
        },
      },
      graph: {
        getBaseGraphClass: () => require('../domains/agent/base/base-graph').BaseGraph,
      },
      streaming: {
        emitChunk: (chunk: string, conversationId?: string) => {
          const { emitStreamingChunk } = require('../domains/llm/streaming-callback');
          return emitStreamingChunk(chunk, conversationId);
        },
        setCurrentConversationId: (conversationId: string | null) => {
          const { setCurrentConversationId } = require('../domains/llm/streaming-callback');
          setCurrentConversationId(conversationId);
        },
        getCurrentConversationId: () => {
          const { getCurrentConversationId } = require('../domains/llm/streaming-callback');
          return getCurrentConversationId();
        },
      },
    });

    logger.info('[SDK-Init-Main] Main Process SDK initialized');
  } catch (error) {
    logger.error('[SDK-Init-Main] Failed to initialize Main Process SDK', { error });
  }
}

/**
 * 등록된 AgentGraphServices 가져오기
 */
export function getAgentGraphServices(): AgentGraphServices | null {
  return _mainProcessServices;
}

/**
 * AgentGraphServices 구현체 생성
 *
 * Host App의 실제 서비스를 래핑하여 SDK 인터페이스에 맞게 제공합니다.
 */
function createAgentGraphServices(): AgentGraphServices {
  return {
    llm: {
      async *streamChat(messages, options) {
        // Lazy import로 순환 의존성 방지
        const { LLMService } = await import('../domains/llm/service');
        for await (const chunk of LLMService.streamChat(messages, options)) {
          yield chunk;
        }
      },
      async chat(messages, options) {
        const { LLMService } = await import('../domains/llm/service');
        return LLMService.chat(messages, options);
      },
    },
    streaming: {
      emitChunk(chunk, conversationId) {
        // Lazy import
        const { emitStreamingChunk } = require('../domains/llm/streaming-callback');
        emitStreamingChunk(chunk, conversationId);
      },
      isAborted(conversationId) {
        const { isAborted } = require('../domains/llm/streaming-callback');
        return isAborted(conversationId);
      },
    },
    tools: {
      shouldUseTool(state) {
        const { shouldUseTool } = require('../domains/agent/nodes/tools');
        return shouldUseTool(state);
      },
      async executeTools(state) {
        const { toolsNode } = require('../domains/agent/nodes/tools');
        return toolsNode(state);
      },
    },
    language: {
      async getUserLanguage() {
        const { getUserLanguage } = await import('../domains/agent/utils/language-utils');
        return getUserLanguage('Extension');
      },
      getLanguageInstruction(lang) {
        const { getLanguageInstruction } = require('../domains/agent/utils/language-utils');
        return getLanguageInstruction(lang);
      },
    },
    skills: {
      async injectSkills(content, conversationId) {
        try {
          const { skillsInjector } = await import('../domains/agent/skills-injector');
          const result = await skillsInjector.injectSkills(content, conversationId);
          if (result.injectedSkills.length > 0) {
            return skillsInjector.getMessagesFromResult(result);
          }
        } catch (error) {
          logger.error('[SDK-Init-Main] Skills injection error:', error);
        }
        return [];
      },
    },
    logger,
  };
}
