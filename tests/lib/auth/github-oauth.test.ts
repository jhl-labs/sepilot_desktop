/**
 * GitHubOAuth 테스트
 */

import { GitHubOAuth, githubOAuth } from '@/lib/domains/auth/github-oauth';
import {
  enableElectronMode,
  disableElectronMode,
  mockElectronAPI,
  mockSessionStorage,
} from '../../setup';

// Mock btoa if not available
if (typeof global.btoa === 'undefined') {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

// Setup crypto.subtle.digest mock
const mockDigest = jest.fn(async (_algorithm: string, _data: BufferSource) => {
  // Return a fake 32-byte hash
  return new Uint8Array(32).fill(1).buffer;
});

beforeAll(() => {
  // Ensure crypto.subtle.digest is properly mocked
  Object.defineProperty(window.crypto.subtle, 'digest', {
    value: mockDigest,
    writable: true,
    configurable: true,
  });
});

describe('GitHubOAuth', () => {
  let oauth: GitHubOAuth;

  beforeEach(() => {
    jest.clearAllMocks();
    oauth = new GitHubOAuth();
  });

  describe('initiateLogin', () => {
    it('should generate OAuth URL with PKCE parameters', async () => {
      const url = await oauth.initiateLogin();

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=');
      expect(url).toContain('redirect_uri=sepilot%3A%2F%2Fauth%2Fcallback');
      expect(url).toContain('scope=repo+read%3Auser');
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('should store code verifier in sessionStorage', async () => {
      await oauth.initiateLogin();

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        'oauth_code_verifier',
        expect.any(String)
      );
    });

    it('should generate code verifier using crypto', async () => {
      await oauth.initiateLogin();

      expect(window.crypto.getRandomValues).toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    beforeEach(() => {
      enableElectronMode();
    });

    it('should exchange code for token via Electron IPC', async () => {
      mockSessionStorage.getItem.mockReturnValue('test-verifier');
      mockElectronAPI.auth.exchangeCode.mockResolvedValue({
        success: true,
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          scope: 'repo read:user',
        },
      });

      const token = await oauth.handleCallback('test-code');

      expect(mockElectronAPI.auth.exchangeCode).toHaveBeenCalledWith('test-code', 'test-verifier');
      expect(token.access_token).toBe('test-token');
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('oauth_code_verifier');
    });

    it('should throw error when token exchange fails', async () => {
      mockSessionStorage.getItem.mockReturnValue('test-verifier');
      mockElectronAPI.auth.exchangeCode.mockResolvedValue({
        success: false,
        error: 'Invalid code',
      });

      await expect(oauth.handleCallback('invalid-code')).rejects.toThrow('Invalid code');
    });

    it('should throw error when Electron API is not available', async () => {
      disableElectronMode();

      await expect(oauth.handleCallback('test-code')).rejects.toThrow('Electron API not available');
    });
  });

  describe('getUserInfo', () => {
    beforeEach(() => {
      enableElectronMode();
    });

    it('should get user info via Electron IPC', async () => {
      mockElectronAPI.auth.getUserInfo.mockResolvedValue({
        success: true,
        data: {
          login: 'testuser',
          id: 12345,
          avatar_url: 'https://avatars.githubusercontent.com/u/12345',
          name: 'Test User',
          email: 'test@example.com',
        },
      });

      const user = await oauth.getUserInfo('test-token');

      expect(mockElectronAPI.auth.getUserInfo).toHaveBeenCalledWith('test-token');
      expect(user.login).toBe('testuser');
      expect(user.id).toBe(12345);
    });

    it('should throw error when getting user info fails', async () => {
      mockElectronAPI.auth.getUserInfo.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      await expect(oauth.getUserInfo('invalid-token')).rejects.toThrow('Invalid token');
    });

    it('should throw error when Electron API is not available', async () => {
      disableElectronMode();

      await expect(oauth.getUserInfo('test-token')).rejects.toThrow('Electron API not available');
    });
  });

  describe('logout', () => {
    it('should call Electron IPC logout', async () => {
      enableElectronMode();
      mockElectronAPI.auth.logout.mockResolvedValue({ success: true });

      await oauth.logout();

      expect(mockElectronAPI.auth.logout).toHaveBeenCalled();
    });

    it('should not throw when Electron API is not available', async () => {
      disableElectronMode();

      await expect(oauth.logout()).resolves.not.toThrow();
    });
  });

  describe('singleton', () => {
    it('should export singleton instance', () => {
      expect(githubOAuth).toBeInstanceOf(GitHubOAuth);
    });
  });
});
