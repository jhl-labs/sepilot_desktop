/**
 * Extension Permission Validator
 *
 * Extension의 permission을 검증하고 제어합니다.
 * ext-docs/05-permission-system.md 참조
 */

import { logger } from '../utils/logger';
import type { ExtensionManifest } from './types';

/**
 * Permission Categories
 */
export const PERMISSION_CATEGORIES = {
  // File System
  'filesystem:read': 'Read files from disk',
  'filesystem:write': 'Write files to disk',
  'filesystem:delete': 'Delete files from disk',
  'filesystem:execute': 'Execute files (scripts, binaries)',

  // LLM
  'llm:chat': 'Use LLM chat API',
  'llm:stream': 'Use LLM streaming API',
  'llm:vision': 'Use LLM vision API',

  // Vector DB
  'vectordb:read': 'Read from vector database',
  'vectordb:write': 'Write to vector database',
  'vectordb:delete': 'Delete from vector database',

  // MCP (Model Context Protocol)
  'mcp:call-tool': 'Call MCP tools',
  'mcp:list-tools': 'List available MCP tools',

  // IPC
  'ipc:invoke': 'Invoke IPC handlers',
  'ipc:handle': 'Register IPC handlers',
  'ipc:send': 'Send IPC messages',

  // Network
  'network:http': 'Make HTTP requests',
  'network:websocket': 'Use WebSocket connections',

  // Storage
  'storage:read': 'Read from storage',
  'storage:write': 'Write to storage',

  // Skills
  'skills:read': 'Read skills',
  'skills:execute': 'Execute skills',
  'skills:manage': 'Manage skills',

  // Terminal
  'terminal:create': 'Create terminal sessions',
  'terminal:execute': 'Execute terminal commands',

  // Browser
  'browser:navigate': 'Navigate browser',
  'browser:execute-script': 'Execute scripts in browser',

  // Clipboard
  'clipboard:read': 'Read from clipboard',
  'clipboard:write': 'Write to clipboard',

  // Notification
  'notification:show': 'Show notifications',

  // UI
  'ui:show-toast': 'Show toast messages',
  'ui:show-dialog': 'Show dialog windows',

  // All permissions (wildcard)
  all: 'All permissions (development only)',
} as const;

export type Permission = keyof typeof PERMISSION_CATEGORIES;

/**
 * Permission Validator
 */
export class PermissionValidator {
  private extensionId: string;
  private grantedPermissions: Set<string>;

  constructor(extensionId: string, manifest: ExtensionManifest) {
    this.extensionId = extensionId;
    this.grantedPermissions = new Set(manifest.permissions || []);

    logger.info(`[PermissionValidator] Initialized for ${extensionId}`, {
      permissions: Array.from(this.grantedPermissions),
    });
  }

  /**
   * Check if extension has specific permission
   */
  hasPermission(permission: string): boolean {
    // Wildcard permission check
    // filesystem:* grants all filesystem permissions
    const category = permission.split(':')[0];
    const wildcardPermission = `${category}:*`;

    // Wildcard '*' permission은 개발 모드에서만 허용
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const hasWildcardAll = isDevelopment && this.grantedPermissions.has('*');

    const granted =
      this.grantedPermissions.has(permission) ||
      this.grantedPermissions.has(wildcardPermission) ||
      hasWildcardAll;

    if (!granted) {
      logger.warn(`[PermissionValidator] Permission denied for ${this.extensionId}: ${permission}`);
    }

    return granted;
  }

  /**
   * Require permission (throw error if not granted)
   */
  requirePermission(permission: string): void {
    if (!this.hasPermission(permission)) {
      throw new Error(
        `Extension ${this.extensionId} requires permission: ${permission} but it was not granted`
      );
    }
  }

  /**
   * Check multiple permissions
   */
  hasAllPermissions(permissions: string[]): boolean {
    return permissions.every((permission) => this.hasPermission(permission));
  }

  /**
   * Get all granted permissions
   */
  getGrantedPermissions(): string[] {
    return Array.from(this.grantedPermissions);
  }

  /**
   * Validate manifest permissions
   * Returns invalid permissions
   */
  static validateManifestPermissions(manifest: ExtensionManifest): string[] {
    const permissions = manifest.permissions || [];
    const invalidPermissions: string[] = [];

    for (const permission of permissions) {
      // Wildcard permission (all) or category wildcard
      const permStr = permission as string;
      if (permStr.endsWith(':*') || permission === 'all') {
        continue;
      }

      // Check if permission exists in PERMISSION_CATEGORIES
      if (!(permission in PERMISSION_CATEGORIES)) {
        invalidPermissions.push(permission);
      }
    }

    if (invalidPermissions.length > 0) {
      logger.warn(`[PermissionValidator] Invalid permissions in manifest for ${manifest.id}:`, {
        invalid: invalidPermissions,
      });
    }

    return invalidPermissions;
  }
}

/**
 * Create Permission Validator for Extension
 */
export function createPermissionValidator(
  extensionId: string,
  manifest: ExtensionManifest
): PermissionValidator {
  return new PermissionValidator(extensionId, manifest);
}
