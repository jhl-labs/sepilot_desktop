/**
 * Extension Context Factory
 *
 * Extension별로 격리된 Runtime Context를 생성합니다.
 * 각 Extension은 독립된 LLM Provider, Tool Registry를 갖습니다.
 */

import type {
  ExtensionRuntimeContext,
  ExtensionManifest,
  LLMProvider,
  VectorDBAccess,
  MCPAccess,
  SkillsAccess,
} from '@sepilot/extension-sdk';
import { createIPCBridge } from '@sepilot/extension-sdk/ipc';
import { createLogger } from '@sepilot/extension-sdk/utils';
import { isElectron, isMac, isWindows, isLinux } from '@sepilot/extension-sdk/utils';
import { WorkspaceAPIImpl } from './apis/workspace-api';
import { UIAPIImpl } from './apis/ui-api';
import { CommandAPIImpl } from './apis/command-api';
import { LLMProviderImpl } from './apis/llm-provider';
import { VectorDBAccessImpl } from './apis/vectordb-access';
import { MCPAccessImpl } from './apis/mcp-access';
import { SkillsAccessImpl } from './apis/skills-access';
import { NamespacedToolRegistry } from './namespaced-tool-registry';
import { AgentBuilderImpl } from './agent-builder';

export class ExtensionContextFactory {
  private llmProviders = new Map<string, LLMProvider>();
  private toolRegistries = new Map<string, NamespacedToolRegistry>();

  /**
   * Extension별 격리된 Context 생성
   */
  createContext(extensionId: string, manifest: ExtensionManifest): ExtensionRuntimeContext {
    console.log(`[ContextFactory] Creating context for extension: ${extensionId}`);

    // 권한 목록
    const permissions = manifest.permissions || [];

    // 1. Extension별 LLM Provider 생성 (격리됨)
    const llmProvider = this.createLLMProvider(extensionId, manifest);
    if (llmProvider) {
      this.llmProviders.set(extensionId, llmProvider);
    }

    // 2. Extension별 Tool Registry 생성 (네임스페이스 격리)
    const toolRegistry = this.createToolRegistry(extensionId);
    this.toolRegistries.set(extensionId, toolRegistry);

    // 3. Vector DB 접근 권한 확인
    const vectorDB = this.createVectorDBAccess(extensionId, permissions);

    // 4. MCP 접근 생성
    const mcp = this.createMCPAccess(extensionId, permissions);

    // 5. Skills 접근 생성
    const skills = this.createSkillsAccess(extensionId, permissions);

    // 6. API 구현체 생성
    const workspace = new WorkspaceAPIImpl(extensionId, permissions);
    const ui = new UIAPIImpl(extensionId, permissions);
    const commands = new CommandAPIImpl(extensionId, permissions);

    // 7. Agent Builder 생성
    const agent = new AgentBuilderImpl(extensionId, llmProvider, toolRegistry);

    // 8. Runtime Context 조립
    const context: ExtensionRuntimeContext = {
      ipc: createIPCBridge(),
      logger: createLogger(extensionId),
      platform: {
        isElectron,
        isMac,
        isWindows,
        isLinux,
      },
      workspace,
      ui,
      commands,
      tools: toolRegistry,
      agent,
      llm: llmProvider,
      vectorDB,
      mcp,
      skills,
    };

    console.log(`[ContextFactory] Context created for extension: ${extensionId}`);
    return context;
  }

  /**
   * Extension별 LLM Provider 생성
   *
   * IPC 프록시를 통해 Main Process의 LLM 서비스에 접근합니다.
   * llm:chat 또는 llm:stream 권한이 필요합니다.
   */
  private createLLMProvider(
    extensionId: string,
    manifest: ExtensionManifest
  ): LLMProvider | undefined {
    const permissions = manifest.permissions || [];

    // LLM 관련 권한이 있거나 Agent가 LLM을 요구하는 경우 생성
    const hasLLMPermission = permissions.some((p) => p.startsWith('llm:'));
    const requiresLLM = manifest.agents?.some((agent) => agent.llmConfig?.requiresProvider);

    if (!hasLLMPermission && !requiresLLM) {
      console.debug(`[ContextFactory] Extension ${extensionId} does not require LLM`);
      return undefined;
    }

    try {
      console.log(`[ContextFactory] Creating LLM Provider for ${extensionId}`);
      return new LLMProviderImpl(extensionId, permissions);
    } catch (error) {
      console.error(`[ContextFactory] Failed to create LLM Provider for ${extensionId}:`, error);
      return undefined;
    }
  }

  /**
   * Extension별 Tool Registry 생성
   */
  private createToolRegistry(extensionId: string): NamespacedToolRegistry {
    return new NamespacedToolRegistry(extensionId);
  }

  /**
   * Vector DB 접근 권한 확인 및 생성
   *
   * IPC 프록시를 통해 Main Process의 VectorDB 서비스에 접근합니다.
   * vectorDB.access 또는 vectordb:* 권한이 필요합니다.
   */
  private createVectorDBAccess(
    extensionId: string,
    permissions: string[]
  ): VectorDBAccess | undefined {
    const hasPermission =
      permissions.includes('vectorDB.access') || permissions.some((p) => p.startsWith('vectordb:'));

    if (!hasPermission) {
      return undefined;
    }

    try {
      console.log(`[ContextFactory] Creating VectorDB Access for ${extensionId}`);
      return new VectorDBAccessImpl(extensionId, permissions);
    } catch (error) {
      console.error(`[ContextFactory] Failed to create VectorDB Access for ${extensionId}:`, error);
      return undefined;
    }
  }

  /**
   * MCP 접근 생성
   *
   * IPC 프록시를 통해 Main Process의 MCP 서비스에 접근합니다.
   * mcp:call-tool 또는 mcp:list-tools 권한이 필요합니다.
   */
  private createMCPAccess(extensionId: string, permissions: string[]): MCPAccess | undefined {
    const hasPermission = permissions.some((p) => p.startsWith('mcp:'));

    if (!hasPermission) {
      return undefined;
    }

    try {
      console.log(`[ContextFactory] Creating MCP Access for ${extensionId}`);
      return new MCPAccessImpl(extensionId, permissions);
    } catch (error) {
      console.error(`[ContextFactory] Failed to create MCP Access for ${extensionId}:`, error);
      return undefined;
    }
  }

  /**
   * Skills 접근 생성
   *
   * IPC 프록시를 통해 Main Process의 Skills 서비스에 접근합니다.
   * skills:read 권한이 필요합니다.
   */
  private createSkillsAccess(extensionId: string, permissions: string[]): SkillsAccess | undefined {
    const hasPermission =
      permissions.includes('all') ||
      permissions.includes('skills:*') ||
      permissions.some((p) => p.startsWith('skills:'));

    if (!hasPermission) {
      return undefined;
    }

    try {
      console.log(`[ContextFactory] Creating Skills Access for ${extensionId}`);
      return new SkillsAccessImpl(extensionId, permissions);
    } catch (error) {
      console.error(`[ContextFactory] Failed to create Skills Access for ${extensionId}:`, error);
      return undefined;
    }
  }

  /**
   * Extension Context 정리
   */
  dispose(extensionId: string): void {
    console.log(`[ContextFactory] Disposing context for extension: ${extensionId}`);

    // LLM Provider 정리
    this.llmProviders.delete(extensionId);

    // Tool Registry 정리
    const toolRegistry = this.toolRegistries.get(extensionId);
    if (toolRegistry) {
      toolRegistry.dispose();
      this.toolRegistries.delete(extensionId);
    }
  }

  /**
   * 모든 Context 정리
   */
  disposeAll(): void {
    console.log('[ContextFactory] Disposing all contexts');

    this.llmProviders.clear();

    for (const toolRegistry of this.toolRegistries.values()) {
      toolRegistry.dispose();
    }
    this.toolRegistries.clear();
  }

  /**
   * Extension의 Tool Registry 조회
   */
  getToolRegistry(extensionId: string): NamespacedToolRegistry | undefined {
    return this.toolRegistries.get(extensionId);
  }
}
