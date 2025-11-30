/* eslint-disable no-undef */
import { OAuthToken, GitHubUser } from './types';

/**
 * GitHub OAuth 클라이언트
 *
 * PKCE (Proof Key for Code Exchange) 플로우 사용
 */
export class GitHubOAuth {
  private clientId: string;
  private redirectUri: string;
  private scope: string;

  constructor() {
    // TODO: 환경 변수 또는 설정에서 가져오기
    this.clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '';
    this.redirectUri = 'sepilot://auth/callback';
    this.scope = 'repo read:user';
  }

  /**
   * PKCE Code Verifier 생성
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(array);
    } else if (typeof crypto !== 'undefined') {
      crypto.getRandomValues(array);
    }
    return this.base64URLEncode(array);
  }

  /**
   * PKCE Code Challenge 생성
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : crypto;
    const hash = await cryptoObj.subtle.digest('SHA-256', data);
    return this.base64URLEncode(new Uint8Array(hash));
  }

  /**
   * Base64 URL 인코딩
   */
  private base64URLEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * OAuth 로그인 시작
   */
  async initiateLogin(): Promise<string> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Code Verifier 저장 (나중에 토큰 교환 시 필요)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    }

    // GitHub OAuth URL 생성
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * OAuth 콜백 처리
   */
  async handleCallback(code: string): Promise<OAuthToken> {
    // Code Verifier 가져오기
    let codeVerifier = '';
    if (typeof window !== 'undefined') {
      codeVerifier = window.sessionStorage.getItem('oauth_code_verifier') || '';
      window.sessionStorage.removeItem('oauth_code_verifier');
    }

    // 토큰 교환 (Renderer에서는 IPC 통해 Main Process에서 처리)
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.auth.exchangeCode(
        code,
        codeVerifier,
      );
      if (result.success && result.data) {
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to exchange code for token');
      }
    }

    throw new Error('Electron API not available');
  }

  /**
   * 사용자 정보 가져오기
   */
  async getUserInfo(token: string): Promise<GitHubUser> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.auth.getUserInfo(token);
      if (result.success && result.data) {
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to get user info');
      }
    }

    throw new Error('Electron API not available');
  }

  /**
   * 로그아웃
   */
  async logout(): Promise<void> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.auth.logout();
    }
  }
}

// Singleton
export const githubOAuth = new GitHubOAuth();
