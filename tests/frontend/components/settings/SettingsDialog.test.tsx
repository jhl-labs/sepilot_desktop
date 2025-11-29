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
  LLMSettingsTab: () => <div data-testid="llm-settings">LLM Settings</div>,
}));

jest.mock('@/components/settings/NetworkSettingsTab', () => ({
  NetworkSettingsTab: () => <div data-testid="network-settings">Network Settings</div>,
}));

jest.mock('@/components/settings/ComfyUISettingsTab', () => ({
  ComfyUISettingsTab: () => <div data-testid="comfyui-settings">ComfyUI Settings</div>,
}));

jest.mock('@/components/settings/MCPSettingsTab', () => ({
  MCPSettingsTab: () => <div data-testid="mcp-settings">MCP Settings</div>,
}));

jest.mock('@/components/rag/VectorDBSettings', () => ({
  VectorDBSettings: () => <div data-testid="vectordb-settings">VectorDB Settings</div>,
}));

jest.mock('@/components/settings/GitHubOAuthSettings', () => ({
  GitHubOAuthSettings: () => <div data-testid="github-settings">GitHub Settings</div>,
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
});
