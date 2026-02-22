import { ipcMain, shell } from 'electron';
import { Octokit } from '@octokit/rest';
import { tokenManager } from '../../../services/token-manager';
import { httpFetch, getNetworkConfig, createOctokitAgent, safeJsonParse } from '@/lib/http';

/**
 * Auth IPC 핸들러
 */
export function setupAuthHandlers() {
  /**
   * GitHub 로그인 시작
   */
  ipcMain.handle('auth-initiate-login', async () => {
    try {
      const { githubOAuth } = await import('@/lib/domains/auth/github-oauth');
      const authUrl = await githubOAuth.initiateLogin();
      await shell.openExternal(authUrl);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to initiate GitHub login:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * OAuth 코드를 토큰으로 교환
   */
  ipcMain.handle('auth-exchange-code', async (_event, code: string, codeVerifier: string) => {
    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        throw new Error('GITHUB_CLIENT_ID is not configured.');
      }

      const networkConfig = await getNetworkConfig();
      const response = await httpFetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          code,
          code_verifier: codeVerifier,
          redirect_uri: process.env.GITHUB_REDIRECT_URI,
        }),
        networkConfig: networkConfig ?? undefined,
        timeout: 30000,
      });

      const data = await safeJsonParse<any>(
        response,
        'https://github.com/login/oauth/access_token'
      );

      if (!response.ok) {
        throw new Error(
          `Failed to exchange code: ${data.error_description || response.statusText}`
        );
      }

      if (data.error) {
        throw new Error(data.error_description || 'Unknown error during token exchange');
      }

      // 토큰 저장
      await tokenManager.storeToken('github_token', data.access_token);

      return {
        success: true,
        data: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
          scope: data.scope,
          token_type: data.token_type,
        },
      };
    } catch (error: any) {
      console.error('Failed to exchange code:', error);
      return {
        success: false,
        error: error.message || 'Failed to exchange code for token',
      };
    }
  });

  /**
   * 사용자 정보 가져오기
   */
  ipcMain.handle('auth-get-user-info', async (_event, token: string) => {
    try {
      const networkConfig = await getNetworkConfig();
      const agent = await createOctokitAgent(networkConfig);
      const octokit = new Octokit({
        auth: token,
        request: agent ? { agent } : undefined,
      });

      const { data } = await octokit.users.getAuthenticated();

      return {
        success: true,
        data: {
          login: data.login,
          id: data.id,
          avatar_url: data.avatar_url,
          name: data.name,
          email: data.email,
          bio: data.bio,
        },
      };
    } catch (error: any) {
      console.error('Failed to get user info:', error);
      return {
        success: false,
        error: error.message || 'Failed to get user info',
      };
    }
  });

  /**
   * 저장된 토큰 가져오기
   */
  ipcMain.handle('auth-get-token', async () => {
    try {
      const token = await tokenManager.getToken('github_token');

      return {
        success: true,
        data: token,
      };
    } catch (error: any) {
      console.error('Failed to get token:', error);
      return {
        success: false,
        error: error.message || 'Failed to get token',
      };
    }
  });

  /**
   * 로그아웃
   */
  ipcMain.handle('auth-logout', async () => {
    try {
      await tokenManager.deleteToken('github_token');

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('Failed to logout:', error);
      return {
        success: false,
        error: error.message || 'Failed to logout',
      };
    }
  });

  /**
   * Config 동기화 (GitHub에서 가져오기)
   */
  ipcMain.handle('auth-sync-from-github', async (_event, token: string, masterPassword: string) => {
    try {
      const { ConfigSync } = await import('@/lib/domains/config/sync');
      const configSync = new ConfigSync();
      await configSync.initialize(token);
      const config = await configSync.syncFromGitHub(masterPassword);
      return { success: true, data: config };
    } catch (error: any) {
      console.error('Failed to sync from GitHub:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Config 동기화 (GitHub에 저장)
   */
  ipcMain.handle(
    'auth-sync-to-github',
    async (_event, token: string, config: any, masterPassword: string) => {
      try {
        const { ConfigSync } = await import('@/lib/domains/config/sync');
        const configSync = new ConfigSync();
        await configSync.initialize(token);
        await configSync.syncToGitHub(config, masterPassword);
        return { success: true };
      } catch (error: any) {
        console.error('Failed to sync to GitHub:', error);
        return { success: false, error: error.message };
      }
    }
  );
}
