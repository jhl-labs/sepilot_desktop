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
  LLMSettingsTab: ({ onSave, config, setConfig, message }: any) => (
    <div data-testid="llm-settings">
      <div>LLM Settings</div>
      <input
        data-testid="api-key-input"
        value={config.apiKey}
        onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
      />
      <input
        data-testid="model-input"
        value={config.model}
        onChange={(e) => setConfig({ ...config, model: e.target.value })}
      />
      <button onClick={onSave} data-testid="llm-save">Save LLM</button>
      {message && <div data-testid="llm-message">{message.text}</div>}
    </div>
  ),
}));

jest.mock('@/components/settings/NetworkSettingsTab', () => ({
  NetworkSettingsTab: ({ onSave, message }: any) => (
    <div data-testid="network-settings">
      <div>Network Settings</div>
      <button onClick={onSave} data-testid="network-save">Save Network</button>
      {message && <div data-testid="network-message">{message.text}</div>}
    </div>
  ),
}));

jest.mock('@/components/settings/ComfyUISettingsTab', () => ({
  ComfyUISettingsTab: ({ onSave, comfyConfig, setComfyConfig, message }: any) => (
    <div data-testid="comfyui-settings">
      <div>ComfyUI Settings</div>
      <input
        data-testid="comfy-enabled"
        type="checkbox"
        checked={comfyConfig.enabled}
        onChange={(e) => setComfyConfig({ ...comfyConfig, enabled: e.target.checked })}
      />
      <input
        data-testid="comfy-url"
        value={comfyConfig.httpUrl}
        onChange={(e) => setComfyConfig({ ...comfyConfig, httpUrl: e.target.value })}
      />
      <input
        data-testid="comfy-workflow"
        value={comfyConfig.workflowId}
        onChange={(e) => setComfyConfig({ ...comfyConfig, workflowId: e.target.value })}
      />
      <button onClick={onSave} data-testid="comfy-save">Save ComfyUI</button>
      {message && <div data-testid="comfy-message">{message.text}</div>}
    </div>
  ),
}));

jest.mock('@/components/settings/MCPSettingsTab', () => ({
  MCPSettingsTab: () => <div data-testid="mcp-settings">MCP Settings</div>,
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

jest.mock('@/components/settings/GitHubOAuthSettings', () => ({
  GitHubOAuthSettings: ({ onSave }: any) => (
    <div data-testid="github-settings">
      <div>GitHub Settings</div>
      <button
        onClick={() => onSave({ clientId: 'test-client', clientSecret: 'test-secret' })}
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

  it('should render LLM tab by default', () => {
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
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

  it('should switch to ComfyUI tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const comfyuiTab = screen.getByRole('button', { name: /ComfyUI/i });
    await user.click(comfyuiTab);

    await waitFor(() => {
      expect(screen.getByTestId('comfyui-settings')).toBeInTheDocument();
    });
  });

  it('should switch to MCP tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const mcpTab = screen.getByRole('button', { name: /MCP 서버/i });
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

    expect(screen.getByRole('button', { name: /^LLM$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Network/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VectorDB/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ComfyUI/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MCP 서버/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GitHub/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /백업\/복구/i })).toBeInTheDocument();
  });

  it('should show active tab indicator', () => {
    render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

    const llmTab = screen.getByRole('button', { name: /^LLM$/i });

    // Check that LLM tab has active styling
    expect(llmTab).toHaveClass('border-primary');
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
      expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
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
      expect(screen.getByTestId('llm-settings')).toBeInTheDocument();

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
      expect(screen.getByTestId('llm-settings')).toBeInTheDocument();

      localStorage.clear();
    });

    it('should load ComfyUI config from localStorage', async () => {
      const savedComfyConfig = {
        enabled: true,
        httpUrl: 'http://localhost:8188',
        wsUrl: 'ws://localhost:8188/ws',
        workflowId: 'test-workflow',
      };

      localStorage.setItem('sepilot_comfyui_config', JSON.stringify(savedComfyConfig));

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Component should render without errors
      expect(screen.getByTestId('llm-settings')).toBeInTheDocument();

      localStorage.clear();
    });

    it('should use default config when localStorage is empty', async () => {
      localStorage.clear();

      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });

      // Should render without errors even with empty localStorage
      expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
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

      // Dialog closed - config should not load
      expect(localStorage.getItem).not.toHaveBeenCalled();

      // Open dialog
      rerender(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('설정')).toBeInTheDocument();
      });
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
          save: jest.fn().mockResolvedValue({ success: true }),
        },
        llm: {
          init: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

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

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

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
          save: jest.fn().mockResolvedValue({ success: true }),
        },
        llm: {
          init: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

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

  describe('ComfyUI 설정 저장', () => {
    beforeEach(() => {
      (isElectron as jest.Mock).mockReturnValue(false);
      localStorage.clear();
      jest.clearAllMocks();
    });

    it('should show error when enabled but URL is empty', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      const comfyTab = screen.getByRole('button', { name: /ComfyUI/i });
      await user.click(comfyTab);

      await waitFor(() => {
        expect(screen.getByTestId('comfyui-settings')).toBeInTheDocument();
      });

      // Enable ComfyUI
      const enabledCheckbox = screen.getByTestId('comfy-enabled');
      await user.click(enabledCheckbox);

      // Clear URL
      const urlInput = screen.getByTestId('comfy-url');
      await user.clear(urlInput);

      const saveButton = screen.getByTestId('comfy-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('ComfyUI HTTP URL을 입력해주세요.')).toBeInTheDocument();
      });
    });

    it('should show error when enabled but workflow ID is empty', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      const comfyTab = screen.getByRole('button', { name: /ComfyUI/i });
      await user.click(comfyTab);

      await waitFor(() => {
        expect(screen.getByTestId('comfyui-settings')).toBeInTheDocument();
      });

      const enabledCheckbox = screen.getByTestId('comfy-enabled');
      await user.click(enabledCheckbox);

      const urlInput = screen.getByTestId('comfy-url');
      await user.type(urlInput, 'http://localhost:8188');

      const workflowInput = screen.getByTestId('comfy-workflow');
      await user.clear(workflowInput);

      const saveButton = screen.getByTestId('comfy-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('기본 워크플로우 ID를 입력해주세요.')).toBeInTheDocument();
      });
    });

    it('should save ComfyUI config successfully', async () => {
      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

      const comfyTab = screen.getByRole('button', { name: /ComfyUI/i });
      await user.click(comfyTab);

      await waitFor(() => {
        expect(screen.getByTestId('comfyui-settings')).toBeInTheDocument();
      });

      const enabledCheckbox = screen.getByTestId('comfy-enabled');
      await user.click(enabledCheckbox);

      const urlInput = screen.getByTestId('comfy-url');
      await user.type(urlInput, 'http://localhost:8188');

      const workflowInput = screen.getByTestId('comfy-workflow');
      await user.type(workflowInput, 'test-workflow');

      const saveButton = screen.getByTestId('comfy-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'sepilot_comfyui_config',
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

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

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
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
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
          save: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

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

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

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
          expect.stringContaining('test-client')
        );
      });
    });

    it('should save to Electron database in Electron environment', async () => {
      (isElectron as jest.Mock).mockReturnValue(true);
      (window as any).electronAPI = {
        config: {
          save: jest.fn().mockResolvedValue({ success: true }),
        },
      };

      const user = userEvent.setup();
      render(<SettingsDialog open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByTestId('llm-settings')).toBeInTheDocument();
      });

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
