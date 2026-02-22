/**
 * Main Process Extension Context Factory
 *
 * Main Process에서 Extension에 주입할 ExtensionContext를 생성합니다.
 * ext-docs/01-architecture.md#extensioncontext 참조
 */

import { ipcMain, app, safeStorage, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { logger as mainLogger } from '../utils/logger';
import type { ExtensionContext, ExtensionManifest } from './types';
import { createPermissionValidator } from './permission-validator';
import { getLLMClient } from '../domains/llm/client';
import { vectorDBService } from '@/electron/services/vectordb';
import { getEmbeddingProvider } from '../domains/rag/embeddings/client';
import { MCPServerManager } from '../domains/mcp/server-manager';
import type { Message, LLMChatResponse } from '@sepilot/extension-sdk';

/**
 * Create ExtensionContext for Main Process
 *
 * @param extensionId - Extension ID
 * @param extensionPath - Extension 설치 경로
 * @param manifest - Extension manifest (for permission validation)
 * @returns ExtensionContext instance
 */
export function createMainExtensionContext(
  extensionId: string,
  extensionPath: string,
  manifest: ExtensionManifest
): ExtensionContext {
  // Permission Validator 생성
  const permissionValidator = createPermissionValidator(extensionId, manifest);
  // Extension 전용 저장소 경로
  const storagePath = path.join(app.getPath('userData'), 'extensions', extensionId);

  // 저장소 디렉토리 생성
  fs.mkdir(storagePath, { recursive: true }).catch((err) => {
    mainLogger.error(
      `[ExtensionContext] Failed to create storage directory for ${extensionId}:`,
      err
    );
  });

  const context: any = {
    extensionId,
    extensionPath,
    storagePath,

    /**
     * Register IPC Handler
     *
     * Extension이 IPC 핸들러를 등록할 수 있도록 함
     * 채널 이름은 자동으로 네임스페이스됨: extension:{extensionId}:{channel}
     */
    registerIpcHandler<TReq = any, TRes = any>(
      channel: string,
      handler: (event: any, request: TReq) => Promise<TRes> | TRes,
      permission?: string
    ): void {
      const fullChannel = `extension:${extensionId}:${channel}`;

      mainLogger.info(`[ExtensionContext] Registering IPC handler: ${fullChannel}`, {
        permission,
      });

      // Permission 검증
      if (permission) {
        permissionValidator.requirePermission(permission);
        mainLogger.debug(
          `[ExtensionContext] Permission validated for ${fullChannel}: ${permission}`
        );
      }

      // IPC Main Handler 등록
      ipcMain.handle(fullChannel, async (event, data: TReq) => {
        try {
          const result = await handler(event, data);
          return result;
        } catch (error: any) {
          mainLogger.error(`[ExtensionContext] IPC handler error: ${fullChannel}`, {
            error: error.message,
          });
          return {
            success: false,
            error: error.message || 'Unknown error',
          };
        }
      });
    },

    /**
     * LLM API
     */
    llm: {
      async chat(messages: Message[], options?: any): Promise<LLMChatResponse> {
        // Permission 검증
        permissionValidator.requirePermission('llm:chat');

        try {
          const client = getLLMClient();
          if (!client.isConfigured()) {
            throw new Error('LLM client not configured');
          }

          const provider = client.getProvider();
          const response = await provider.chat(messages, options);
          return response as any;
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] LLM chat error:`, error);
          throw error;
        }
      },

      async *stream(messages: Message[], options?: any): AsyncIterable<string> {
        // Permission 검증
        permissionValidator.requirePermission('llm:stream');

        try {
          const client = getLLMClient();
          if (!client.isConfigured()) {
            throw new Error('LLM client not configured');
          }

          const provider = client.getProvider();
          for await (const chunk of provider.stream(messages, options)) {
            yield chunk as any;
          }
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] LLM stream error:`, error);
          throw error;
        }
      },
    },

    /**
     * Vector DB API
     */
    vectorDB: {
      async search(query: string, options?: any): Promise<any[]> {
        // Permission 검증
        permissionValidator.requirePermission('vectordb:search');

        try {
          // Embedding Provider로 쿼리 임베딩 생성
          const embedder = getEmbeddingProvider();
          const queryEmbedding = await embedder.embed(query);

          // VectorDB에서 검색
          const results = await vectorDBService.searchByVector(
            queryEmbedding,
            options?.limit || options?.topK || 5,
            {
              folderPath: options?.folderPath || options?.filter?.folderPath,
              tags: options?.tags || options?.filter?.tags,
              category: options?.category || options?.filter?.category,
              source: options?.source || options?.filter?.source,
              docGroup: options?.docGroup || 'all',
            } as any,
            query
          );

          return results;
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] VectorDB search error:`, error);
          throw error;
        }
      },

      async insert(documents: any[]): Promise<void> {
        // Permission 검증
        permissionValidator.requirePermission('vectordb:insert');

        try {
          // RawDocument 형식으로 변환하여 indexDocuments 사용
          const rawDocs = documents.map((doc) => ({
            id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            content: doc.content,
            metadata: {
              ...doc.metadata,
              extensionId, // Extension ID 추가
            },
          }));

          // 문서 인덱싱 (청킹 + 임베딩 + 삽입)
          await vectorDBService.indexDocuments(rawDocs, {
            chunkSize: 1000,
            chunkOverlap: 200,
            batchSize: 10,
          });
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] VectorDB insert error:`, error);
          throw error;
        }
      },

      async delete(ids: string[]): Promise<void> {
        // Permission 검증
        permissionValidator.requirePermission('vectordb:delete');

        try {
          await vectorDBService.delete(ids);
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] VectorDB delete error:`, error);
          throw error;
        }
      },

      async add(documents: any[]): Promise<void> {
        // insert의 별칭 (표준 이름)
        return this.insert(documents);
      },
    },

    /**
     * MCP API
     */
    mcp: {
      async execute(
        toolName: string,
        args: Record<string, unknown>,
        options?: { serverId?: string }
      ): Promise<unknown> {
        // Permission 검증
        permissionValidator.requirePermission('mcp:call-tool');

        try {
          // serverId가 제공되면 직접 사용, 아니면 toolName에서 추출
          const serverName =
            options?.serverId || (toolName.includes('.') ? toolName.split('.')[0] : undefined);
          const actualToolName = toolName.includes('.')
            ? toolName.split('.').slice(1).join('.')
            : toolName;

          if (!serverName) {
            throw new Error(
              `Server ID not specified. Use options.serverId or format: serverName.toolName`
            );
          }

          const result = await MCPServerManager.callToolInMainProcess(
            serverName,
            actualToolName,
            args
          );
          return result;
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] MCP execute error:`, error);
          throw error;
        }
      },

      async executeTool(toolName: string, args: any): Promise<any> {
        // execute의 별칭 (하위 호환성)
        return this.execute(toolName, args);
      },

      async listTools(): Promise<any[]> {
        // Permission 검증
        permissionValidator.requirePermission('mcp:list-tools');

        try {
          const tools = MCPServerManager.getAllToolsInMainProcess();
          return tools;
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] MCP listTools error:`, error);
          throw error;
        }
      },

      async listServers(): Promise<any[]> {
        // Permission 검증
        permissionValidator.requirePermission('mcp:list-tools');

        // TODO: Implement MCPServerManager.listServers()
        // const servers = MCPServerManager.listServers();
        return [];
      },
    },

    /**
     * File System API (isolated to extension storage)
     */
    fs: {
      async readFile(filePath: string): Promise<string> {
        const fullPath = path.join(storagePath, filePath);

        // Path Traversal 방지
        if (!fullPath.startsWith(storagePath)) {
          throw new Error('Path traversal detected');
        }

        const content = await fs.readFile(fullPath, 'utf-8');
        return content;
      },

      async writeFile(filePath: string, content: string): Promise<void> {
        const fullPath = path.join(storagePath, filePath);

        // Path Traversal 방지
        if (!fullPath.startsWith(storagePath)) {
          throw new Error('Path traversal detected');
        }

        // 디렉토리 생성
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
      },

      async readDir(dirPath: string): Promise<string[]> {
        const fullPath = path.join(storagePath, dirPath);

        // Path Traversal 방지
        if (!fullPath.startsWith(storagePath)) {
          throw new Error('Path traversal detected');
        }

        const entries = await fs.readdir(fullPath);
        return entries;
      },

      async deleteFile(filePath: string): Promise<void> {
        const fullPath = path.join(storagePath, filePath);

        // Path Traversal 방지
        if (!fullPath.startsWith(storagePath)) {
          throw new Error('Path traversal detected');
        }

        await fs.unlink(fullPath);
      },
    },

    /**
     * Secure Storage API
     */
    storage: {
      secure: {
        async encrypt(plaintext: string): Promise<string> {
          if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure storage is not available on this platform');
          }

          try {
            const buffer = safeStorage.encryptString(plaintext);
            return buffer.toString('base64');
          } catch (error: any) {
            mainLogger.error(`[Extension:${extensionId}] Secure storage encrypt error:`, error);
            throw error;
          }
        },

        async decrypt(encrypted: string): Promise<string> {
          if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure storage is not available on this platform');
          }

          try {
            const buffer = Buffer.from(encrypted, 'base64');
            return safeStorage.decryptString(buffer);
          } catch (error: any) {
            mainLogger.error(`[Extension:${extensionId}] Secure storage decrypt error:`, error);
            throw error;
          }
        },

        isAvailable(): boolean {
          return safeStorage.isEncryptionAvailable();
        },
      },
    },

    /**
     * Window Management API
     */
    window: {
      sendToRenderer(channel: string, data?: any): void {
        try {
          const windows = BrowserWindow.getAllWindows();
          if (windows.length === 0) {
            mainLogger.warn(
              `[Extension:${extensionId}] No windows found for sendToRenderer: ${channel}`
            );
            return;
          }

          // Send to all windows
          windows.forEach((win) => {
            win.webContents.send(channel, data);
          });

          mainLogger.debug(
            `[Extension:${extensionId}] Sent to renderer: ${channel}`,
            `(${windows.length} window(s))`
          );
        } catch (error: any) {
          mainLogger.error(`[Extension:${extensionId}] Window sendToRenderer error:`, error);
          throw error;
        }
      },
    },

    /**
     * Logger API
     */
    logger: {
      info(message: string, ...args: any[]): void {
        mainLogger.info(`[Extension:${extensionId}] ${message}`, ...args);
      },

      warn(message: string, ...args: any[]): void {
        mainLogger.warn(`[Extension:${extensionId}] ${message}`, ...args);
      },

      error(message: string, ...args: any[]): void {
        mainLogger.error(`[Extension:${extensionId}] ${message}`, ...args);
      },

      debug(message: string, ...args: any[]): void {
        mainLogger.debug(`[Extension:${extensionId}] ${message}`, ...args);
      },
    },
  };

  return context;
}
