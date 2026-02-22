/**
 * Extension Dependency Resolver
 *
 * Extension 간 의존성을 해결하고 로딩 순서를 결정합니다.
 * ext-docs/03-runtime-loading.md#dependency-resolution 참조
 */

import { logger } from '../utils/logger';
import type { ExtensionManifest } from './types';

export interface DependencyNode {
  id: string;
  dependencies: string[];
  manifest: ExtensionManifest;
}

/**
 * Dependency Resolver
 */
export class DependencyResolver {
  private nodes: Map<string, DependencyNode> = new Map();

  /**
   * Add extension to dependency graph
   */
  addExtension(manifest: ExtensionManifest): void {
    const node: DependencyNode = {
      id: manifest.id,
      dependencies: manifest.dependencies || [],
      manifest,
    };

    this.nodes.set(manifest.id, node);
  }

  /**
   * Resolve dependencies and return sorted extension IDs
   *
   * @returns Extension IDs in dependency order (dependencies first)
   * @throws Error if circular dependency detected or missing dependency
   */
  resolve(): string[] {
    const resolved: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string, path: string[] = []): void => {
      // Already resolved
      if (visited.has(id)) {
        return;
      }

      // Circular dependency detection
      if (visiting.has(id)) {
        const cycle = [...path, id].join(' -> ');
        throw new Error(`Circular dependency detected: ${cycle}`);
      }

      const node = this.nodes.get(id);
      if (!node) {
        throw new Error(`Missing dependency: ${id} required by ${path[path.length - 1] || 'root'}`);
      }

      // Mark as visiting
      visiting.add(id);

      // Visit dependencies first
      for (const depId of node.dependencies) {
        visit(depId, [...path, id]);
      }

      // Mark as visited and add to resolved list
      visiting.delete(id);
      visited.add(id);
      resolved.push(id);

      logger.debug(`[DependencyResolver] Resolved: ${id}`, {
        dependencies: node.dependencies,
        position: resolved.length,
      });
    };

    // Visit all nodes
    for (const id of this.nodes.keys()) {
      visit(id);
    }

    logger.info('[DependencyResolver] Dependency resolution complete', {
      order: resolved,
      total: resolved.length,
    });

    return resolved;
  }

  /**
   * Validate all dependencies exist
   *
   * @returns Array of missing dependency IDs
   */
  validateDependencies(): string[] {
    const missing: string[] = [];

    for (const node of this.nodes.values()) {
      for (const depId of node.dependencies) {
        if (!this.nodes.has(depId)) {
          missing.push(`${node.id} requires ${depId}`);
        }
      }
    }

    if (missing.length > 0) {
      logger.warn('[DependencyResolver] Missing dependencies detected:', missing);
    }

    return missing;
  }

  /**
   * Check if extension has dependencies
   */
  hasDependencies(extensionId: string): boolean {
    const node = this.nodes.get(extensionId);
    return node ? node.dependencies.length > 0 : false;
  }

  /**
   * Get direct dependencies of an extension
   */
  getDependencies(extensionId: string): string[] {
    const node = this.nodes.get(extensionId);
    return node ? [...node.dependencies] : [];
  }

  /**
   * Get all extensions that depend on this extension
   */
  getDependents(extensionId: string): string[] {
    const dependents: string[] = [];

    for (const node of this.nodes.values()) {
      if (node.dependencies.includes(extensionId)) {
        dependents.push(node.id);
      }
    }

    return dependents;
  }

  /**
   * Clear all nodes
   */
  clear(): void {
    this.nodes.clear();
  }
}

/**
 * Sort extensions by dependencies
 *
 * @param manifests - Array of extension manifests
 * @returns Sorted array of manifests (dependencies first)
 * @throws Error if circular dependency or missing dependency
 */
export function sortExtensionsByDependencies<T extends { manifest: ExtensionManifest }>(
  extensions: T[]
): T[] {
  const resolver = new DependencyResolver();

  // Add all extensions to resolver
  for (const ext of extensions) {
    resolver.addExtension(ext.manifest);
  }

  // Validate dependencies
  const missing = resolver.validateDependencies();
  if (missing.length > 0) {
    throw new Error(`Missing dependencies:\n${missing.join('\n')}`);
  }

  // Resolve dependency order
  const order = resolver.resolve();

  // Sort extensions by resolved order
  const sortedExtensions: T[] = [];
  for (const id of order) {
    const ext = extensions.find((e) => e.manifest.id === id);
    if (ext) {
      sortedExtensions.push(ext);
    }
  }

  logger.info('[DependencyResolver] Extensions sorted by dependencies:', {
    order: sortedExtensions.map((e) => e.manifest.id),
  });

  return sortedExtensions;
}
