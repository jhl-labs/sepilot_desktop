import type { AppConfig } from '@/types';
import { databaseService } from './database';
import { tokenManager } from './token-manager';

const APP_CONFIG_KEY = 'app_config';
const GITHUB_SYNC_TOKEN_KEY = 'github_sync_token';
const TEAM_DOCS_TOKEN_PREFIX = 'team_docs_token:';
const TEAM_DOCS_TOKEN_INDEX_KEY = 'team_docs_token_index';

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getTeamDocsTokenKey(teamDocsId: string): string {
  return `${TEAM_DOCS_TOKEN_PREFIX}${teamDocsId}`;
}

function parseTeamDocsTokenIndex(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    // ignore malformed index
  }
  return [];
}

export function loadRawAppConfig(): AppConfig | null {
  const configStr = databaseService.getSetting(APP_CONFIG_KEY);
  if (!configStr) {
    return null;
  }
  return JSON.parse(configStr) as AppConfig;
}

export async function loadAppConfig(options?: {
  includeTokens?: boolean;
}): Promise<AppConfig | null> {
  const includeTokens = options?.includeTokens ?? true;
  const raw = loadRawAppConfig();
  if (!raw) {
    return null;
  }

  const config = cloneConfig(raw);

  // Legacy migration: app_config에 평문으로 남아있는 token을 secure storage로 이동
  let migrationNeeded = false;
  const migratedRaw = cloneConfig(raw);

  if (migratedRaw.githubSync && typeof migratedRaw.githubSync.token === 'string') {
    const legacyToken = migratedRaw.githubSync.token.trim();
    if (legacyToken) {
      const secureToken = await tokenManager.getToken(GITHUB_SYNC_TOKEN_KEY);
      if (!secureToken) {
        await tokenManager.storeToken(GITHUB_SYNC_TOKEN_KEY, legacyToken);
      }
      migratedRaw.githubSync.token = '';
      migrationNeeded = true;
    }
  }

  if (Array.isArray(migratedRaw.teamDocs)) {
    for (const teamDocs of migratedRaw.teamDocs) {
      if (!teamDocs.id || typeof teamDocs.token !== 'string') {
        continue;
      }
      const legacyToken = teamDocs.token.trim();
      if (!legacyToken) {
        continue;
      }
      const tokenKey = getTeamDocsTokenKey(teamDocs.id);
      const secureToken = await tokenManager.getToken(tokenKey);
      if (!secureToken) {
        await tokenManager.storeToken(tokenKey, legacyToken);
      }
      teamDocs.token = '';
      migrationNeeded = true;
    }
  }

  if (migrationNeeded) {
    const teamDocIds = (migratedRaw.teamDocs || [])
      .map((td) => td.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    databaseService.setSetting(TEAM_DOCS_TOKEN_INDEX_KEY, JSON.stringify(teamDocIds));
    databaseService.setSetting(APP_CONFIG_KEY, JSON.stringify(migratedRaw));
  }

  if (config.githubSync) {
    const secureToken = await tokenManager.getToken(GITHUB_SYNC_TOKEN_KEY);
    const legacyToken =
      typeof config.githubSync.token === 'string' ? config.githubSync.token.trim() : '';
    config.githubSync.token = includeTokens ? secureToken || legacyToken || '' : '';
  }

  if (Array.isArray(config.teamDocs)) {
    for (const teamDocs of config.teamDocs) {
      const secureToken = await tokenManager.getToken(getTeamDocsTokenKey(teamDocs.id));
      const legacyToken = typeof teamDocs.token === 'string' ? teamDocs.token.trim() : '';
      teamDocs.token = includeTokens ? secureToken || legacyToken || '' : '';
    }
  }

  return config;
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  const sanitized = cloneConfig(config);

  // GitHub Sync token은 secure storage에 저장
  if (sanitized.githubSync) {
    if (typeof sanitized.githubSync.token === 'string') {
      const token = sanitized.githubSync.token.trim();
      if (token) {
        await tokenManager.storeToken(GITHUB_SYNC_TOKEN_KEY, token);
      } else {
        await tokenManager.deleteToken(GITHUB_SYNC_TOKEN_KEY);
      }
    }
    sanitized.githubSync.token = '';
  } else {
    await tokenManager.deleteToken(GITHUB_SYNC_TOKEN_KEY);
  }

  // Team Docs token도 secure storage에 저장
  const nextTokenIds: string[] = [];
  if (Array.isArray(sanitized.teamDocs)) {
    for (const teamDocs of sanitized.teamDocs) {
      if (!teamDocs.id) {
        continue;
      }
      nextTokenIds.push(teamDocs.id);
      if (typeof teamDocs.token === 'string') {
        const token = teamDocs.token.trim();
        const tokenKey = getTeamDocsTokenKey(teamDocs.id);
        if (token) {
          await tokenManager.storeToken(tokenKey, token);
        } else {
          await tokenManager.deleteToken(tokenKey);
        }
      }
      teamDocs.token = '';
    }
  }

  // 삭제된 Team Docs token 정리
  const prevTokenIds = parseTeamDocsTokenIndex(
    databaseService.getSetting(TEAM_DOCS_TOKEN_INDEX_KEY)
  );
  for (const prevId of prevTokenIds) {
    if (!nextTokenIds.includes(prevId)) {
      await tokenManager.deleteToken(getTeamDocsTokenKey(prevId));
    }
  }
  databaseService.setSetting(TEAM_DOCS_TOKEN_INDEX_KEY, JSON.stringify(nextTokenIds));

  databaseService.setSetting(APP_CONFIG_KEY, JSON.stringify(sanitized));
}
