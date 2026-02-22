/**
 * Skills IPC Handlers
 *
 * Renderer Process와 Main Process 간 Skills 관련 IPC 통신 핸들러
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { z } from 'zod';
import path from 'path';
import { pathToFileURL } from 'url';
import { parse as parseYaml } from 'yaml';
import type {
  SkillPackage,
  InstalledSkill,
  SkillUsageHistory,
  SkillStatistics,
  SkillValidationResult,
  SkillSource,
  SkillRegistryEntry,
  SkillUpdate,
} from '@/types/skill';
import type { IPCResponse } from '@/types/electron';
import { skillManager } from '@/lib/domains/skill/manager';
import { skillRegistry } from '@/lib/domains/skill/registry';
import { skillLoader } from '@/lib/domains/skill/loader';
import { githubIntegration } from '@/lib/domains/skill/github-integration';
import { compareVersions } from '@/lib/domains/skill/version-utils';

interface UserSkillsScanResult {
  scanned: number;
  deduplicated: number;
  imported: InstalledSkill[];
  failed: Array<{ path: string; error: string }>;
}

interface DiscoveredSkillCandidate {
  path: string;
  skillId: string;
  version: string;
  mtimeMs: number;
}

type SkillScanDedupeStrategy = 'version_then_mtime' | 'mtime_only' | 'first_seen';

interface SkillScanOptions {
  dedupeStrategy?: SkillScanDedupeStrategy;
  includeHiddenDirs?: boolean;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeLimit = Math.max(1, limit);
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) {
        return;
      }

      results[current] = await worker(items[current]);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Zod schemas for runtime validation
 */
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SkillIdSchema = z.string().min(1).regex(SKILL_ID_PATTERN, 'Invalid skill ID format');
const SkillSourceSchema = z.object({
  type: z.enum(['local', 'github', 'marketplace', 'builtin']),
  url: z.string().optional(),
  version: z.string().optional(),
  downloadedAt: z.number().optional(),
});

const USER_SKILLS_FOLDER_SETTING_KEY = 'skills_user_folder';
const MARKDOWN_SKILL_FILENAMES = ['SKILL.md', 'skill.md'] as const;

async function findMarkdownSkillPath(baseDir: string): Promise<string | null> {
  const fs = await import('fs/promises');
  const path = await import('path');

  for (const filename of MARKDOWN_SKILL_FILENAMES) {
    const candidate = path.join(baseDir, filename);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // noop
    }
  }

  return null;
}

function parseMarkdownSkill(
  rawMarkdown: string,
  fallbackName: string,
  sourceLabel = 'SKILL.md/skill.md'
): { manifestPartial: Partial<SkillPackage['manifest']>; content: SkillPackage['content'] } {
  const frontmatterMatch = rawMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatterRaw = frontmatterMatch?.[1];
  const body = frontmatterMatch
    ? rawMarkdown.slice(frontmatterMatch[0].length).trim()
    : rawMarkdown;

  let frontmatter: Record<string, unknown> = {};
  if (frontmatterRaw) {
    try {
      const parsed = parseYaml(frontmatterRaw);
      if (parsed && typeof parsed === 'object') {
        frontmatter = parsed as Record<string, unknown>;
      }
    } catch (error) {
      throw new Error(`Invalid ${sourceLabel} frontmatter: ${error}`);
    }
  }

  const knowledge = body
    ? [
        {
          title: `${fallbackName} Guide`,
          content: body,
        },
      ]
    : [];

  return {
    manifestPartial: {
      id: typeof frontmatter.id === 'string' ? frontmatter.id : undefined,
      name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
      version: typeof frontmatter.version === 'string' ? frontmatter.version : undefined,
      author: typeof frontmatter.author === 'string' ? frontmatter.author : undefined,
      description:
        typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
      category:
        typeof frontmatter.category === 'string'
          ? (frontmatter.category as SkillPackage['manifest']['category'])
          : undefined,
      tags: Array.isArray(frontmatter.tags)
        ? frontmatter.tags.filter((item): item is string => typeof item === 'string')
        : undefined,
      contextPatterns: Array.isArray(frontmatter.contextPatterns)
        ? frontmatter.contextPatterns.filter((item): item is string => typeof item === 'string')
        : undefined,
    },
    content: {
      systemPrompt:
        typeof frontmatter.systemPrompt === 'string' ? frontmatter.systemPrompt : undefined,
      knowledge,
    },
  };
}

function createDefaultManifest(
  manifestPartial: Partial<SkillPackage['manifest']>,
  fallbackId: string,
  fallbackName: string
): SkillPackage['manifest'] {
  return {
    id: manifestPartial.id ?? fallbackId,
    name: manifestPartial.name ?? fallbackName,
    version: manifestPartial.version ?? '1.0.0',
    author: manifestPartial.author ?? 'Local User',
    description: manifestPartial.description ?? `${fallbackName} skill`,
    category: manifestPartial.category ?? 'other',
    tags: manifestPartial.tags ?? [],
    contextPatterns: manifestPartial.contextPatterns,
  };
}

async function loadSkillPackageFromLocalPath(localPath: string): Promise<SkillPackage> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const resolvedPath = path.resolve(localPath);
  const stat = await fs.stat(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error('Local skill path must be a directory');
  }

  const manifestCandidates = ['manifest.json', 'skill.json'];
  let manifestPath: string | null = null;
  const markdownSkillPath = await findMarkdownSkillPath(resolvedPath);

  for (const candidate of manifestCandidates) {
    const candidatePath = path.join(resolvedPath, candidate);
    try {
      await fs.access(candidatePath);
      manifestPath = candidatePath;
      break;
    } catch {
      // noop
    }
  }

  const contentPath = path.join(resolvedPath, 'content.json');

  const hasMarkdownSkill = markdownSkillPath !== null;

  let manifest: SkillPackage['manifest'] | null = null;
  let content: SkillPackage['content'] | null = null;

  if (manifestPath) {
    try {
      const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestRaw);
    } catch (error) {
      throw new Error(`Invalid manifest JSON: ${error}`);
    }
  }

  const hasContentJson = await fs
    .access(contentPath)
    .then(() => true)
    .catch(() => false);

  if (hasContentJson) {
    try {
      const contentRaw = await fs.readFile(contentPath, 'utf-8');
      content = JSON.parse(contentRaw);
    } catch (error) {
      throw new Error(`Invalid content JSON: ${error}`);
    }
  }

  if (!content && hasMarkdownSkill) {
    if (!markdownSkillPath) {
      throw new Error('Internal error: Markdown skill path was not resolved');
    }
    const markdownRaw = await fs.readFile(markdownSkillPath, 'utf-8');
    const fallbackName = path.basename(resolvedPath);
    const parsedMarkdown = parseMarkdownSkill(
      markdownRaw,
      fallbackName,
      path.basename(markdownSkillPath)
    );

    manifest = manifest
      ? ({
          ...createDefaultManifest({}, fallbackName, fallbackName),
          ...parsedMarkdown.manifestPartial,
          ...manifest,
        } as SkillPackage['manifest'])
      : createDefaultManifest(parsedMarkdown.manifestPartial, fallbackName, fallbackName);
    content = parsedMarkdown.content;
  }

  if (!manifest || !content) {
    throw new Error(
      'Skill folder must contain (manifest.json|skill.json + content.json) or SKILL.md/skill.md'
    );
  }

  return {
    manifest,
    content,
    resources: await loadResourcesFromLocalPath(resolvedPath),
  };
}

async function resolveSkillCandidateFromFolder(
  localPath: string
): Promise<Pick<DiscoveredSkillCandidate, 'skillId' | 'version'>> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const manifestCandidates = ['manifest.json', 'skill.json'];
  for (const candidate of manifestCandidates) {
    const manifestPath = path.join(localPath, candidate);
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as { id?: string; version?: string };
      if (parsed.id && typeof parsed.id === 'string') {
        return {
          skillId: parsed.id,
          version: typeof parsed.version === 'string' ? parsed.version : '0.0.0',
        };
      }
    } catch {
      // ignore and try next
    }
  }

  const markdownSkillPath = await findMarkdownSkillPath(localPath);
  if (!markdownSkillPath) {
    throw new Error('Cannot resolve skill id from manifest.json/skill.json/SKILL.md/skill.md');
  }

  try {
    const raw = await fs.readFile(markdownSkillPath, 'utf-8');
    const fallbackName = path.basename(localPath);
    const parsed = parseMarkdownSkill(raw, fallbackName, path.basename(markdownSkillPath));
    const manifest = createDefaultManifest(parsed.manifestPartial, fallbackName, fallbackName);

    return {
      skillId: manifest.id,
      version: manifest.version,
    };
  } catch (error) {
    throw new Error(
      `Cannot resolve skill id from manifest.json/skill.json/SKILL.md/skill.md: ${String(error)}`
    );
  }
}

async function discoverSkillCandidates(
  rootFolder: string,
  options?: { includeHiddenDirs?: boolean }
): Promise<string[]> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const candidates: string[] = [];
  const queue = [rootFolder];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const resolvedCurrent = path.resolve(current);
    if (visited.has(resolvedCurrent)) {
      continue;
    }
    visited.add(resolvedCurrent);

    const manifestPath = path.join(resolvedCurrent, 'manifest.json');
    const skillPath = path.join(resolvedCurrent, 'skill.json');
    const contentPath = path.join(resolvedCurrent, 'content.json');
    const markdownSkillPath = await findMarkdownSkillPath(resolvedCurrent);

    const checks = await Promise.all([
      fs
        .access(manifestPath)
        .then(() => true)
        .catch(() => false),
      fs
        .access(skillPath)
        .then(() => true)
        .catch(() => false),
      fs
        .access(contentPath)
        .then(() => true)
        .catch(() => false),
      Promise.resolve(markdownSkillPath !== null),
    ]);

    if (((checks[0] || checks[1]) && checks[2]) || checks[3]) {
      candidates.push(resolvedCurrent);
      continue;
    }

    let entries: import('fs').Dirent[] = [];
    try {
      entries = await fs.readdir(resolvedCurrent, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (!(options?.includeHiddenDirs ?? false) && entry.name.startsWith('.')) {
        continue;
      }

      queue.push(path.join(resolvedCurrent, entry.name));
    }
  }

  return candidates;
}

function toFileUrl(localPath: string): string {
  return pathToFileURL(path.resolve(localPath)).toString();
}

async function loadResourcesFromLocalPath(skillDir: string): Promise<SkillPackage['resources']> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const resourcesDir = path.join(skillDir, 'resources');
  try {
    const stat = await fs.stat(resourcesDir);
    if (!stat.isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const files: NonNullable<SkillPackage['resources']>['files'] = [];
  const images: NonNullable<SkillPackage['resources']>['images'] = [];
  const imageNameUsage = new Map<string, number>();

  const textExtensions = new Set([
    '.txt',
    '.md',
    '.markdown',
    '.json',
    '.yaml',
    '.yml',
    '.xml',
    '.csv',
    '.ini',
    '.toml',
    '.conf',
    '.cfg',
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.java',
    '.go',
    '.rs',
    '.sh',
    '.sql',
    '.html',
    '.css',
    '.scss',
  ]);

  const createImageName = (relativeImagePath: string): string => {
    const flattened = relativeImagePath
      .replace(/^images\//, '')
      .replace(/[\\/]/g, '__')
      .replace(/\s+/g, '_');

    const usage = imageNameUsage.get(flattened) ?? 0;
    imageNameUsage.set(flattened, usage + 1);

    if (usage === 0) {
      return flattened;
    }

    const ext = path.extname(flattened);
    const base = ext ? flattened.slice(0, -ext.length) : flattened;
    return `${base}__${usage + 1}${ext}`;
  };

  async function readDirectory(currentDir: string, relativeBase = ''): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.posix.join(relativeBase, entry.name);

      if (entry.isDirectory()) {
        await readDirectory(fullPath, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (relativePath.startsWith('images/')) {
        const buffer = await fs.readFile(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.webp'
                  ? 'image/webp'
                  : 'application/octet-stream';

        images.push({
          name: createImageName(relativePath),
          base64: buffer.toString('base64'),
          mimeType,
        });
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext && !textExtensions.has(ext)) {
          throw new Error(
            `Unsupported binary resource file outside resources/images: ${relativePath}. Move binary files under resources/images.`
          );
        }

        // Determine file type based on extension
        const fileType: 'code' | 'document' | 'data' | 'image' = (() => {
          const codeExts = [
            '.js',
            '.ts',
            '.jsx',
            '.tsx',
            '.py',
            '.java',
            '.go',
            '.rs',
            '.sh',
            '.sql',
          ];
          const dataExts = [
            '.json',
            '.yaml',
            '.yml',
            '.xml',
            '.csv',
            '.toml',
            '.ini',
            '.conf',
            '.cfg',
          ];
          if (codeExts.includes(ext)) return 'code';
          if (dataExts.includes(ext)) return 'data';
          return 'document';
        })();

        files.push({
          path: relativePath,
          content: await fs.readFile(fullPath, 'utf-8'),
          type: fileType,
        });
      }
    }
  }

  await readDirectory(resourcesDir);

  if (files.length === 0 && images.length === 0) {
    return undefined;
  }

  return {
    files: files.length > 0 ? files : undefined,
    images: images.length > 0 ? images : undefined,
  };
}

async function installOrUpdateLocalSkillFromPath(localPath: string): Promise<InstalledSkill> {
  const skillPackage = await loadSkillPackageFromLocalPath(localPath);
  const source: SkillSource = {
    type: 'local',
    url: toFileUrl(localPath),
    downloadedAt: Date.now(),
  };

  const existing = await skillRegistry.getSkill(skillPackage.manifest.id);
  if (existing) {
    if (existing.source.type === 'builtin') {
      throw new Error('Builtin skills cannot be overridden from local folder');
    }

    return skillRegistry.updateSkill(skillPackage, {
      trustLevel: 'untrusted',
      sourceOverride: source,
    });
  }

  return skillRegistry.installSkill(skillPackage, source, {
    trustLevel: 'untrusted',
  });
}

/**
 * Load builtin skills from builtin-skills directory
 */
async function loadBuiltinSkills(): Promise<void> {
  console.log('[Skills] Loading builtin skills...');

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { app } = await import('electron');

    // builtin-skills 디렉토리 경로
    const builtinSkillsDir = path.join(app.getAppPath(), 'builtin-skills');

    // 디렉토리 존재 확인
    try {
      await fs.access(builtinSkillsDir);
    } catch {
      console.log('[Skills] No builtin-skills directory found, skipping...');
      return;
    }

    // 디렉토리 내 모든 스킬 폴더 스캔
    const entries = await fs.readdir(builtinSkillsDir, { withFileTypes: true });
    const skillDirs = entries.filter((entry) => entry.isDirectory());

    console.log(`[Skills] Found ${skillDirs.length} builtin skill(s)`);

    // 각 스킬 로드 및 설치
    for (const dir of skillDirs) {
      const skillDir = path.join(builtinSkillsDir, dir.name);

      try {
        // skill.json (manifest) 읽기
        const manifestPath = path.join(skillDir, 'skill.json');
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        // content.json 읽기
        const contentPath = path.join(skillDir, 'content.json');
        const contentContent = await fs.readFile(contentPath, 'utf-8');
        const content = JSON.parse(contentContent);

        // SkillPackage 생성
        const skillPackage: SkillPackage = {
          manifest,
          content,
          resources: undefined, // builtin skills는 리소스 없음
        };

        // Source 정의
        const source: SkillSource = {
          type: 'builtin',
          url: `builtin://${manifest.id}`,
        };

        // 이미 설치되어 있는지 확인
        const existingSkill = await skillRegistry.getSkill(manifest.id);

        if (existingSkill) {
          // 버전 체크 - 버전이 다르면 업데이트
          if (existingSkill.manifest.version !== manifest.version) {
            console.log(
              `[Skills] Updating builtin skill: ${manifest.name} (${existingSkill.manifest.version} → ${manifest.version})`
            );
            await skillRegistry.updateSkill(skillPackage, { trustLevel: 'trusted' });
          } else {
            console.log(`[Skills] Builtin skill already installed: ${manifest.name}`);
          }
        } else {
          // 새로 설치
          console.log(`[Skills] Installing builtin skill: ${manifest.name}`);
          await skillRegistry.installSkill(skillPackage, source, { trustLevel: 'trusted' });
        }
      } catch (error) {
        console.error(`[Skills] Failed to load builtin skill from ${dir.name}:`, error);
      }
    }

    console.log('[Skills] Builtin skills loaded successfully');
  } catch (error) {
    console.error('[Skills] Failed to load builtin skills:', error);
    // builtin skills 로드 실패는 전체 초기화를 막지 않음
  }
}

/**
 * Initialize Skills system on app startup
 */
export async function initializeSkills(): Promise<void> {
  console.log('[Skills] Initializing Skills system...');

  try {
    // Skill Storage 초기화
    const { skillStorageService } = await import('@/electron/services/skill-storage');
    await skillStorageService.initialize();

    // Skill Manager 초기화 (manifests 로드)
    await skillManager.initialize();

    // Builtin Skills 자동 로드
    await loadBuiltinSkills();

    console.log('[Skills] Skills system initialized successfully');
  } catch (error) {
    console.error('[Skills] Failed to initialize Skills system:', error);
    throw error;
  }
}

/**
 * Register Skills IPC handlers
 */
export function registerSkillsHandlers(): void {
  console.log('[IPC] Registering Skills handlers...');

  /**
   * 설치된 스킬 목록 조회
   */
  ipcMain.handle('skills:get-installed', async (): Promise<IPCResponse<InstalledSkill[]>> => {
    try {
      const skills = await skillRegistry.getInstalledSkills();
      return { success: true, data: skills };
    } catch (error) {
      console.error('[IPC] skills:get-installed error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 활성화된 스킬만 조회
   */
  ipcMain.handle('skills:get-enabled', async (): Promise<IPCResponse<InstalledSkill[]>> => {
    try {
      const skills = await skillRegistry.getEnabledSkills();
      return { success: true, data: skills };
    } catch (error) {
      console.error('[IPC] skills:get-enabled error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 특정 스킬 조회
   */
  ipcMain.handle(
    'skills:get-skill',
    async (_, skillId: string): Promise<IPCResponse<InstalledSkill | null>> => {
      try {
        SkillIdSchema.parse(skillId);
        const skill = await skillRegistry.getSkill(skillId);
        return { success: true, data: skill };
      } catch (error) {
        console.error('[IPC] skills:get-skill error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 설치
   */
  ipcMain.handle(
    'skills:install',
    async (
      _,
      skillPackage: SkillPackage,
      source: SkillSource
    ): Promise<IPCResponse<InstalledSkill>> => {
      try {
        // 검증
        SkillSourceSchema.parse(source);
        if (source.type === 'builtin') {
          return {
            success: false,
            error: 'source.type "builtin" is reserved for internal installation only',
          };
        }

        // 설치
        const installedSkill = await skillRegistry.installSkill(skillPackage, source, {
          trustLevel: 'untrusted',
        });
        return { success: true, data: installedSkill };
      } catch (error) {
        console.error('[IPC] skills:install error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 로컬 경로(폴더)에서 스킬 설치/업데이트
   */
  const installFromLocalHandler = async (
    _: unknown,
    localPath: string
  ): Promise<IPCResponse<InstalledSkill>> => {
    try {
      if (!localPath || typeof localPath !== 'string') {
        throw new Error('Invalid local skill path');
      }

      const installedSkill = await installOrUpdateLocalSkillFromPath(localPath);
      return { success: true, data: installedSkill };
    } catch (error) {
      console.error('[IPC] skills:install-from-local error:', error);
      return { success: false, error: String(error) };
    }
  };

  ipcMain.handle('skills:install-from-local', installFromLocalHandler);
  // Backward compatibility for old preload channel name
  ipcMain.handle('skills:install-from-local-folder', installFromLocalHandler);

  ipcMain.handle(
    'skills:set-user-skills-folder',
    async (_, folderPath: string): Promise<IPCResponse> => {
      try {
        if (!folderPath || typeof folderPath !== 'string') {
          return { success: false, error: 'Invalid folder path' };
        }

        const fs = await import('fs/promises');
        const path = await import('path');
        const resolvedPath = path.resolve(folderPath);
        const stat = await fs.stat(resolvedPath);
        if (!stat.isDirectory()) {
          return { success: false, error: 'Selected path is not a directory' };
        }

        const { databaseService } = await import('@/electron/services/database');
        databaseService.setSetting(USER_SKILLS_FOLDER_SETTING_KEY, JSON.stringify(resolvedPath));
        return { success: true };
      } catch (error) {
        console.error('[IPC] skills:set-user-skills-folder error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('skills:get-user-skills-folder', async (): Promise<IPCResponse<string | null>> => {
    try {
      const { databaseService } = await import('@/electron/services/database');
      const value = databaseService.getSetting(USER_SKILLS_FOLDER_SETTING_KEY);
      if (!value) {
        return { success: true, data: null };
      }

      return { success: true, data: JSON.parse(value) };
    } catch (error) {
      console.error('[IPC] skills:get-user-skills-folder error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'skills:scan-user-skills-folder',
    async (_, options?: SkillScanOptions): Promise<IPCResponse<UserSkillsScanResult>> => {
      try {
        const { databaseService } = await import('@/electron/services/database');
        const raw = databaseService.getSetting(USER_SKILLS_FOLDER_SETTING_KEY);
        if (!raw) {
          return { success: false, error: 'User skills folder is not configured' };
        }

        const rootFolder = JSON.parse(raw) as string;
        const dedupeStrategy: SkillScanDedupeStrategy =
          options?.dedupeStrategy ?? 'version_then_mtime';
        const includeHiddenDirs = options?.includeHiddenDirs ?? false;
        const fs = await import('fs/promises');
        const candidates = (
          await discoverSkillCandidates(rootFolder, {
            includeHiddenDirs,
          })
        ).sort((a, b) => a.localeCompare(b));

        const dedupedBySkillId = new Map<string, DiscoveredSkillCandidate>();
        const dedupeFailures: Array<{ path: string; error: string }> = [];

        const discoveredResults = await runWithConcurrency(candidates, 8, async (candidate) => {
          try {
            const resolved = await resolveSkillCandidateFromFolder(candidate);
            const stat = await fs.stat(candidate);

            return {
              ok: true as const,
              value: {
                path: candidate,
                skillId: resolved.skillId,
                version: resolved.version,
                mtimeMs: stat.mtimeMs,
              } as DiscoveredSkillCandidate,
            };
          } catch (error) {
            return {
              ok: false as const,
              path: candidate,
              error: `Failed to resolve skill id: ${String(error)}`,
            };
          }
        });

        for (const result of discoveredResults) {
          if (!result.ok) {
            dedupeFailures.push({ path: result.path, error: result.error });
            continue;
          }

          const discovered = result.value;
          const existing = dedupedBySkillId.get(discovered.skillId);
          if (existing) {
            const versionCmp = compareVersions(discovered.version, existing.version);
            const shouldReplace =
              dedupeStrategy === 'first_seen'
                ? false
                : dedupeStrategy === 'mtime_only'
                  ? discovered.mtimeMs > existing.mtimeMs
                  : versionCmp > 0 || (versionCmp === 0 && discovered.mtimeMs > existing.mtimeMs);

            if (shouldReplace) {
              dedupeFailures.push({
                path: existing.path,
                error: `Duplicate skill id '${existing.skillId}' skipped (strategy=${dedupeStrategy}, selected: ${discovered.path})`,
              });
              dedupedBySkillId.set(discovered.skillId, discovered);
            } else {
              dedupeFailures.push({
                path: discovered.path,
                error: `Duplicate skill id '${discovered.skillId}' skipped (strategy=${dedupeStrategy}, selected: ${existing.path})`,
              });
            }
            continue;
          }

          dedupedBySkillId.set(discovered.skillId, discovered);
        }

        const installResults = await runWithConcurrency(
          Array.from(dedupedBySkillId.values()),
          4,
          async (discovered) => {
            try {
              const result = await installOrUpdateLocalSkillFromPath(discovered.path);
              return { ok: true as const, value: result };
            } catch (error) {
              console.error(
                '[IPC] Failed to import local skill from folder:',
                discovered.path,
                error
              );
              return {
                ok: false as const,
                path: discovered.path,
                error: String(error),
              };
            }
          }
        );

        const installed: InstalledSkill[] = [];
        const failed: Array<{ path: string; error: string }> = [];
        for (const result of installResults) {
          if (result.ok) {
            installed.push(result.value);
          } else {
            failed.push({ path: result.path, error: result.error });
          }
        }

        return {
          success: true,
          data: {
            scanned: candidates.length,
            deduplicated: dedupedBySkillId.size,
            imported: installed,
            failed: [...dedupeFailures, ...failed],
          },
        };
      } catch (error) {
        console.error('[IPC] skills:scan-user-skills-folder error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('skills:select-folder', async (): Promise<IPCResponse<string | null>> => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) {
        return { success: false, error: 'No focused window found' };
      }

      const result = await dialog.showOpenDialog(focusedWindow, {
        title: '스킬 폴더 선택',
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null };
      }

      return { success: true, data: result.filePaths[0] };
    } catch (error) {
      console.error('[IPC] skills:select-folder error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스킬 제거
   */
  ipcMain.handle('skills:remove', async (_, skillId: string): Promise<IPCResponse> => {
    try {
      SkillIdSchema.parse(skillId);
      await skillRegistry.removeSkill(skillId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] skills:remove error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스킬 활성화/비활성화
   */
  ipcMain.handle(
    'skills:toggle',
    async (_, skillId: string, enabled: boolean): Promise<IPCResponse> => {
      try {
        SkillIdSchema.parse(skillId);

        if (enabled) {
          await skillRegistry.enableSkill(skillId);
        } else {
          await skillRegistry.disableSkill(skillId);
        }

        return { success: true };
      } catch (error) {
        console.error('[IPC] skills:toggle error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 로드 (Lazy loading)
   */
  ipcMain.handle(
    'skills:load-skill',
    async (_, skillId: string): Promise<IPCResponse<SkillPackage>> => {
      try {
        SkillIdSchema.parse(skillId);

        // SkillManager를 통해 로드
        const loadedSkill = await skillManager.loadSkill(skillId);

        // LoadedSkill을 SkillPackage로 변환
        const skillPackage: SkillPackage = {
          manifest: loadedSkill.package.manifest,
          content: loadedSkill.package.content,
          resources: loadedSkill.package.resources,
        };

        return { success: true, data: skillPackage };
      } catch (error) {
        console.error('[IPC] skills:load-skill error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 사용 이력 업데이트
   */
  ipcMain.handle('skills:update-usage', async (_, skillId: string): Promise<IPCResponse> => {
    try {
      SkillIdSchema.parse(skillId);

      // 임시로 conversationId는 'unknown'으로 설정
      // Phase 3에서 LangGraph 통합 시 실제 conversationId 전달
      await skillRegistry.recordUsage(skillId, 'unknown');

      return { success: true };
    } catch (error) {
      console.error('[IPC] skills:update-usage error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스킬 통계 조회
   */
  ipcMain.handle(
    'skills:get-statistics',
    async (_, skillId: string): Promise<IPCResponse<SkillStatistics | null>> => {
      try {
        SkillIdSchema.parse(skillId);
        const stats = await skillRegistry.getStatistics(skillId);
        return { success: true, data: stats };
      } catch (error) {
        console.error('[IPC] skills:get-statistics error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 사용 이력 조회
   */
  ipcMain.handle(
    'skills:get-usage-history',
    async (_, skillId: string, limit = 100): Promise<IPCResponse<SkillUsageHistory[]>> => {
      try {
        SkillIdSchema.parse(skillId);
        const history = await skillRegistry.getUsageHistory(skillId, limit);
        return { success: true, data: history };
      } catch (error) {
        console.error('[IPC] skills:get-usage-history error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 패키지 검증
   */
  ipcMain.handle(
    'skills:validate',
    async (_, skillPackage: SkillPackage): Promise<IPCResponse<SkillValidationResult>> => {
      try {
        // SkillLoader를 사용하여 검증
        // 임시로 파일에 저장하지 않고 메모리에서 검증
        skillLoader['validateManifest'](skillPackage.manifest);
        skillLoader['validateContent'](skillPackage);

        const depCheck = await skillLoader['checkDependencies'](skillPackage.manifest);
        const compatible = await skillLoader['checkCompatibility'](skillPackage.manifest);

        const result: SkillValidationResult = {
          valid: depCheck.valid && compatible,
          errors: depCheck.errors,
          warnings: [],
          missingDependencies: {
            mcpServers: depCheck.missingMCPServers,
            extensions: depCheck.missingExtensions,
          },
        };

        if (!compatible) {
          result.warnings.push(
            `Requires app version ${skillPackage.manifest.minAppVersion} or higher`
          );
        }

        return { success: true, data: result };
      } catch (error) {
        console.error('[IPC] skills:validate error:', error);

        const result: SkillValidationResult = {
          valid: false,
          errors: [String(error)],
          warnings: [],
          missingDependencies: {
            mcpServers: [],
            extensions: [],
          },
        };

        return { success: true, data: result };
      }
    }
  );

  /**
   * Phase 2: GitHub 마켓플레이스에서 스킬 레지스트리 가져오기
   */
  ipcMain.handle(
    'skills:fetch-marketplace',
    async (): Promise<IPCResponse<SkillRegistryEntry[]>> => {
      try {
        const registry = await githubIntegration.fetchSkillsRegistry();
        return { success: true, data: registry };
      } catch (error) {
        console.error('[IPC] skills:fetch-marketplace error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Phase 2: 스킬 검색
   */
  ipcMain.handle(
    'skills:search-skills',
    async (_, query: string, filters: any): Promise<IPCResponse<SkillRegistryEntry[]>> => {
      try {
        const results = await githubIntegration.searchSkills(query, filters);
        return { success: true, data: results };
      } catch (error) {
        console.error('[IPC] skills:search-skills error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Phase 2: GitHub 마켓플레이스에서 스킬 다운로드 및 설치
   */
  ipcMain.handle(
    'skills:download-from-marketplace',
    async (_, skillPath: string): Promise<IPCResponse<InstalledSkill>> => {
      try {
        // GitHub에서 스킬 다운로드
        const skillPackage = await githubIntegration.downloadSkill(skillPath);

        // 스킬 설치
        const source: SkillSource = {
          type: 'marketplace',
          url: `https://github.com/sepilot/awesome-sepilot-skills/tree/main/${skillPath}`,
          downloadedAt: Date.now(),
        };

        const installedSkill = await skillRegistry.installSkill(skillPackage, source, {
          trustLevel: 'untrusted',
        });

        return { success: true, data: installedSkill };
      } catch (error) {
        console.error('[IPC] skills:download-from-marketplace error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Phase 2: 스킬 업데이트 확인
   */
  ipcMain.handle('skills:check-updates', async (): Promise<IPCResponse<SkillUpdate[]>> => {
    try {
      // 설치된 스킬 목록 가져오기
      const installedSkills = await skillRegistry.getInstalledSkills();

      // 마켓플레이스 출처만 체크
      const marketplaceSkills = installedSkills
        .filter((skill) => skill.source.type === 'marketplace')
        .map((skill) => ({
          id: skill.id,
          version: skill.manifest.version,
        }));

      // 업데이트 확인
      const updates = await githubIntegration.checkForUpdates(marketplaceSkills);

      return { success: true, data: updates };
    } catch (error) {
      console.error('[IPC] skills:check-updates error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Phase 2: 스킬 업데이트
   */
  ipcMain.handle(
    'skills:update-skill',
    async (_, skillId: string): Promise<IPCResponse<InstalledSkill>> => {
      try {
        // 기존 스킬 정보 가져오기
        const existingSkill = await skillRegistry.getSkill(skillId);
        if (!existingSkill) {
          return { success: false, error: `Skill not found: ${skillId}` };
        }

        // 마켓플레이스 출처인지 확인
        if (existingSkill.source.type !== 'marketplace' || !existingSkill.source.url) {
          return { success: false, error: 'Skill is not from marketplace' };
        }

        // GitHub 경로 추출 (URL에서)
        const skillPath = existingSkill.source.url.split('/tree/main/')[1];
        if (!skillPath) {
          return { success: false, error: 'Invalid marketplace skill URL' };
        }

        // GitHub에서 최신 버전 다운로드
        const skillPackage = await githubIntegration.downloadSkill(skillPath);

        // 스킬 업데이트
        const updatedSkill = await skillRegistry.updateSkill(skillPackage, {
          trustLevel: 'untrusted',
        });

        return { success: true, data: updatedSkill };
      } catch (error) {
        console.error('[IPC] skills:update-skill error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  console.log('[IPC] Skills handlers registered successfully');
}
