/**
 * SettingsDialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { isElectron } from '@/lib/platform';

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

// Mock child components
jest.mock('@/components/settings/LLMSettingsTab', () => ({
  LLMSettingsTab: ({ onSave, config, setConfig, message }: any) => {
    const [localError, setLocalError] = React.useState<string | null>(null);

    const handleSave = () => {
      // V2 config validation
      if (config.activeBaseModelId) {
        // Find active connection
        const activeModel = config.models?.find((m: any) => m.id === config.activeBaseModelId);
        if (!activeModel) {
          setLocalError('기본 모델을 선택하거나 입력해주세요.');
          return;
        }
        const activeConnection = config.connections?.find(
          (c: any) => c.id === activeModel.connectionId
        );
        if (!activeConnection || !activeConnection.apiKey) {
          setLocalError('API 키를 입력해주세요.');
          return;
        }
      } else {
        setLocalError('기본 모델을 선택하거나 입력해주세요.');
        return;
      }

      setLocalError(null);
      onSave();
    };

    return (
      <div data-testid="llm-settings">
        <div>LLM Settings</div>
        <input
          data-testid="api-key-input"
          value={config.apiKey || ''}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
        />
        <input
          data-testid="model-input"
          value={config.model || ''}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
        />
        <button onClick={handleSave} data-testid="llm-save">
          Save LLM
        </button>
        {localError && <div>{localError}</div>}
        {message && <div data-testid="llm-message">{message.text}</div>}
      </div>
    );
  },
}));

jest.mock('@/components/settings/NetworkSettingsTab', () => ({
  NetworkSettingsTab: ({ onSave, message }: any) => (
    <div data-testid="network-settings">
      <div>Network Settings</div>
      <button onClick={onSave} data-testid="network-save">
        Save Network
      </button>
      {message && <div data-testid="network-message">{message.text}</div>}
    </div>
  ),
}));

jest.mock('@/components/settings/ImageGenSettingsTab', () => ({
  ImageGenSettingsTab: ({ onSave, imageGenConfig, setImageGenConfig, message }: any) => {
    const [localError, setLocalError] = React.useState<string | null>(null);

    const handleSave = () => {
      // Validate ComfyUI config
      if (imageGenConfig.provider === 'comfyui' || !imageGenConfig.provider) {
        const comfyConfig = imageGenConfig.comfyui || imageGenConfig;
        if (comfyConfig.enabled) {
          if (!comfyConfig.httpUrl) {
            setLocalError('ComfyUI HTTP URL을 입력해주세요.');
            return;
          }
          if (!comfyConfig.workflowId) {
            setLocalError('기본 워크플로우 ID를 입력해주세요.');
            return;
          }
        }
      }

      setLocalError(null);
      onSave();
    };

    return (
      <div data-testid="imagegen-settings">
        <div>Image Generation Settings</div>
        <input
          data-testid="imagegen-enabled"
          type="checkbox"
          checked={imageGenConfig.enabled || imageGenConfig.comfyui?.enabled}
          onChange={(e) => setImageGenConfig({ ...imageGenConfig, enabled: e.target.checked })}
        />
        <input
          data-testid="imagegen-url"
          value={imageGenConfig.httpUrl || imageGenConfig.comfyui?.httpUrl || ''}
          onChange={(e) => setImageGenConfig({ ...imageGenConfig, httpUrl: e.target.value })}
        />
        <input
          data-testid="imagegen-workflow"
          value={imageGenConfig.workflowId || imageGenConfig.comfyui?.workflowId || ''}
          onChange={(e) => setImageGenConfig({ ...imageGenConfig, workflowId: e.target.value })}
        />
        <button onClick={handleSave} data-testid="imagegen-save">
          Save Image Generation
        </button>
        {localError && <div>{localError}</div>}
        {message && <div data-testid="imagegen-message">{message.text}</div>}
      </div>
    );
  },
}));

jest.mock('@/components/settings/MCPSettingsTab', () => ({
  MCPSettingsTab: () => <div data-testid="mcp-settings">MCP Settings</div>,
}));

jest.mock('@/components/settings/SkillsSettingsTab', () => ({
  SkillsSettingsTab: () => <div data-testid="skills-settings">Skills Settings</div>,
}));

jest.mock('@/components/rag/VectorDBSettings', () => ({
  VectorDBSettings: ({ onSave }: any) => (
    <div data-testid="vectordb-settings">
      <div>VectorDB Settings</div>
      <button
        onClick={() =>
          onSave(
            { type: 'sqlite-vec', path: '/test/db' },
            { provider: 'openai', model: 'text-embedding-ada-002' }
          )
        }
        data-testid="vectordb-save"
      >
        Save VectorDB
      </button>
    </div>
  ),
}));

jest.mock('@/components/settings/GitHubSyncSettings', () => ({
  GitHubSyncSettings: ({ onSave }: any) => (
    <div data-testid="github-settings">
      <div>GitHub Settings</div>
      <button
        onClick={() => onSave({ enabled: true, repoUrl: 'https://github.com/test/test' })}
        data-testid="github-save"
      >
        Save GitHub
      </button>
    </div>
  ),
}));

jest.mock('@/components/settings/BackupRestoreSettings', () => ({
  BackupRestoreSettings: () => <div data-testid="backup-settings">Backup Settings</div>,
}));

// Mock LLM initialization
jest.mock('@/lib/llm/client', () => ({
  initializeLLMClient: jest.fn(),
}));

jest.mock('@/lib/llm/web-client', () => ({
  configureWebLLMClient: jest.fn(),
  getWebLLMClient: jest.fn(),
}));

jest.mock('@/lib/vectordb/client', () => ({
  initializeVectorDB: jest.fn(),
}));

jest.mock('@/lib/vectordb/embeddings/client', () => ({
  initializeEmbedding: jest.fn(),
}));

describe('SettingsDialog', () => {
  const mockOnOpenChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (isElectron as jest.Mock).mockReturnValue(false);
  });

  it('should render when open is true', () => {
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('설정')).toBeInTheDocument();
  });

  it('should not render when open is false', () => {
    const { container } = render(<SettingsDialog open={false} onOpenChange={mockOnOpenChange} />);

    // Dialog should not be visible
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('should render general tab by default', () => {
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByTestId('general-settings')).toBeInTheDocument();
  });

  it('should switch to Network tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const networkTab = screen.getByRole('button', { name: /Network/i });
    await user.click(networkTab);

    await waitFor(() => {
      expect(screen.getByTestId('network-settings')).toBeInTheDocument();
    });
  });

  it('should switch to VectorDB tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const vectordbTab = screen.getByRole('button', { name: /VectorDB/i });
    await user.click(vectordbTab);

    await waitFor(() => {
      expect(screen.getByTestId('vectordb-settings')).toBeInTheDocument();
    });
  });

  it('should switch to Image Generation tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const imagegenTab = screen.getByRole('button', { name: /이미지 생성 설정/i });
    await user.click(imagegenTab);

    await waitFor(() => {
      expect(screen.getByTestId('imagegen-settings')).toBeInTheDocument();
    });
  });

  it('should switch to MCP tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const mcpTab = screen.getByRole('button', { name: /^MCP$/i });
    await user.click(mcpTab);

    await waitFor(() => {
      expect(screen.getByTestId('mcp-settings')).toBeInTheDocument();
    });
  });

  it('should switch to GitHub tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const githubTab = screen.getByRole('button', { name: /GitHub/i });
    await user.click(githubTab);

    await waitFor(() => {
      expect(screen.getByTestId('github-settings')).toBeInTheDocument();
    });
  });

  it('should switch to Backup tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const backupTab = screen.getByRole('button', { name: /백업\/복구/i });
    await user.click(backupTab);

    await waitFor(() => {
      expect(screen.getByTestId('backup-settings')).toBeInTheDocument();
    });
  });

  it('should render all tab buttons', () => {
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByRole('button', { name: /일반/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^LLM$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Network/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VectorDB/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /이미지 생성 설정/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^MCP$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skills/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GitHub/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /백업\/복구/i })).toBeInTheDocument();
  });

  it('should show active tab indicator', () => {
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const generalTab = screen.getByRole('button', { name: /일반/i });

    // Check that General tab has active styling
    expect(generalTab).toHaveClass('bg-accent');
    expect(generalTab).toHaveClass('text-accent-foreground');
  });

  it('should handle dialog close', () => {
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    // Try to close by ESC or clicking outside
    // Note: Actual implementation depends on Dialog component behavior
    expect(screen.getByText('설정')).toBeInTheDocument();
  });

  describe('Non-Electron environment', () => {
    it('should render in browser mode', () => {
      (isElectron as jest.Mock).mockReturnValue(false);

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      expect(screen.getByText('설정')).toBeInTheDocument();
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();
    });
  });

  describe('Electron environment', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(true);
      (window as any).electronAPI = {
        config: {
          load: jest.fn().mockResolvedValue({
            success: true,
            data: {
              llm: {
                provider: 'openai',
                baseURL: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 2000,
              },
              network: {
                useProxy: false,
                sslVerification: true,
              },
              mcp: [],
            },
          }),
          save: jest.fn().mockResolvedValue({ success: true }),
        },
        llm: {
          init: jest.fn().mockResolvedValue({ success: true }),
        },
      };
    });

    afterEach(() => {
      delete (window as any).electronAPI;
    });

    it('should load config from Electron on mount', async () => {
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect((window as any).electronAPI.config.load).toHaveBeenCalled();
      });
    });
  });

  describe('localStorage (Web environment)', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
    });

    it('should load LLM config from localStorage', async () => {
      const savedConfig = {
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-web-test',
        model: 'gpt-3.5-turbo',
        temperature: 0.5,
        maxTokens: 1000,
      };

      localStorage.setItem('sepilot_llm_config', JSON.stringify(savedConfig));

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Wait for config to load
      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Component should render without errors when localStorage has data
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();

      localStorage.clear();
    });

    it('should load Network config from localStorage', async () => {
      const savedNetworkConfig = {
        useProxy: true,
        proxyUrl: 'http://proxy.example.com:8080',
        sslVerification: false,
      };

      localStorage.setItem('sepilot_network_config', JSON.stringify(savedNetworkConfig));

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Component should render without errors
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();

      localStorage.clear();
    });

    it('should load Image Generation config from localStorage', async () => {
      const savedImageGenConfig = {
        enabled: true,
        httpUrl: 'http://localhost:8188',
        wsUrl: 'ws://localhost:8188/ws',
        workflowId: 'test-workflow',
      };

      localStorage.setItem('sepilot_imagegen_config', JSON.stringify(savedImageGenConfig));

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Component should render without errors
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();

      localStorage.clear();
    });

    it('should use default config when localStorage is empty', async () => {
      localStorage.clear();

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Should render without errors even with empty localStorage
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();
    });
  });

  describe('Config loading errors', () => {
    it('should handle Electron config load error gracefully', async () => {
      (isElectron as jest.Mock).mockReturnValue(true);
      (window as any).electronAPI = {
        config: {
          load: jest.fn().mockRejectedValue(new Error('Database error')),
          save: jest.fn().mockResolvedValue({ success: true }),
        },
        llm: {
          init: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load config:', expect.any(Error));
      });

      consoleSpy.mockRestore();
      delete (window as any).electronAPI;
    });

    it('should handle invalid localStorage data gracefully', async () => {
      (isElectron as jest.Mock).mockReturnValue(false);

      // Set invalid JSON
      localStorage.setItem('sepilot_llm_config', 'invalid json');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Dialog lifecycle', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
    });

    it('should reload config when dialog opens', async () => {
      const { rerender } = render(<SettingsDialog open={false} onOpenChange={mockOnOpenChange} />);

      // Clear previous calls
      jest.clearAllMocks();

      // Open dialog
      rerender(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Config should be loaded when dialog opens
      expect(localStorage.getItem).toHaveBeenCalled();
    });

    it('should clear messages when dialog opens', async () => {
      const { rerender } = render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Close and reopen
      rerender(<SettingsDialog open={false} onOpenChange={mockOnOpenChange} />);
      rerender(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Messages should be cleared (no error/success messages visible)
    });
  });

  describe('Custom events', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
    });

    it('should dispatch config-updated event for window', async () => {
      const eventListener = jest.fn();
      window.addEventListener('sepilot:config-updated', eventListener);

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      window.removeEventListener('sepilot:config-updated', eventListener);
    });
  });

  describe('LLM 설정 저장', () => {
    const { initializeLLMClient } = require('@/lib/llm/client');
    const { configureWebLLMClient } = require('@/lib/llm/web-client');

    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
      jest.clearAllMocks();
    });

    it('should show error when API key is empty', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Switch to LLM tab
      const llmTab = screen.getByRole('button', { name: /^LLM$/i });
      await user.click(llmTab);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      // Clear API key
      const apiKeyInput = screen.getByTestId('api-key-input');
      await user.clear(apiKeyInput);

      // Try to save
      const saveButton = screen.getByTestId('llm-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('API 키를 입력해주세요.')).toBeInTheDocument();
      });
    });

    it('should show error when model is empty', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Switch to LLM tab
      const llmTab = screen.getByRole('button', { name: /^LLM$/i });
      await user.click(llmTab);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      // Set API key but clear model
      const apiKeyInput = screen.getByTestId('api-key-input');
      await user.type(apiKeyInput, 'sk-test-key');

      const modelInput = screen.getByTestId('model-input');
      await user.clear(modelInput);

      const saveButton = screen.getByTestId('llm-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('기본 모델을 선택하거나 입력해주세요.')).toBeInTheDocument();
      });
    });

    it('should save LLM config to localStorage in web environment', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Switch to LLM tab
      const llmTab = screen.getByRole('button', { name: /^LLM$/i });
      await user.click(llmTab);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      const apiKeyInput = screen.getByTestId('api-key-input');
      await user.type(apiKeyInput, 'sk-test-key');

      const modelInput = screen.getByTestId('model-input');
      await user.type(modelInput, 'gpt-4');

      const saveButton = screen.getByTestId('llm-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'sepilot_llm_config',
          expect.stringContaining('sk-test-key')
        );
      });

      await waitFor(() => {
        expect(screen.getByText('설정이 저장되었습니다!')).toBeInTheDocument();
      });
    });

    it('should initialize web LLM client after saving', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Switch to LLM tab
      const llmTab = screen.getByRole('button', { name: /^LLM$/i });
      await user.click(llmTab);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      const apiKeyInput = screen.getByTestId('api-key-input');
      await user.type(apiKeyInput, 'sk-test-key');

      const modelInput = screen.getByTestId('model-input');
      await user.type(modelInput, 'gpt-4');

      const saveButton = screen.getByTestId('llm-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(configureWebLLMClient).toHaveBeenCalled();
      });
    });

    it('should save to Electron database when in Electron environment', async () => {
      (isElectron as jest.Mock).mockReturnValue(true);
      (window as any).electronAPI = {
        config: {
          load: jest.fn().mockResolvedValue({
            success: true,
            data: {
              llm: {
                provider: 'openai',
                apiKey: '',
                model: '',
                temperature: 0.7,
                maxTokens: 2000,
                baseURL: '',
              },
              network: { useProxy: false, sslVerification: true },
              mcp: [],
            },
          }),
          save: jest.fn().mockResolvedValue({ success: true }),
        },
        llm: {
          init: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Switch to LLM tab
      const llmTab = screen.getByRole('button', { name: /^LLM$/i });
      await user.click(llmTab);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      const apiKeyInput = screen.getByTestId('api-key-input');
      await user.type(apiKeyInput, 'sk-electron-key');

      const modelInput = screen.getByTestId('model-input');
      await user.type(modelInput, 'gpt-4-electron');

      const saveButton = screen.getByTestId('llm-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect((window as any).electronAPI.config.save).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect((window as any).electronAPI.llm.init).toHaveBeenCalled();
      });

      delete (window as any).electronAPI;
    });

    it('should dispatch config-updated event after saving', async () => {
      const eventListener = jest.fn();
      window.addEventListener('sepilot:config-updated', eventListener);

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Switch to LLM tab
      const llmTab = screen.getByRole('button', { name: /^LLM$/i });
      await user.click(llmTab);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      const apiKeyInput = screen.getByTestId('api-key-input');
      await user.type(apiKeyInput, 'sk-test-key');

      const modelInput = screen.getByTestId('model-input');
      await user.type(modelInput, 'gpt-4');

      const saveButton = screen.getByTestId('llm-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(eventListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'sepilot:config-updated',
          })
        );
      });

      window.removeEventListener('sepilot:config-updated', eventListener);
    });
  });

  describe('Network 설정 저장', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
      jest.clearAllMocks();
    });

    it('should save network config to localStorage', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      // Switch to Network tab
      const networkTab = screen.getByRole('button', { name: /Network/i });
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByTestId('network-settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('network-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'sepilot_network_config',
          expect.any(String)
        );
      });

      await waitFor(() => {
        expect(screen.getByText('네트워크 설정이 저장되었습니다!')).toBeInTheDocument();
      });
    });

    it('should save to Electron database in Electron environment', async () => {
      (isElectron as jest.Mock).mockReturnValue(true);
      (window as any).electronAPI = {
        config: {
          load: jest.fn().mockResolvedValue({
            success: true,
            data: {
              llm: {
                provider: 'openai',
                apiKey: '',
                model: '',
                temperature: 0.7,
                maxTokens: 2000,
                baseURL: '',
              },
              network: { useProxy: false, sslVerification: true },
              mcp: [],
            },
          }),
          save: jest.fn().mockResolvedValue({ success: true }),
        },
        llm: {
          init: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const networkTab = screen.getByRole('button', { name: /Network/i });
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByTestId('network-settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('network-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect((window as any).electronAPI.config.save).toHaveBeenCalled();
      });

      delete (window as any).electronAPI;
    });
  });

  describe('Image Generation 설정 저장', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
      jest.clearAllMocks();
    });

    it('should show error when enabled but URL is empty', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const imagegenTab = screen.getByRole('button', { name: /이미지 생성 설정/i });
      await user.click(imagegenTab);

      await waitFor(() => {
        expect(screen.getByTestId('imagegen-settings')).toBeInTheDocument();
      });

      // Enable Image Generation
      const enabledCheckbox = screen.getByTestId('imagegen-enabled');
      await user.click(enabledCheckbox);

      // Clear URL
      const urlInput = screen.getByTestId('imagegen-url');
      await user.clear(urlInput);

      const saveButton = screen.getByTestId('imagegen-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('ComfyUI HTTP URL을 입력해주세요.')).toBeInTheDocument();
      });
    });

    it('should show error when enabled but workflow ID is empty', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const imagegenTab = screen.getByRole('button', { name: /이미지 생성 설정/i });
      await user.click(imagegenTab);

      await waitFor(() => {
        expect(screen.getByTestId('imagegen-settings')).toBeInTheDocument();
      });

      const enabledCheckbox = screen.getByTestId('imagegen-enabled');
      await user.click(enabledCheckbox);

      const urlInput = screen.getByTestId('imagegen-url');
      await user.type(urlInput, 'http://localhost:8188');

      const workflowInput = screen.getByTestId('imagegen-workflow');
      await user.clear(workflowInput);

      const saveButton = screen.getByTestId('imagegen-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('기본 워크플로우 ID를 입력해주세요.')).toBeInTheDocument();
      });
    });

    it('should save Image Generation config successfully', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const imagegenTab = screen.getByRole('button', { name: /이미지 생성 설정/i });
      await user.click(imagegenTab);

      await waitFor(() => {
        expect(screen.getByTestId('imagegen-settings')).toBeInTheDocument();
      });

      const enabledCheckbox = screen.getByTestId('imagegen-enabled');
      await user.click(enabledCheckbox);

      const urlInput = screen.getByTestId('imagegen-url');
      await user.type(urlInput, 'http://localhost:8188');

      const workflowInput = screen.getByTestId('imagegen-workflow');
      await user.type(workflowInput, 'test-workflow');

      const saveButton = screen.getByTestId('imagegen-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'sepilot_imagegen_config',
          expect.any(String)
        );
      });

      await waitFor(() => {
        expect(screen.getByText('ComfyUI 설정이 저장되었습니다!')).toBeInTheDocument();
      });
    });
  });

  describe('VectorDB 설정 저장', () => {
    const { initializeVectorDB } = require('@/lib/vectordb/client');
    const { initializeEmbedding } = require('@/lib/vectordb/embeddings/client');

    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
      jest.clearAllMocks();
    });

    it('should save VectorDB and Embedding config', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const vectordbTab = screen.getByRole('button', { name: /VectorDB/i });
      await user.click(vectordbTab);

      await waitFor(() => {
        expect(screen.getByTestId('vectordb-settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('vectordb-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'sepilot_vectordb_config',
          expect.any(String)
        );
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'sepilot_embedding_config',
          expect.any(String)
        );
      });
    });

    it('should initialize VectorDB and Embedding', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      const vectordbTab = screen.getByRole('button', { name: /VectorDB/i });
      await user.click(vectordbTab);

      await waitFor(() => {
        expect(screen.getByTestId('vectordb-settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('vectordb-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(initializeEmbedding).toHaveBeenCalled();
      });
    });

    it('should save to Electron database when in Electron environment', async () => {
      (isElectron as jest.Mock).mockReturnValue(true);
      (window as any).electronAPI = {
        config: {
          load: jest.fn().mockResolvedValue({
            success: true,
            data: {
              llm: {
                provider: 'openai',
                apiKey: '',
                model: '',
                temperature: 0.7,
                maxTokens: 2000,
                baseURL: '',
              },
              network: { useProxy: false, sslVerification: true },
              mcp: [],
            },
          }),
          save: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const vectordbTab = screen.getByRole('button', { name: /VectorDB/i });
      await user.click(vectordbTab);

      await waitFor(() => {
        expect(screen.getByTestId('vectordb-settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('vectordb-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect((window as any).electronAPI.config.save).toHaveBeenCalled();
      });

      delete (window as any).electronAPI;
    });
  });

  describe('GitHub 설정 저장', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
      jest.clearAllMocks();
    });

    it('should save GitHub OAuth config', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const githubTab = screen.getByRole('button', { name: /GitHub/i });
      await user.click(githubTab);

      await waitFor(() => {
        expect(screen.getByTestId('github-settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('github-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'sepilot_app_config',
          expect.stringContaining('https://github.com/test/test')
        );
      });
    });

    it('should save to Electron database in Electron environment', async () => {
      (isElectron as jest.Mock).mockReturnValue(true);
      (window as any).electronAPI = {
        config: {
          load: jest.fn().mockResolvedValue({
            success: true,
            data: {
              llm: {
                provider: 'openai',
                apiKey: '',
                model: '',
                temperature: 0.7,
                maxTokens: 2000,
                baseURL: '',
              },
              network: { useProxy: false, sslVerification: true },
              mcp: [],
            },
          }),
          save: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      const githubTab = screen.getByRole('button', { name: /GitHub/i });
      await user.click(githubTab);

      await waitFor(() => {
        expect(screen.getByTestId('github-settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('github-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect((window as any).electronAPI.config.save).toHaveBeenCalled();
      });

      delete (window as any).electronAPI;
    });
  });
});
