/**
 * ConfigSync 테스트
 */

import { ConfigSync, configSync, AppConfig } from '@/lib/config/sync';

// Mock @octokit/rest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    users: {
      getAuthenticated: jest.fn(),
    },
    repos: {
      get: jest.fn(),
      createForAuthenticatedUser: jest.fn(),
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
      deleteFile: jest.fn(),
    },
  })),
}));

// Mock encryption
jest.mock('@/lib/config/encryption', () => ({
  encryptConfig: jest.fn((data: string) => Buffer.from(`encrypted:${data}`).toString('base64')),
  decryptConfig: jest.fn((data: string) => {
    const decoded = Buffer.from(data, 'base64').toString();
    if (decoded.startsWith('encrypted:')) {
      return decoded.substring(10);
    }
    throw new Error('Decryption failed');
  }),
}));

import { Octokit } from '@octokit/rest';

describe('ConfigSync', () => {
  let sync: ConfigSync;
  let mockOctokit: jest.Mocked<Octokit>;

  const testToken = 'ghp_test_token_12345';
  const testPassword = 'master-password';
  const testConfig: AppConfig = {
    llm: {
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
    },
    vectorDB: {
      type: 'sqlite-vec',
    },
    mcp: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sync = new ConfigSync();

    // Get the mocked Octokit instance
    mockOctokit = new (Octokit as jest.MockedClass<typeof Octokit>)() as jest.Mocked<Octokit>;
    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit);
  });

  describe('initialize', () => {
    it('should initialize with token and get user info', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });

      await sync.initialize(testToken);

      expect(Octokit).toHaveBeenCalledWith(expect.objectContaining({ auth: testToken }));
      expect(mockOctokit.users.getAuthenticated).toHaveBeenCalled();
    });
  });

  describe('repoExists', () => {
    it('should throw error if not initialized', async () => {
      await expect(sync.repoExists()).rejects.toThrow('Not initialized');
    });

    it('should return true if repo exists', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockResolvedValue({ data: {} });

      await sync.initialize(testToken);
      const exists = await sync.repoExists();

      expect(exists).toBe(true);
      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'sepilot-config',
      });
    });

    it('should return false if repo does not exist', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockRejectedValue({ status: 404 });

      await sync.initialize(testToken);
      const exists = await sync.repoExists();

      expect(exists).toBe(false);
    });
  });

  describe('createRepo', () => {
    it('should throw error if not initialized', async () => {
      await expect(sync.createRepo()).rejects.toThrow('Not initialized');
    });

    it('should create private repo', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.createForAuthenticatedUser as jest.Mock).mockResolvedValue({ data: {} });

      await sync.initialize(testToken);
      await sync.createRepo();

      expect(mockOctokit.repos.createForAuthenticatedUser).toHaveBeenCalledWith({
        name: 'sepilot-config',
        description: 'SEPilot Desktop configuration (encrypted)',
        private: true,
        auto_init: true,
      });
    });
  });

  describe('syncFromGitHub', () => {
    it('should throw error if not initialized', async () => {
      await expect(sync.syncFromGitHub(testPassword)).rejects.toThrow('Not initialized');
    });

    it('should return null if repo does not exist', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockRejectedValue({ status: 404 });

      await sync.initialize(testToken);
      const config = await sync.syncFromGitHub(testPassword);

      expect(config).toBeNull();
    });

    it('should decrypt and return config', async () => {
      const encryptedContent = Buffer.from(`encrypted:${JSON.stringify(testConfig)}`).toString(
        'base64'
      );

      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockResolvedValue({ data: {} });
      (mockOctokit.repos.getContent as jest.Mock).mockResolvedValue({
        data: { content: Buffer.from(encryptedContent).toString('base64') },
      });

      await sync.initialize(testToken);
      const config = await sync.syncFromGitHub(testPassword);

      expect(config).toEqual(testConfig);
    });

    it('should return null if config file does not exist', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockResolvedValue({ data: {} });
      (mockOctokit.repos.getContent as jest.Mock).mockRejectedValue({ status: 404 });

      await sync.initialize(testToken);
      const config = await sync.syncFromGitHub(testPassword);

      expect(config).toBeNull();
    });

    it('should throw error on other errors', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockResolvedValue({ data: {} });
      (mockOctokit.repos.getContent as jest.Mock).mockRejectedValue({ status: 500 });

      await sync.initialize(testToken);

      await expect(sync.syncFromGitHub(testPassword)).rejects.toEqual({ status: 500 });
    });
  });

  describe('syncToGitHub', () => {
    it('should throw error if not initialized', async () => {
      await expect(sync.syncToGitHub(testConfig, testPassword)).rejects.toThrow('Not initialized');
    });

    it('should create repo if it does not exist', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockRejectedValue({ status: 404 });
      (mockOctokit.repos.createForAuthenticatedUser as jest.Mock).mockResolvedValue({ data: {} });
      (mockOctokit.repos.getContent as jest.Mock).mockRejectedValue({ status: 404 });
      (mockOctokit.repos.createOrUpdateFileContents as jest.Mock).mockResolvedValue({ data: {} });

      await sync.initialize(testToken);
      await sync.syncToGitHub(testConfig, testPassword);

      expect(mockOctokit.repos.createForAuthenticatedUser).toHaveBeenCalled();
    });

    it('should update existing file', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockResolvedValue({ data: {} });
      (mockOctokit.repos.getContent as jest.Mock).mockResolvedValue({
        data: { sha: 'existing-sha-123' },
      });
      (mockOctokit.repos.createOrUpdateFileContents as jest.Mock).mockResolvedValue({ data: {} });

      await sync.initialize(testToken);
      await sync.syncToGitHub(testConfig, testPassword);

      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: 'existing-sha-123',
          message: 'Update SEPilot config',
        })
      );
    });

    it('should create new file if it does not exist', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.get as jest.Mock).mockResolvedValue({ data: {} });
      (mockOctokit.repos.getContent as jest.Mock).mockRejectedValue({ status: 404 });
      (mockOctokit.repos.createOrUpdateFileContents as jest.Mock).mockResolvedValue({ data: {} });

      await sync.initialize(testToken);
      await sync.syncToGitHub(testConfig, testPassword);

      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Initial SEPilot config',
        })
      );
    });
  });

  describe('deleteConfig', () => {
    it('should throw error if not initialized', async () => {
      await expect(sync.deleteConfig()).rejects.toThrow('Not initialized');
    });

    it('should delete existing file', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.getContent as jest.Mock).mockResolvedValue({
        data: { sha: 'file-sha-123' },
      });
      (mockOctokit.repos.deleteFile as jest.Mock).mockResolvedValue({ data: {} });

      await sync.initialize(testToken);
      await sync.deleteConfig();

      expect(mockOctokit.repos.deleteFile).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'sepilot-config',
        path: 'config.json',
        message: 'Delete SEPilot config',
        sha: 'file-sha-123',
      });
    });

    it('should not throw if file does not exist', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.getContent as jest.Mock).mockRejectedValue({ status: 404 });

      await sync.initialize(testToken);

      await expect(sync.deleteConfig()).resolves.not.toThrow();
    });

    it('should throw on other errors', async () => {
      (mockOctokit.users.getAuthenticated as jest.Mock).mockResolvedValue({
        data: { login: 'testuser' },
      });
      (mockOctokit.repos.getContent as jest.Mock).mockRejectedValue({ status: 500 });

      await sync.initialize(testToken);

      await expect(sync.deleteConfig()).rejects.toEqual({ status: 500 });
    });
  });

  describe('singleton', () => {
    it('should export singleton instance', () => {
      expect(configSync).toBeInstanceOf(ConfigSync);
    });
  });
});
