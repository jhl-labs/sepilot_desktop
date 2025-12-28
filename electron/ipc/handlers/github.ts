import { ipcMain, shell, safeStorage } from 'electron';
import { Octokit } from '@octokit/rest';
import * as crypto from 'crypto';
import { NetworkConfig } from '../../../types';
import { databaseService } from '../../services/database';
import { httpFetch, httpPost, getNetworkConfig, createOctokitAgent } from '@/lib/http';

// Private Key를 메모리에 캐싱 (프로세스 재시작 시 DB에서 로드)
let cachedPrivateKey: string | null = null;

/**
 * GitHub App IPC 핸들러
 * GHES 및 Network 설정 지원
 */
export function setupGitHubHandlers() {
  /**
   * Private Key 설정 (데이터베이스에 암호화 저장)
   */
  ipcMain.handle('github-set-private-key', async (_event, privateKey: string) => {
    try {
      // Private key 형식 검증
      if (!privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) {
        throw new Error('유효하지 않은 Private Key 형식입니다.');
      }

      // Electron safeStorage를 사용하여 암호화
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('safeStorage encryption not available, using fallback encryption');
        // Fallback: 사용자 정의 암호화 (하드코딩된 키 없이)
        const encrypted = encryptPrivateKey(privateKey);
        databaseService.updateSetting('github_private_key', encrypted);
      } else {
        // safeStorage 사용 (OS 레벨 암호화)
        const encryptedBuffer = safeStorage.encryptString(privateKey);
        const encryptedBase64 = encryptedBuffer.toString('base64');
        databaseService.updateSetting('github_private_key', encryptedBase64);
        databaseService.updateSetting('github_private_key_type', 'safeStorage');
      }

      // 메모리 캐시 업데이트
      cachedPrivateKey = privateKey;

      return { success: true };
    } catch (error: any) {
      console.error('Failed to set private key:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Private Key 존재 여부 확인
   */
  ipcMain.handle('github-has-private-key', async () => {
    try {
      const encrypted = databaseService.getSetting('github_private_key');
      return { success: true, data: !!encrypted };
    } catch (error: any) {
      console.error('Failed to check private key:', error);
      return { success: false, data: false };
    }
  });

  /**
   * Private Key 가져오기 (내부용)
   */
  function getPrivateKey(): string | null {
    // 메모리 캐시 확인
    if (cachedPrivateKey) {
      return cachedPrivateKey;
    }

    // 환경변수 확인 (개발용만 - production에서는 사용 안 됨)
    if (process.env.NODE_ENV === 'development' && process.env.GITHUB_APP_PRIVATE_KEY) {
      cachedPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
      return cachedPrivateKey;
    }

    // 데이터베이스에서 로드
    try {
      const encrypted = databaseService.getSetting('github_private_key');
      const encryptionType = databaseService.getSetting('github_private_key_type');

      if (encrypted) {
        if (encryptionType === 'safeStorage' && safeStorage.isEncryptionAvailable()) {
          // safeStorage로 복호화
          const encryptedBuffer = Buffer.from(encrypted, 'base64');
          cachedPrivateKey = safeStorage.decryptString(encryptedBuffer);
        } else {
          // Fallback 복호화
          cachedPrivateKey = decryptPrivateKey(encrypted);
        }
        return cachedPrivateKey;
      }
    } catch (error) {
      console.error('Failed to load private key from database:', error);
    }

    return null;
  }
  /**
   * GitHub App Installation의 레포지토리 목록 가져오기
   */
  ipcMain.handle(
    'github-get-repositories',
    async (
      _event,
      baseUrl: string,
      appId: string,
      installationId: string,
      networkConfig: NetworkConfig | null
    ) => {
      try {
        // GitHub App 설정에서 Private Key를 가져옴 (DB 또는 환경변수)
        const privateKey = getPrivateKey();
        if (!privateKey) {
          throw new Error('GitHub App Private Key가 설정되지 않았습니다.');
        }

        // JWT 생성 (GitHub App 인증)
        const jwt = generateJWT(appId, privateKey);

        // Installation Access Token 획득 (NetworkConfig 자동 적용)
        const tokenResponse = await httpPost(
          `${baseUrl}/api/v3/app/installations/${installationId}/access_tokens`,
          null,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            networkConfig,
          }
        );

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(
            `Installation Access Token 획득 실패: ${tokenResponse.status} ${errorText}`
          );
        }

        const tokenData = await tokenResponse.json();
        const installationToken = tokenData.token;

        // Octokit으로 레포지토리 목록 가져오기
        const requestOptions = await createOctokitAgent(networkConfig);
        const octokit = new Octokit({
          auth: installationToken,
          baseUrl: `${baseUrl}/api/v3`,
          request: requestOptions,
        });

        const { data } = await octokit.apps.listReposAccessibleToInstallation();

        const repositories = data.repositories.map((repo: any) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          owner: {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url,
          },
          description: repo.description,
        }));

        return {
          success: true,
          data: repositories,
        };
      } catch (error: any) {
        console.error('Failed to get repositories:', error);
        return {
          success: false,
          error: error.message || '레포지토리 목록을 가져오지 못했습니다.',
        };
      }
    }
  );

  /**
   * GitHub에서 설정 가져오기 (암호화된 데이터)
   */
  ipcMain.handle(
    'github-sync-from-github',
    async (
      _event,
      baseUrl: string,
      installationId: string,
      repo: string,
      masterPassword: string,
      networkConfig: NetworkConfig | null
    ) => {
      try {
        const privateKey = getPrivateKey();
        if (!privateKey) {
          throw new Error('GitHub App Private Key가 설정되지 않았습니다.');
        }

        // App ID는 config에서 가져옴
        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          throw new Error('GitHub App 설정이 완료되지 않았습니다.');
        }
        const appConfig = JSON.parse(configStr);
        const appId = appConfig.github?.appId;
        if (!appId) {
          throw new Error('GitHub App ID가 설정되지 않았습니다.');
        }

        const jwt = generateJWT(appId, privateKey);

        // Installation Access Token 획득 (NetworkConfig 자동 적용)
        const tokenResponse = await httpPost(
          `${baseUrl}/api/v3/app/installations/${installationId}/access_tokens`,
          null,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            networkConfig,
          }
        );

        if (!tokenResponse.ok) {
          throw new Error('Installation Access Token 획득 실패');
        }

        const tokenData = await tokenResponse.json();
        const installationToken = tokenData.token;

        // Octokit으로 파일 가져오기
        const requestOptions = await createOctokitAgent(networkConfig);
        const octokit = new Octokit({
          auth: installationToken,
          baseUrl: `${baseUrl}/api/v3`,
          request: requestOptions,
        });

        const [owner, repoName] = repo.split('/');

        // config.json.encrypted 파일 가져오기
        const { data } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: '.sepilot/config.json.encrypted',
        });

        if (!('content' in data)) {
          throw new Error('설정 파일을 찾을 수 없습니다.');
        }

        const encryptedContent = Buffer.from(data.content, 'base64').toString('utf-8');

        // 복호화
        const decryptedConfig = decryptConfig(encryptedContent, masterPassword);

        return {
          success: true,
          data: decryptedConfig,
        };
      } catch (error: any) {
        console.error('Failed to sync from GitHub:', error);
        return {
          success: false,
          error: error.message || 'GitHub에서 설정을 가져오지 못했습니다.',
        };
      }
    }
  );

  /**
   * GitHub에 설정 저장하기 (암호화)
   */
  ipcMain.handle(
    'github-sync-to-github',
    async (
      _event,
      baseUrl: string,
      installationId: string,
      repo: string,
      config: any,
      masterPassword: string,
      networkConfig: NetworkConfig | null
    ) => {
      try {
        const privateKey = getPrivateKey();
        if (!privateKey) {
          throw new Error('GitHub App Private Key가 설정되지 않았습니다.');
        }

        // App ID는 config에서 가져옴
        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          throw new Error('GitHub App 설정이 완료되지 않았습니다.');
        }
        const savedConfig = JSON.parse(configStr);
        const appId = savedConfig.github?.appId;
        if (!appId) {
          throw new Error('GitHub App ID가 설정되지 않았습니다.');
        }

        const jwt = generateJWT(appId, privateKey);

        // Installation Access Token 획득 (NetworkConfig 자동 적용)
        const tokenResponse = await httpPost(
          `${baseUrl}/api/v3/app/installations/${installationId}/access_tokens`,
          null,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            networkConfig,
          }
        );

        if (!tokenResponse.ok) {
          throw new Error('Installation Access Token 획득 실패');
        }

        const tokenData = await tokenResponse.json();
        const installationToken = tokenData.token;

        // Octokit으로 파일 저장
        const requestOptions = await createOctokitAgent(networkConfig);
        const octokit = new Octokit({
          auth: installationToken,
          baseUrl: `${baseUrl}/api/v3`,
          request: requestOptions,
        });

        const [owner, repoName] = repo.split('/');

        // 설정 암호화
        const encryptedContent = encryptConfig(config, masterPassword);

        // 기존 파일이 있는지 확인
        let sha: string | undefined;
        try {
          const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: '.sepilot/config.json.encrypted',
          });
          if ('sha' in existingFile) {
            sha = existingFile.sha;
          }
        } catch (error: any) {
          // 파일이 없으면 새로 생성
          console.log('기존 파일 없음, 새로 생성합니다.');
        }

        // 파일 저장 (생성 또는 업데이트)
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo: repoName,
          path: '.sepilot/config.json.encrypted',
          message: 'Update SEPilot configuration',
          content: Buffer.from(encryptedContent).toString('base64'),
          sha,
        });

        return {
          success: true,
        };
      } catch (error: any) {
        console.error('Failed to sync to GitHub:', error);
        return {
          success: false,
          error: error.message || 'GitHub에 설정을 저장하지 못했습니다.',
        };
      }
    }
  );

  /**
   * 외부 URL 열기
   * 보안: 허용된 프로토콜만 열 수 있도록 검증
   */
  ipcMain.handle('shell-open-external', async (_event, url: string) => {
    try {
      // URL 검증 - 허용된 프로토콜만 허용 (보안 강화)
      const allowedProtocols = ['http:', 'https:', 'mailto:'];
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(url);
      } catch {
        console.error('Invalid URL format:', url);
        return { success: false, error: '유효하지 않은 URL 형식입니다.' };
      }

      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        console.error('Blocked URL with disallowed protocol:', parsedUrl.protocol);
        return {
          success: false,
          error: `허용되지 않은 프로토콜입니다: ${parsedUrl.protocol}`,
        };
      }

      await shell.openExternal(url);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to open external URL:', error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * GitHub App용 JWT 생성
 */
function generateJWT(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // 발급 시간 (60초 전)
    exp: now + 600, // 만료 시간 (10분 후)
    iss: appId, // GitHub App ID
  };

  // JWT 헤더
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${encodedHeader}.${encodedPayload}`)
    .sign(privateKey, 'base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// createHttpAgent는 @/lib/http에서 import하여 사용

/**
 * 설정 암호화 (AES-256-GCM)
 */
function encryptConfig(config: any, masterPassword: string): string {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(masterPassword, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted,
  });
}

/**
 * 설정 복호화 (AES-256-GCM)
 */
function decryptConfig(encryptedData: string, masterPassword: string): any {
  const algorithm = 'aes-256-gcm';
  const data = JSON.parse(encryptedData);

  const salt = Buffer.from(data.salt, 'hex');
  const iv = Buffer.from(data.iv, 'hex');
  const authTag = Buffer.from(data.authTag, 'hex');
  const encrypted = data.encrypted;

  const key = crypto.pbkdf2Sync(masterPassword, salt, 100000, 32, 'sha256');

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Machine-specific 키 생성
 *
 * OS의 머신별 고유 정보를 사용하여 암호화 키 생성
 * 이 방법은 하드코딩된 키보다 안전하지만, safeStorage가 더 권장됨
 */
function getMachineKey(): Buffer {
  const os = require('os');

  // 머신별 고유 정보 조합
  const machineId = [os.hostname(), os.platform(), os.arch(), os.homedir()].join('|');

  // 고정 salt with machine ID
  const salt = crypto.createHash('sha256').update(`sepilot-v1-${machineId}`).digest();

  // PBKDF2로 키 파생
  return crypto.pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
}

/**
 * Private Key 암호화 (AES-256-GCM)
 *
 * Fallback 암호화 - safeStorage 사용 불가능한 경우에만 사용
 * Machine-specific 키를 사용하여 하드코딩된 키 문제 해결
 */
function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-gcm';
  const key = getMachineKey();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    version: '2', // 버전 추가 (마이그레이션 대비)
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted,
  });
}

/**
 * Private Key 복호화
 */
function decryptPrivateKey(encryptedData: string): string {
  const algorithm = 'aes-256-gcm';
  const data = JSON.parse(encryptedData);

  const key = getMachineKey();
  const iv = Buffer.from(data.iv, 'hex');
  const authTag = Buffer.from(data.authTag, 'hex');
  const encrypted = data.encrypted;

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
