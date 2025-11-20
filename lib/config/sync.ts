import { Octokit } from '@octokit/rest';
import { encryptConfig, decryptConfig } from './encryption';

/**
 * 앱 설정 인터페이스
 */
export interface AppConfig {
  llm: any;
  vectorDB?: any;
  mcp?: any[];
  preferences?: any;
}

/**
 * Config Sync 클라이언트
 *
 * GitHub private repository를 사용하여 설정 동기화
 */
export class ConfigSync {
  private octokit: Octokit | null = null;
  private username: string = '';
  private repoName: string = 'sepilot-config';
  private configPath: string = 'config.json';

  /**
   * 초기화
   */
  async initialize(token: string): Promise<void> {
    this.octokit = new Octokit({ auth: token });

    // 사용자 정보 가져오기
    const { data } = await this.octokit.users.getAuthenticated();
    this.username = data.login;

    // console.log(`Config sync initialized for user: ${this.username}`);
  }

  /**
   * Config 저장소 존재 여부 확인
   */
  async repoExists(): Promise<boolean> {
    if (!this.octokit) {
      throw new Error('Not initialized');
    }

    try {
      await this.octokit.repos.get({
        owner: this.username,
        repo: this.repoName,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Config 저장소 생성
   */
  async createRepo(): Promise<void> {
    if (!this.octokit) {
      throw new Error('Not initialized');
    }

    await this.octokit.repos.createForAuthenticatedUser({
      name: this.repoName,
      description: 'SEPilot Desktop configuration (encrypted)',
      private: true,
      auto_init: true,
    });

    // console.log(`Created config repository: ${this.repoName}`);
  }

  /**
   * GitHub에서 설정 읽기
   */
  async syncFromGitHub(masterPassword: string): Promise<AppConfig | null> {
    if (!this.octokit) {throw new Error('Not initialized');}

    try {
      // 저장소 확인
      if (!(await this.repoExists())) {
        return null;
      }

      // config.json 읽기
      const { data } = await this.octokit.repos.getContent({
        owner: this.username,
        repo: this.repoName,
        path: this.configPath,
      });

      if ('content' in data) {
        // Base64 디코딩
        const encrypted = Buffer.from(data.content, 'base64').toString();

        // 복호화
        const decrypted = decryptConfig(encrypted, masterPassword);

        // JSON 파싱
        return JSON.parse(decrypted);
      }

      return null;
    } catch (error: any) {
      if (error.status === 404) {
        // 파일이 없으면 null 반환
        return null;
      }
      throw error;
    }
  }

  /**
   * GitHub에 설정 쓰기
   */
  async syncToGitHub(config: AppConfig, masterPassword: string): Promise<void> {
    if (!this.octokit) {throw new Error('Not initialized');}

    // 저장소 확인 및 생성
    if (!(await this.repoExists())) {
      await this.createRepo();
    }

    // JSON 직렬화
    const json = JSON.stringify(config, null, 2);

    // 암호화
    const encrypted = encryptConfig(json, masterPassword);

    // Base64 인코딩
    const content = Buffer.from(encrypted).toString('base64');

    try {
      // 기존 파일 확인
      const { data: existing } = await this.octokit.repos.getContent({
        owner: this.username,
        repo: this.repoName,
        path: this.configPath,
      });

      // 파일 업데이트
      if ('sha' in existing) {
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.username,
          repo: this.repoName,
          path: this.configPath,
          message: 'Update SEPilot config',
          content,
          sha: existing.sha,
        });
      }
    } catch (error: any) {
      if (error.status === 404) {
        // 파일이 없으면 새로 생성
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.username,
          repo: this.repoName,
          path: this.configPath,
          message: 'Initial SEPilot config',
          content,
        });
      } else {
        throw error;
      }
    }

    // console.log('Config synced to GitHub');
  }

  /**
   * 설정 삭제
   */
  async deleteConfig(): Promise<void> {
    if (!this.octokit) {throw new Error('Not initialized');}

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.username,
        repo: this.repoName,
        path: this.configPath,
      });

      if ('sha' in data) {
        await this.octokit.repos.deleteFile({
          owner: this.username,
          repo: this.repoName,
          path: this.configPath,
          message: 'Delete SEPilot config',
          sha: data.sha,
        });
      }

      // console.log('Config deleted from GitHub');
    } catch (error: any) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }
}

// Singleton
export const configSync = new ConfigSync();
