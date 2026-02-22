/**
 * Auth 타입 정의
 */

/**
 * GitHub 사용자 정보
 */
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name?: string;
  email?: string;
  bio?: string;
}

/**
 * GitHub Repository 정보
 */
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string; // owner/repo format
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  description?: string;
}

/**
 * OAuth 토큰
 */
export interface OAuthToken {
  access_token: string;
  token_type: string;
  scope: string;
}

/**
 * GitHub App 인증 정보
 */
export interface GitHubAppAuth {
  installationId: string;
  token: string; // Installation access token
  expiresAt: string;
  repositories?: GitHubRepository[];
}

/**
 * 인증 상태
 */
export interface AuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  token: string | null;
}
