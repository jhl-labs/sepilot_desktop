/**
 * Extension Manifest Validator
 *
 * Extension Manifest의 유효성을 검증하는 유틸리티
 */

import type {
  ExtensionManifest,
  ManifestValidationResult,
  ExtensionPermission,
} from '../types/extension';
import { MANIFEST_REQUIRED_FIELDS } from '../types/extension';

/**
 * Semver 정규식
 */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\da-z-]+(\.\d+)?)?(\+[\da-z-]+)?$/i;

/**
 * Extension ID 정규식 (소문자, 숫자, 하이픈만 허용)
 */
const EXTENSION_ID_REGEX = /^[a-z0-9-]+$/;

/**
 * Manifest 검증
 */
export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // null/undefined 체크
  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      errors: ['Manifest must be an object'],
      warnings: [],
    };
  }

  const m = manifest as Partial<ExtensionManifest>;

  // 필수 필드 검증
  for (const field of MANIFEST_REQUIRED_FIELDS) {
    if (!m[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // ID 검증
  if (m.id && !EXTENSION_ID_REGEX.test(m.id)) {
    errors.push('Extension ID must contain only lowercase letters, numbers, and hyphens');
  }

  // Version 검증 (Semver)
  if (m.version && !SEMVER_REGEX.test(m.version)) {
    errors.push('Version must follow semantic versioning (e.g., 1.0.0)');
  }

  // Mode 검증
  if (m.mode && typeof m.mode !== 'string') {
    errors.push('Mode must be a string');
  }

  // ProcessType 검증
  if (m.processType && !['renderer', 'main', 'both'].includes(m.processType)) {
    errors.push('ProcessType must be "renderer", "main", or "both"');
  }

  // Permissions 검증
  if (m.permissions) {
    if (!Array.isArray(m.permissions)) {
      errors.push('Permissions must be an array');
    } else {
      const validPermissions = new Set<ExtensionPermission>([
        'filesystem:read',
        'filesystem:write',
        'filesystem:delete',
        'filesystem:execute',
        'llm:chat',
        'llm:stream',
        'llm:vision',
        'vectordb:read',
        'vectordb:write',
        'vectordb:delete',
        'mcp:call-tool',
        'mcp:list-tools',
        'ipc:invoke',
        'ipc:handle',
        'ipc:send',
        'network:http',
        'network:websocket',
        'storage:read',
        'storage:write',
        'skills:read',
        'skills:execute',
        'skills:manage',
        'terminal:create',
        'terminal:execute',
        'browser:navigate',
        'browser:execute-script',
        'clipboard:read',
        'clipboard:write',
        'notification:show',
        'all',
      ]);

      for (const permission of m.permissions) {
        if (!validPermissions.has(permission as ExtensionPermission)) {
          warnings.push(`Unknown permission: ${permission}`);
        }
      }

      // 'all' 권한 경고
      if (m.permissions.includes('all')) {
        warnings.push(
          'Permission "all" grants unrestricted access. Consider using specific permissions instead.'
        );
      }
    }
  }

  // Dependencies 검증
  if (m.dependencies) {
    if (!Array.isArray(m.dependencies)) {
      errors.push('Dependencies must be an array');
    } else {
      for (const dep of m.dependencies) {
        if (typeof dep !== 'string') {
          errors.push(`Invalid dependency: ${dep} (must be a string)`);
        } else if (!EXTENSION_ID_REGEX.test(dep)) {
          errors.push(`Invalid dependency ID: ${dep}`);
        }
      }

      // 순환 의존성 경고
      if (m.dependencies.includes(m.id || '')) {
        errors.push('Extension cannot depend on itself');
      }
    }
  }

  // Agents 검증
  if (m.agents) {
    if (!Array.isArray(m.agents)) {
      errors.push('Agents must be an array');
    } else {
      for (let i = 0; i < m.agents.length; i++) {
        const agent = m.agents[i];
        if (!agent.id || !agent.name || !agent.description || !agent.type) {
          errors.push(`Agent at index ${i} is missing required fields`);
        }
      }
    }
  }

  // SettingsTab 검증
  if (m.settingsTab) {
    const tab = m.settingsTab;
    if (!tab.id || !tab.label || !tab.description || !tab.icon) {
      errors.push('SettingsTab is missing required fields');
    }
  }

  // Order 검증
  if (m.order !== undefined && (typeof m.order !== 'number' || m.order < 0)) {
    warnings.push('Order should be a non-negative number');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Permission 검증
 */
export function isValidPermission(permission: string): permission is ExtensionPermission {
  const validPermissions: ExtensionPermission[] = [
    'filesystem:read',
    'filesystem:write',
    'filesystem:delete',
    'filesystem:execute',
    'llm:chat',
    'llm:stream',
    'llm:vision',
    'vectordb:read',
    'vectordb:write',
    'vectordb:delete',
    'mcp:call-tool',
    'mcp:list-tools',
    'ipc:invoke',
    'ipc:handle',
    'ipc:send',
    'network:http',
    'network:websocket',
    'storage:read',
    'storage:write',
    'skills:read',
    'skills:execute',
    'skills:manage',
    'terminal:create',
    'terminal:execute',
    'browser:navigate',
    'browser:execute-script',
    'clipboard:read',
    'clipboard:write',
    'notification:show',
    'all',
  ];

  return validPermissions.includes(permission as ExtensionPermission);
}

/**
 * Permission 카테고리 가져오기
 */
export function getPermissionCategory(permission: ExtensionPermission): string | null {
  const parts = permission.split(':');
  return parts.length > 1 ? parts[0] : null;
}

/**
 * Extension ID 검증
 */
export function isValidExtensionId(id: string): boolean {
  return EXTENSION_ID_REGEX.test(id);
}

/**
 * Semver 검증
 */
export function isValidSemver(version: string): boolean {
  return SEMVER_REGEX.test(version);
}
