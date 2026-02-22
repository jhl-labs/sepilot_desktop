/**
 * Tool Selector for Coding Agent
 *
 * Provides smart tool selection and usage pattern analysis
 */

import { ToolCall } from '@/types';

export interface ToolUsageStats {
  toolName: string;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  lastUsed: number;
  errorPatterns: string[];
}

export interface ToolRecommendation {
  toolName: string;
  confidence: number; // 0-1
  reason: string;
  alternatives?: string[];
}

export class ToolSelector {
  private usageStats: Map<string, ToolUsageStats> = new Map();
  private readonly STATS_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Record tool usage result
   */
  recordUsage(toolName: string, success: boolean, durationMs: number, error?: string): void {
    const stats = this.usageStats.get(toolName) || {
      toolName,
      successCount: 0,
      failureCount: 0,
      avgDurationMs: 0,
      lastUsed: 0,
      errorPatterns: [],
    };

    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
      if (error && !stats.errorPatterns.includes(error)) {
        stats.errorPatterns.push(error);
      }
    }

    // Update average duration
    const totalCount = stats.successCount + stats.failureCount;
    stats.avgDurationMs = (stats.avgDurationMs * (totalCount - 1) + durationMs) / totalCount;

    stats.lastUsed = Date.now();
    this.usageStats.set(toolName, stats);

    // Clean up old stats
    this.cleanupOldStats();
  }

  /**
   * Get tool reliability score (0-1)
   */
  getReliabilityScore(toolName: string): number {
    const stats = this.usageStats.get(toolName);
    if (!stats) {
      return 0.5;
    } // Default neutral score

    const totalCount = stats.successCount + stats.failureCount;
    if (totalCount === 0) {
      return 0.5;
    }

    return stats.successCount / totalCount;
  }

  /**
   * Recommend best tool for a task
   */
  recommendTool(taskDescription: string, availableTools: string[]): ToolRecommendation | null {
    // Task type detection patterns
    const patterns = {
      file_search: /find|search|locate.*file/i,
      file_read: /read|view|check.*content|see.*file/i,
      file_write: /write|create|modify|update.*file/i,
      command_execute: /run|execute|build|test|install|compile/i,
      grep_search: /search.*content|find.*text|grep|pattern/i,
      git: /git|commit|push|pull|branch/i,
    };

    // Find matching tools
    const candidates: ToolRecommendation[] = [];

    for (const [toolType, pattern] of Object.entries(patterns)) {
      if (pattern.test(taskDescription)) {
        const matchingTools = availableTools.filter((t: any) => t.includes(toolType));

        for (const tool of matchingTools) {
          const reliability = this.getReliabilityScore(tool);

          candidates.push({
            toolName: tool,
            confidence: reliability,
            reason: `'${toolType}' 작업에 적합하며 신뢰도 ${(reliability * 100).toFixed(0)}%`,
          });
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by confidence and return best
    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];
    best.alternatives = candidates.slice(1, 3).map((c) => c.toolName);

    return best;
  }

  /**
   * Check if tool calls are redundant
   */
  detectRedundantCalls(toolCalls: ToolCall[]): {
    isRedundant: boolean;
    redundantCalls: ToolCall[];
    suggestion: string;
  } {
    const redundantCalls: ToolCall[] = [];
    const seen = new Set<string>();

    for (const call of toolCalls) {
      const signature = `${call.name}:${JSON.stringify(call.arguments)}`;

      if (seen.has(signature)) {
        redundantCalls.push(call);
      } else {
        seen.add(signature);
      }
    }

    return {
      isRedundant: redundantCalls.length > 0,
      redundantCalls,
      suggestion:
        redundantCalls.length > 0
          ? `⚠️ ${redundantCalls.length}개의 중복된 도구 호출이 감지되었습니다. 이전 결과를 재사용하세요.`
          : '',
    };
  }

  /**
   * Suggest tool optimization
   */
  suggestOptimization(toolCalls: ToolCall[]): string[] {
    const suggestions: string[] = [];

    // Check for sequential file operations that could be batched
    const fileOps = toolCalls.filter(
      (t) => t.name.includes('file_read') || t.name.includes('file_write')
    );

    if (fileOps.length > 5) {
      suggestions.push(`💡 ${fileOps.length}개의 파일 작업이 있습니다. 배치 처리를 고려하세요.`);
    }

    // Check for expensive operations
    for (const call of toolCalls) {
      const stats = this.usageStats.get(call.name);
      if (stats && stats.avgDurationMs > 30000) {
        suggestions.push(
          `⏱️ '${call.name}'은 평균 ${(stats.avgDurationMs / 1000).toFixed(1)}초가 걸립니다. 캐싱이나 대안을 고려하세요.`
        );
      }
    }

    // Check for high-failure tools
    for (const call of toolCalls) {
      const reliability = this.getReliabilityScore(call.name);
      if (reliability < 0.5) {
        suggestions.push(
          `⚠️ '${call.name}'의 성공률이 낮습니다 (${(reliability * 100).toFixed(0)}%). 대안을 고려하세요.`
        );
      }
    }

    return suggestions;
  }

  /**
   * Get usage statistics summary
   */
  getStatsSummary(): {
    totalTools: number;
    totalCalls: number;
    averageReliability: number;
    topTools: Array<{ name: string; calls: number; reliability: number }>;
  } {
    const allStats = Array.from(this.usageStats.values());
    const totalCalls = allStats.reduce((sum, s) => sum + s.successCount + s.failureCount, 0);
    const avgReliability =
      allStats.length > 0
        ? allStats.reduce((sum, s) => sum + this.getReliabilityScore(s.toolName), 0) /
          allStats.length
        : 0;

    const topTools = allStats
      .map((s) => ({
        name: s.toolName,
        calls: s.successCount + s.failureCount,
        reliability: this.getReliabilityScore(s.toolName),
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);

    return {
      totalTools: allStats.length,
      totalCalls,
      averageReliability: avgReliability,
      topTools,
    };
  }

  /**
   * Clean up old statistics
   */
  private cleanupOldStats(): void {
    const now = Date.now();
    for (const [toolName, stats] of this.usageStats.entries()) {
      if (now - stats.lastUsed > this.STATS_RETENTION_MS) {
        this.usageStats.delete(toolName);
      }
    }
  }

  /**
   * Export stats for persistence
   */
  exportStats(): Record<string, ToolUsageStats> {
    return Object.fromEntries(this.usageStats);
  }

  /**
   * Import stats from persistence
   */
  importStats(stats: Record<string, ToolUsageStats>): void {
    this.usageStats = new Map(Object.entries(stats));
    this.cleanupOldStats();
  }
}
