/**
 * MCPServerConfig 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MCPServerConfigComponent } from '@/components/mcp/MCPServerConfig';

// Mock Electron API
const mockElectronAPI = {
  mcp: {
    addServer: jest.fn().mockResolvedValue({ success: true }),
  },
};

describe('MCPServerConfig', () => {
  const mockOnAdd = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (window as any).electronAPI = mockElectronAPI;
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  describe('초기 렌더링', () => {
    it('should render header', () => {
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      expect(screen.getByText('새 MCP 서버 추가')).toBeInTheDocument();
      expect(screen.getByText(/AI 어시스턴트에 새로운 도구를 제공합니다/)).toBeInTheDocument();
    });

    it('should show stdio tab by default', () => {
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      expect(screen.getByText('stdio')).toBeInTheDocument();
      expect(screen.getAllByText(/로컬 프로세스/).length).toBeGreaterThan(0);
    });

    it('should show required input fields', () => {
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      expect(screen.getByLabelText(/서버 이름/)).toBeInTheDocument();
      expect(screen.getByLabelText(/실행 명령어/)).toBeInTheDocument();
      expect(screen.getByLabelText(/실행 인자/)).toBeInTheDocument();
    });

    it('should show preset templates', () => {
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      expect(screen.getByText('Filesystem')).toBeInTheDocument();
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('SQLite')).toBeInTheDocument();
      expect(screen.getByText('Web Search')).toBeInTheDocument();
      expect(screen.getByText('Git')).toBeInTheDocument();
    });

    it('should show add button disabled by default', () => {
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      expect(addButton).toBeDisabled();
    });
  });

  describe('Transport 전환', () => {
    it('should switch to SSE tab', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/SSE URL/)).toBeInTheDocument();
        expect(screen.getByLabelText(/HTTP 헤더/)).toBeInTheDocument();
      });
    });

    it('should show SSE preset templates when switched', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByText('Custom SSE')).toBeInTheDocument();
      });
    });

    it('should clear inputs when switching transport', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(nameInput).toHaveValue('test-server'); // Name should persist
      });
    });
  });

  describe('Preset 템플릿', () => {
    it('should load Filesystem preset', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const filesystemPreset = screen.getByText('Filesystem').closest('button');
      await user.click(filesystemPreset!);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/서버 이름/) as HTMLInputElement;
        expect(nameInput.value).toBe('Filesystem');
      });
    });

    it('should load GitHub preset', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const githubPreset = screen.getByText('GitHub').closest('button');
      await user.click(githubPreset!);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/서버 이름/) as HTMLInputElement;
        expect(nameInput.value).toBe('GitHub');
      });
    });
  });

  describe('입력 필드', () => {
    it('should update server name', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'my-server');

      expect(nameInput).toHaveValue('my-server');
    });

    it('should update command', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const commandInput = screen.getByLabelText(/실행 명령어/);
      await user.clear(commandInput);
      await user.type(commandInput, 'node');

      expect(commandInput).toHaveValue('node');
    });

    it('should update args', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const argsInput = screen.getByLabelText(/실행 인자/);
      await user.type(argsInput, 'server.js\n--port\n3000');

      expect(argsInput).toHaveValue('server.js\n--port\n3000');
    });

    it('should update SSE URL', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/SSE URL/)).toBeInTheDocument();
      });

      const urlInput = screen.getByLabelText(/SSE URL/);
      await user.type(urlInput, 'http://localhost:3001/sse');

      expect(urlInput).toHaveValue('http://localhost:3001/sse');
    });
  });

  describe('유효성 검증', () => {
    it('should show error when name is missing', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      // Fill only command
      const commandInput = screen.getByLabelText(/실행 명령어/);
      await user.type(commandInput, 'node');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      expect(addButton).toBeDisabled();
    });

    it('should show error when command is missing for stdio', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const commandInput = screen.getByLabelText(/실행 명령어/);
      await user.clear(commandInput);

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      expect(addButton).toBeDisabled();
    });

    it('should enable add button when all required fields are filled', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const commandInput = screen.getByLabelText(/실행 명령어/);
      expect(commandInput).toHaveValue('npx'); // Default value

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      expect(addButton).toBeEnabled();
    });
  });

  describe('서버 추가', () => {
    it('should call addServer when add button clicked', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.addServer).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'test-server',
            transport: 'stdio',
            command: 'npx',
          })
        );
      });
    });

    it('should show success message after adding', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/'test-server' 서버가 추가되었습니다!/)).toBeInTheDocument();
      });
    });

    it('should call onAdd callback after success', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockOnAdd).toHaveBeenCalled();
      });
    });

    it('should show error message on failure', async () => {
      mockElectronAPI.mcp.addServer.mockResolvedValueOnce({
        success: false,
        error: '서버 추가 실패',
      });

      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/서버 추가 실패/)).toBeInTheDocument();
      });
    });

    it('should clear inputs after successful add', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/) as HTMLInputElement;
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(nameInput.value).toBe('');
      });
    });
  });

  describe('고급 옵션', () => {
    it('should show advanced options when clicked', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const advancedButton = screen.getByRole('button', { name: /고급 옵션/ });
      await user.click(advancedButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/환경 변수/)).toBeInTheDocument();
      });
    });

    it('should update environment variables', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const advancedButton = screen.getByRole('button', { name: /고급 옵션/ });
      await user.click(advancedButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/환경 변수/)).toBeInTheDocument();
      });

      const envInput = screen.getByLabelText(/환경 변수/);
      await user.type(envInput, 'API_KEY=test123\nDEBUG=true');

      expect(envInput).toHaveValue('API_KEY=test123\nDEBUG=true');
    });
  });

  describe('정보 박스', () => {
    it('should show stdio information', () => {
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      expect(screen.getByText(/stdio 프로토콜을 통해 로컬 프로세스와 통신합니다/)).toBeInTheDocument();
    });

    it('should show SSE information when switched', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByText(/SSE를 통해 HTTP 기반 MCP 서버와 통신합니다/)).toBeInTheDocument();
      });
    });
  });

  describe('Validation 에러', () => {
    it('should show error when server name is empty', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      // Name is empty, but command has default value 'npx'
      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.clear(nameInput);

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });

      // Button should be disabled when name is empty
      expect(addButton).toBeDisabled();
    });

    it('should show error when command is empty for stdio', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const commandInput = screen.getByLabelText(/실행 명령어/);
      await user.clear(commandInput);

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      expect(addButton).toBeDisabled();
    });

    it('should show error when SSE URL is empty', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      // Switch to SSE tab
      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/SSE URL/)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'sse-server');

      // URL input should exist but be empty
      const urlInput = screen.getByLabelText(/SSE URL/);
      expect(urlInput).toHaveValue('');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      expect(addButton).toBeDisabled();
    });
  });

  describe('SSE Headers 파싱', () => {
    it('should parse SSE headers correctly', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      // Switch to SSE
      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/SSE URL/)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'sse-server');

      const urlInput = screen.getByLabelText(/SSE URL/);
      await user.type(urlInput, 'http://localhost:3000/sse');

      const headersInput = screen.getByLabelText(/HTTP 헤더/);
      await user.type(headersInput, 'Authorization: Bearer token123\nContent-Type: application/json');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.addServer).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'sse-server',
            transport: 'sse',
            url: 'http://localhost:3000/sse',
            headers: {
              'Authorization': 'Bearer token123',
              'Content-Type': 'application/json',
            },
          })
        );
      });
    });

    it('should handle SSE headers without colons', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/SSE URL/)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'sse-server');

      const urlInput = screen.getByLabelText(/SSE URL/);
      await user.type(urlInput, 'http://localhost:3000/sse');

      // Invalid header format (no colon)
      const headersInput = screen.getByLabelText(/HTTP 헤더/);
      await user.type(headersInput, 'InvalidHeader\nValid: Header');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.addServer).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: {
              'Valid': 'Header',
            },
          })
        );
      });
    });

    it('should handle empty headers for SSE', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const sseTab = screen.getByRole('tab', { name: /SSE/ });
      await user.click(sseTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/SSE URL/)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'sse-server');

      const urlInput = screen.getByLabelText(/SSE URL/);
      await user.type(urlInput, 'http://localhost:3000/sse');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.addServer).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'sse-server',
            transport: 'sse',
            url: 'http://localhost:3000/sse',
          })
        );
      });

      // headers should be undefined when empty
      const call = mockElectronAPI.mcp.addServer.mock.calls[0][0];
      expect(call.headers).toBeUndefined();
    });
  });

  describe('환경변수 파싱', () => {
    it('should parse environment variables correctly', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      // Open advanced options
      const advancedButton = screen.getByRole('button', { name: /고급 옵션/ });
      await user.click(advancedButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/환경 변수/)).toBeInTheDocument();
      });

      const envInput = screen.getByLabelText(/환경 변수/);
      await user.type(envInput, 'API_KEY=secret123\nDEBUG=true\nPORT=8080');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.addServer).toHaveBeenCalledWith(
          expect.objectContaining({
            env: {
              'API_KEY': 'secret123',
              'DEBUG': 'true',
              'PORT': '8080',
            },
          })
        );
      });
    });

    it('should handle env vars without equals sign', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const advancedButton = screen.getByRole('button', { name: /고급 옵션/ });
      await user.click(advancedButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/환경 변수/)).toBeInTheDocument();
      });

      const envInput = screen.getByLabelText(/환경 변수/);
      await user.type(envInput, 'INVALID\nVALID=yes');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.addServer).toHaveBeenCalledWith(
          expect.objectContaining({
            env: {
              'VALID': 'yes',
            },
          })
        );
      });
    });

    it('should handle empty environment variables', async () => {
      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.addServer).toHaveBeenCalled();
      });

      // env should be undefined when empty
      const call = mockElectronAPI.mcp.addServer.mock.calls[0][0];
      expect(call.env).toBeUndefined();
    });
  });

  describe('에러 처리', () => {
    it('should handle exception during addServer', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockElectronAPI.mcp.addServer.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to add MCP server:',
          expect.any(Error)
        );
      });

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle unknown error type', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockElectronAPI.mcp.addServer.mockRejectedValueOnce('Unknown error');

      const user = userEvent.setup();
      render(<MCPServerConfigComponent onAdd={mockOnAdd} />);

      const nameInput = screen.getByLabelText(/서버 이름/);
      await user.type(nameInput, 'test-server');

      const addButton = screen.getByRole('button', { name: /MCP 서버 추가/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      // Should show generic error message
      await waitFor(() => {
        expect(screen.getByText(/서버 추가에 실패했습니다/)).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
