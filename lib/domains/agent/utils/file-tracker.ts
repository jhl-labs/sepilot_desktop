import { logger } from '@/lib/utils/logger';
/**
 * File Tracker for Coding Agent
 *
 * Tracks file changes with diff generation and rollback support
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileSnapshot {
  filePath: string;
  content: string;
  hash: string;
  timestamp: number;
  size: number;
}

export interface FileChange {
  filePath: string;
  operation: 'create' | 'modify' | 'delete';
  before?: FileSnapshot;
  after?: FileSnapshot;
  timestamp: number;
  diff?: string;
}

export interface RollbackPoint {
  id: string;
  timestamp: number;
  description: string;
  changes: FileChange[];
}

export class FileTracker {
  private snapshots: Map<string, FileSnapshot[]> = new Map();
  private changes: FileChange[] = [];
  private rollbackPoints: RollbackPoint[] = [];
  private readonly MAX_SNAPSHOTS_PER_FILE = 10;
  private readonly MAX_ROLLBACK_POINTS = 5;

  /**
   * Create a snapshot of a file
   */
  async createSnapshot(filePath: string): Promise<FileSnapshot | null> {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        return null;
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const hash = this.hashContent(content);
      const stats = fs.statSync(absolutePath);

      const snapshot: FileSnapshot = {
        filePath: absolutePath,
        content,
        hash,
        timestamp: Date.now(),
        size: stats.size,
      };

      // Store snapshot
      const fileSnapshots = this.snapshots.get(absolutePath) || [];
      fileSnapshots.push(snapshot);

      // Keep only recent snapshots
      if (fileSnapshots.length > this.MAX_SNAPSHOTS_PER_FILE) {
        fileSnapshots.shift();
      }

      this.snapshots.set(absolutePath, fileSnapshots);

      return snapshot;
    } catch (error) {
      console.error(`[FileTracker] Failed to create snapshot for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Record a file change
   */
  async recordChange(
    filePath: string,
    operation: 'create' | 'modify' | 'delete',
    beforeSnapshot?: FileSnapshot
  ): Promise<FileChange> {
    const absolutePath = path.resolve(filePath);

    let afterSnapshot: FileSnapshot | undefined;
    if (operation !== 'delete') {
      afterSnapshot = (await this.createSnapshot(absolutePath)) ?? undefined;
    }

    const change: FileChange = {
      filePath: absolutePath,
      operation,
      before: beforeSnapshot,
      after: afterSnapshot,
      timestamp: Date.now(),
    };

    // Generate diff if both snapshots exist
    if (beforeSnapshot && afterSnapshot) {
      change.diff = this.generateDiff(beforeSnapshot.content, afterSnapshot.content);
    }

    this.changes.push(change);

    logger.info(`[FileTracker] Recorded ${operation} on ${path.basename(filePath)}`);

    return change;
  }

  /**
   * Track file before modification
   */
  async trackBeforeModify(filePath: string): Promise<FileSnapshot | null> {
    return await this.createSnapshot(filePath);
  }

  /**
   * Track file after modification
   */
  async trackAfterModify(
    filePath: string,
    beforeSnapshot: FileSnapshot | null | undefined
  ): Promise<void> {
    if (beforeSnapshot) {
      await this.recordChange(filePath, 'modify', beforeSnapshot);
    } else {
      // New file creation
      await this.recordChange(filePath, 'create');
    }
  }

  /**
   * Create a rollback point
   */
  createRollbackPoint(description: string): RollbackPoint {
    const point: RollbackPoint = {
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: Date.now(),
      description,
      changes: [...this.changes],
    };

    this.rollbackPoints.push(point);

    // Keep only recent rollback points
    if (this.rollbackPoints.length > this.MAX_ROLLBACK_POINTS) {
      this.rollbackPoints.shift();
    }

    logger.info(`[FileTracker] Created rollback point: ${description} (${point.id})`);

    return point;
  }

  /**
   * Rollback to a specific point
   */
  async rollbackTo(pointId: string): Promise<{ success: boolean; error?: string }> {
    const point = this.rollbackPoints.find((p) => p.id === pointId);
    if (!point) {
      return { success: false, error: `Rollback point ${pointId} not found` };
    }

    logger.info(`[FileTracker] Rolling back to: ${point.description}`);

    try {
      // Reverse changes in reverse order
      const changesToRevert = this.changes.slice(
        this.changes.findIndex((c) => c.timestamp > point.timestamp)
      );

      for (const change of changesToRevert.reverse()) {
        await this.revertChange(change);
      }

      // Remove changes after rollback point
      this.changes = this.changes.filter((c) => c.timestamp <= point.timestamp);

      logger.info(`[FileTracker] Successfully rolled back ${changesToRevert.length} changes`);

      return { success: true };
    } catch (error: any) {
      console.error('[FileTracker] Rollback failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Revert a single change
   */
  private async revertChange(change: FileChange): Promise<void> {
    logger.info(`[FileTracker] Reverting ${change.operation} on ${path.basename(change.filePath)}`);

    switch (change.operation) {
      case 'create':
        // Delete the created file
        if (fs.existsSync(change.filePath)) {
          fs.unlinkSync(change.filePath);
        }
        break;

      case 'modify':
        // Restore previous content
        if (change.before) {
          fs.writeFileSync(change.filePath, change.before.content, 'utf-8');
        }
        break;

      case 'delete':
        // Restore deleted file
        if (change.before) {
          fs.writeFileSync(change.filePath, change.before.content, 'utf-8');
        }
        break;
    }
  }

  /**
   * Generate simple diff
   */
  private generateDiff(before: string, after: string): string {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    const diff: string[] = [];
    const maxLen = Math.max(beforeLines.length, afterLines.length);

    for (let i = 0; i < maxLen; i++) {
      const beforeLine = beforeLines[i];
      const afterLine = afterLines[i];

      if (beforeLine !== afterLine) {
        if (beforeLine !== undefined) {
          diff.push(`- ${beforeLine}`);
        }
        if (afterLine !== undefined) {
          diff.push(`+ ${afterLine}`);
        }
      }
    }

    return diff.join('\n');
  }

  /**
   * Get hash of content
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get all changes
   */
  getChanges(): FileChange[] {
    return [...this.changes];
  }

  /**
   * Get changes summary
   */
  getChangesSummary(): {
    totalChanges: number;
    created: number;
    modified: number;
    deleted: number;
    files: string[];
  } {
    const uniqueFiles = new Set<string>();
    let created = 0;
    let modified = 0;
    let deleted = 0;

    for (const change of this.changes) {
      uniqueFiles.add(change.filePath);

      switch (change.operation) {
        case 'create':
          created++;
          break;
        case 'modify':
          modified++;
          break;
        case 'delete':
          deleted++;
          break;
      }
    }

    return {
      totalChanges: this.changes.length,
      created,
      modified,
      deleted,
      files: Array.from(uniqueFiles).map((f) => path.relative(process.cwd(), f)),
    };
  }

  /**
   * Get recent changes for a file
   */
  getFileHistory(filePath: string, limit: number = 5): FileChange[] {
    const absolutePath = path.resolve(filePath);
    return this.changes.filter((c) => c.filePath === absolutePath).slice(-limit);
  }

  /**
   * Check if file was recently modified
   */
  wasRecentlyModified(filePath: string, withinMs: number = 60000): boolean {
    const absolutePath = path.resolve(filePath);
    const recentChange = this.changes.find(
      (c) => c.filePath === absolutePath && Date.now() - c.timestamp < withinMs
    );
    return !!recentChange;
  }

  /**
   * Get rollback points
   */
  getRollbackPoints(): RollbackPoint[] {
    return [...this.rollbackPoints];
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.snapshots.clear();
    this.changes = [];
    this.rollbackPoints = [];
    logger.info('[FileTracker] Cleared all tracking data');
  }

  /**
   * Export tracking data
   */
  export(): {
    changes: FileChange[];
    rollbackPoints: RollbackPoint[];
  } {
    return {
      changes: this.getChanges(),
      rollbackPoints: this.getRollbackPoints(),
    };
  }
}
