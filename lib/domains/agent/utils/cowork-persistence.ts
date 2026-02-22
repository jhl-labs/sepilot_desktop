/**
 * CoworkPersistence - Cowork 세션 영속성 유틸리티
 *
 * .cowork/{conversationId}/ 디렉토리에 세션 데이터를 저장하여
 * 중단된 Cowork 세션을 복원할 수 있도록 합니다.
 *
 * 저장 구조:
 * .cowork/{conversationId}/
 * ├── session.json          — 세션 메타데이터 (상태, 시작시간, 마지막 업데이트)
 * ├── plan.json             — CoworkPlan
 * └── task-results/
 *     ├── {taskId}.json     — 개별 태스크 결과
 *     └── ...
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { logger } from '@/lib/utils/logger';
import type { CoworkPlan } from '../types';

export interface CoworkSessionMeta {
  conversationId: string;
  status: 'planning' | 'executing' | 'synthesizing' | 'completed' | 'failed';
  startedAt: string;
  updatedAt: string;
  completedTaskIds: string[];
  failedTaskIds: string[];
  skippedTaskIds: string[];
}

/**
 * Cowork 세션의 기본 디렉토리 경로를 반환합니다.
 * workingDirectory가 있으면 그 안에 .cowork/ 생성, 없으면 userData 사용
 */
function getCoworkBaseDir(workingDirectory?: string): string {
  if (workingDirectory) {
    return path.join(workingDirectory, '.cowork');
  }
  // 폴백: 프로세스 CWD (Electron Main에서는 userData를 사용하지만,
  // agent 유틸은 Electron API에 의존하지 않으므로 CWD를 기본으로)
  return path.join(process.cwd(), '.cowork');
}

/**
 * Path Traversal 방지: ID에서 안전하지 않은 문자를 제거합니다.
 */
function sanitizeId(id: string): string {
  // 영문, 숫자, 하이픈, 언더스코어만 허용
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getSessionDir(conversationId: string, workingDirectory?: string): string {
  return path.join(getCoworkBaseDir(workingDirectory), sanitizeId(conversationId));
}

function getTaskResultsDir(conversationId: string, workingDirectory?: string): string {
  return path.join(getSessionDir(conversationId, workingDirectory), 'task-results');
}

/**
 * 세션 디렉토리를 생성합니다.
 */
async function ensureSessionDir(conversationId: string, workingDirectory?: string): Promise<void> {
  const taskResultsDir = getTaskResultsDir(conversationId, workingDirectory);
  await fs.mkdir(taskResultsDir, { recursive: true });
}

/**
 * 세션 메타데이터를 저장합니다.
 */
export async function saveSessionMeta(
  conversationId: string,
  meta: CoworkSessionMeta,
  workingDirectory?: string
): Promise<void> {
  try {
    await ensureSessionDir(conversationId, workingDirectory);
    const filePath = path.join(getSessionDir(conversationId, workingDirectory), 'session.json');
    await fs.writeFile(filePath, JSON.stringify(meta, null, 2), 'utf-8');
    logger.info(`[CoworkPersistence] Session meta saved: ${conversationId}`);
  } catch (error) {
    logger.error('[CoworkPersistence] Failed to save session meta:', error);
  }
}

/**
 * 세션 메타데이터를 로드합니다.
 */
export async function loadSessionMeta(
  conversationId: string,
  workingDirectory?: string
): Promise<CoworkSessionMeta | null> {
  try {
    const filePath = path.join(getSessionDir(conversationId, workingDirectory), 'session.json');
    if (!fsSync.existsSync(filePath)) {
      return null;
    }
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as CoworkSessionMeta;
  } catch (error) {
    logger.error('[CoworkPersistence] Failed to load session meta:', error);
    return null;
  }
}

/**
 * Cowork 계획을 저장합니다.
 */
export async function savePlan(
  conversationId: string,
  plan: CoworkPlan,
  workingDirectory?: string
): Promise<void> {
  try {
    await ensureSessionDir(conversationId, workingDirectory);
    const filePath = path.join(getSessionDir(conversationId, workingDirectory), 'plan.json');
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf-8');
    logger.info(`[CoworkPersistence] Plan saved: ${conversationId}`);
  } catch (error) {
    logger.error('[CoworkPersistence] Failed to save plan:', error);
  }
}

/**
 * Cowork 계획을 로드합니다.
 */
export async function loadPlan(
  conversationId: string,
  workingDirectory?: string
): Promise<CoworkPlan | null> {
  try {
    const filePath = path.join(getSessionDir(conversationId, workingDirectory), 'plan.json');
    if (!fsSync.existsSync(filePath)) {
      return null;
    }
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as CoworkPlan;
  } catch (error) {
    logger.error('[CoworkPersistence] Failed to load plan:', error);
    return null;
  }
}

/**
 * 개별 태스크 결과를 저장합니다.
 */
export async function saveTaskResult(
  conversationId: string,
  taskId: string,
  result: string,
  workingDirectory?: string
): Promise<void> {
  try {
    await ensureSessionDir(conversationId, workingDirectory);
    const filePath = path.join(
      getTaskResultsDir(conversationId, workingDirectory),
      `${sanitizeId(taskId)}.json`
    );
    await fs.writeFile(
      filePath,
      JSON.stringify({ taskId, result, savedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );
    logger.info(`[CoworkPersistence] Task result saved: ${taskId}`);
  } catch (error) {
    logger.error(`[CoworkPersistence] Failed to save task result ${taskId}:`, error);
  }
}

/**
 * 모든 태스크 결과를 로드합니다.
 */
export async function loadAllTaskResults(
  conversationId: string,
  workingDirectory?: string
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  try {
    const dir = getTaskResultsDir(conversationId, workingDirectory);
    if (!fsSync.existsSync(dir)) {
      return results;
    }
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      try {
        const data = await fs.readFile(path.join(dir, file), 'utf-8');
        const parsed = JSON.parse(data);
        if (parsed.taskId && parsed.result) {
          results[parsed.taskId] = parsed.result;
        }
      } catch {
        // 개별 파일 파싱 실패는 무시
      }
    }
    logger.info(
      `[CoworkPersistence] Loaded ${Object.keys(results).length} task results for ${conversationId}`
    );
  } catch (error) {
    logger.error('[CoworkPersistence] Failed to load task results:', error);
  }
  return results;
}

/**
 * 이전 세션이 존재하는지 확인하고, 복원 가능한 상태인지 반환합니다.
 */
export async function checkResumableSession(
  conversationId: string,
  workingDirectory?: string
): Promise<{
  resumable: boolean;
  meta: CoworkSessionMeta | null;
  plan: CoworkPlan | null;
  taskResults: Record<string, string>;
}> {
  const meta = await loadSessionMeta(conversationId, workingDirectory);
  if (!meta || meta.status === 'completed') {
    return { resumable: false, meta: null, plan: null, taskResults: {} };
  }

  const plan = await loadPlan(conversationId, workingDirectory);
  if (!plan) {
    return { resumable: false, meta, plan: null, taskResults: {} };
  }

  const taskResults = await loadAllTaskResults(conversationId, workingDirectory);
  return {
    resumable: true,
    meta,
    plan,
    taskResults,
  };
}

/**
 * 세션 디렉토리를 정리합니다 (성공적 완료 후 호출).
 */
export async function cleanupSession(
  conversationId: string,
  workingDirectory?: string
): Promise<void> {
  try {
    const sessionDir = getSessionDir(conversationId, workingDirectory);
    if (fsSync.existsSync(sessionDir)) {
      await fs.rm(sessionDir, { recursive: true, force: true });
      logger.info(`[CoworkPersistence] Session cleaned up: ${conversationId}`);
    }

    // .cowork 디렉토리가 비어있으면 삭제 (경쟁 조건 방지: 개별 try/catch)
    try {
      const baseDir = getCoworkBaseDir(workingDirectory);
      if (fsSync.existsSync(baseDir)) {
        const remaining = await fs.readdir(baseDir);
        if (remaining.length === 0) {
          await fs.rmdir(baseDir);
          logger.info('[CoworkPersistence] .cowork directory removed (empty)');
        }
      }
    } catch {
      // 다른 세션이 동시에 .cowork/에 파일을 생성한 경우 무시
    }
  } catch (error) {
    logger.error('[CoworkPersistence] Failed to cleanup session:', error);
  }
}
