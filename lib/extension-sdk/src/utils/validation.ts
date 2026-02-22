/**
 * Extension Manifest 검증
 *
 * Extension이 올바른 구조와 필수 필드를 갖추고 있는지 검증합니다.
 */

import type { ExtensionManifest, AgentManifest } from '../types/extension';

/**
 * 유효한 권한 목록
 */
import { PERMISSION_CATEGORIES } from '../types/extension';

/**
 * 유효한 권한 목록
 */
const VALID_PERMISSIONS = [...Object.values(PERMISSION_CATEGORIES).flat(), 'all'];

/**
 * Extension Manifest 검증
 *
 * @throws {Error} 검증 실패 시 에러 발생
 */
export function validateExtensionManifest(manifest: ExtensionManifest): void {
  // 필수 필드 검증
  const requiredFields: (keyof ExtensionManifest)[] = [
    'id',
    'name',
    'version',
    'author',
    'icon',
    'mode',
  ];

  for (const field of requiredFields) {
    if (!manifest[field]) {
      throw new Error(
        `Extension manifest missing required field: ${field} (Extension: ${manifest.id || 'unknown'})`
      );
    }
  }

  // ID 형식 검증 (kebab-case)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id)) {
    throw new Error(`Extension ID must be in kebab-case format: ${manifest.id}`);
  }

  // Version 형식 검증 (semver)
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(manifest.version)) {
    throw new Error(
      `Extension version must be in semver format: ${manifest.version} (Extension: ${manifest.id})`
    );
  }

  // Agent 검증
  if (manifest.agents) {
    for (const agent of manifest.agents) {
      validateAgentManifest(agent, manifest.id);
    }
  }

  // 권한 검증
  if (manifest.permissions) {
    for (const permission of manifest.permissions) {
      if (!VALID_PERMISSIONS.includes(permission)) {
        throw new Error(
          `Invalid permission: ${permission} (Extension: ${manifest.id})\n` +
            `Valid permissions: ${VALID_PERMISSIONS.join(', ')}`
        );
      }
    }
  }

  // Export 검증
  if (manifest.exports) {
    if (typeof manifest.exports !== 'object' || Array.isArray(manifest.exports)) {
      throw new Error(`Extension exports must be an object (Extension: ${manifest.id})`);
    }
  }
}

/**
 * Agent Manifest 검증
 *
 * @throws {Error} 검증 실패 시 에러 발생
 */
export function validateAgentManifest(agent: AgentManifest, extensionId: string): void {
  // 필수 필드 검증
  if (!agent.id || !agent.name || !agent.type) {
    throw new Error(
      `Agent manifest missing required fields (id, name, type) (Extension: ${extensionId}, Agent: ${agent.id || 'unknown'})`
    );
  }

  // Agent ID 형식 검증 (kebab-case)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(agent.id)) {
    throw new Error(
      `Agent ID must be in kebab-case format: ${agent.id} (Extension: ${extensionId})`
    );
  }

  // Agent 타입 검증
  const validTypes = ['tool-calling', 'rag', 'thinking', 'custom'];
  if (!validTypes.includes(agent.type)) {
    throw new Error(
      `Invalid agent type: ${agent.type} (Extension: ${extensionId}, Agent: ${agent.id})\n` +
        `Valid types: ${validTypes.join(', ')}`
    );
  }

  // System Prompt Template 필수
  if (!agent.systemPromptTemplate) {
    throw new Error(
      `Agent must have systemPromptTemplate (Extension: ${extensionId}, Agent: ${agent.id})`
    );
  }

  // LLM 설정 검증
  if (agent.llmConfig) {
    if (typeof agent.llmConfig.requiresProvider !== 'boolean') {
      throw new Error(
        `Agent llmConfig.requiresProvider must be boolean (Extension: ${extensionId}, Agent: ${agent.id})`
      );
    }
  }

  // Tool 설정 검증
  if (agent.tools) {
    if (!Array.isArray(agent.tools)) {
      throw new Error(
        `Agent tools must be an array (Extension: ${extensionId}, Agent: ${agent.id})`
      );
    }

    for (const tool of agent.tools) {
      if (!tool.namespace || !tool.registry) {
        throw new Error(
          `Agent tool must have namespace and registry (Extension: ${extensionId}, Agent: ${agent.id})`
        );
      }
    }
  }

  // RAG 설정 검증
  if (agent.rag) {
    if (typeof agent.rag.enabled !== 'boolean') {
      throw new Error(
        `Agent rag.enabled must be boolean (Extension: ${extensionId}, Agent: ${agent.id})`
      );
    }

    if (typeof agent.rag.vectorDBAccess !== 'boolean') {
      throw new Error(
        `Agent rag.vectorDBAccess must be boolean (Extension: ${extensionId}, Agent: ${agent.id})`
      );
    }
  }

  // 옵션 검증
  if (agent.options) {
    if (agent.options.maxIterations !== undefined) {
      if (typeof agent.options.maxIterations !== 'number' || agent.options.maxIterations <= 0) {
        throw new Error(
          `Agent options.maxIterations must be a positive number (Extension: ${extensionId}, Agent: ${agent.id})`
        );
      }
    }

    if (agent.options.streaming !== undefined && typeof agent.options.streaming !== 'boolean') {
      throw new Error(
        `Agent options.streaming must be boolean (Extension: ${extensionId}, Agent: ${agent.id})`
      );
    }

    if (
      agent.options.toolApproval !== undefined &&
      typeof agent.options.toolApproval !== 'boolean'
    ) {
      throw new Error(
        `Agent options.toolApproval must be boolean (Extension: ${extensionId}, Agent: ${agent.id})`
      );
    }
  }
}

/**
 * Extension Manifest 검증 (에러를 반환)
 *
 * @returns 검증 성공 시 null, 실패 시 에러 메시지
 */
export function validateExtensionManifestSafe(manifest: ExtensionManifest): string | null {
  try {
    validateExtensionManifest(manifest);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
