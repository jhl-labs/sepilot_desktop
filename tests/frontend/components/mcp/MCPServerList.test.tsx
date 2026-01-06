/**
 * MCPServerList 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MCPServerList } from '@/components/mcp/MCPServerList';

// Mock Electron API
const mockElectronAPI = {
  mcp: {
    listServers: jest.fn().mockResolvedValue({
      success: true,
      data: [
        {
          name: 'test-server',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          enabled: true,
        },
        {
          name: 'sse-server',
          transport: 'sse',
          url: 'https://example.com/sse',
          enabled: false,
        },
      ],
    }),
    getServerStatus: jest.fn().mockResolvedValue({
      success: true,
      data: {
        status: 'connected',
        toolCount: 5,
        tools: ['read_file', 'write_file', 'list_directory', 'search', 'execute'],
      },
    }),
    toggleServer: jest.fn().mockResolvedValue({ success: true }),
    removeServer: jest.fn().mockResolvedValue({ success: true }),
  },
};

describe('MCPServerList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window as any).electronAPI = mockElectronAPI;
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  describe('초기 렌더링', () => {
    it('should show loading state initially', () => {
      render(<MCPServerList />);

      expect(screen.getByText('서버 목록을 불러오는 중...')).toBeInTheDocument();
    });

    it('should load servers on mount', async () => {
      render(<MCPServerList />);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.listServers).toHaveBeenCalled();
      });
    });

    it('should render server list after loading', async () => {
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument();
        expect(screen.getByText('sse-server')).toBeInTheDocument();
      });
    });
  });

  describe('빈 서버 목록', () => {
    it('should show empty state when no servers', async () => {
      mockElectronAPI.mcp.listServers.mockResolvedValueOnce({
        success: true,
        data: [],
      });

      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText('MCP 서버를 추가하세요')).toBeInTheDocument();
        expect(screen.getByText(/MCP 서버를 등록하면 AI 어시스턴트가/)).toBeInTheDocument();
      });
    });
  });

  describe('서버 정보 표시', () => {
    it('should display server count', async () => {
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText(/총/)).toBeInTheDocument();
        expect(screen.getByText(/2/)).toBeInTheDocument();
        expect(screen.getByText(/개 서버/)).toBeInTheDocument();
      });
    });

    it('should display stdio server with command', async () => {
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument();
        expect(screen.getAllByText(/stdio/i).length).toBeGreaterThan(0);
      });
    });

    it('should display SSE server with URL', async () => {
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText('sse-server')).toBeInTheDocument();
        expect(screen.getAllByText(/SSE/i).length).toBeGreaterThan(0);
      });
    });

    it('should display tool count', async () => {
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getAllByText(/5개 도구/)).toHaveLength(2); // Both servers show 5 tools
      });
    });

    it('should display connection status', async () => {
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getAllByText('연결됨')).toHaveLength(2); // Both servers are connected
      });
    });
  });

  describe('서버 토글', () => {
    it('should toggle server when switch clicked', async () => {
      const user = userEvent.setup();
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument();
      });

      const switches = document.querySelectorAll('[role="switch"]');
      await user.click(switches[0]);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.toggleServer).toHaveBeenCalledWith('test-server');
      });
    });
  });

  describe('서버 새로고침', () => {
    it('should reload servers when refresh button clicked', async () => {
      const user = userEvent.setup();
      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument();
      });

      mockElectronAPI.mcp.listServers.mockClear();

      const refreshButton = screen.getByRole('button', { name: /새로고침/ });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(mockElectronAPI.mcp.listServers).toHaveBeenCalled();
      });
    });
  });

  describe('에러 처리', () => {
    it('should handle listServers error gracefully', async () => {
      mockElectronAPI.mcp.listServers.mockResolvedValueOnce({
        success: false,
        error: 'Failed to load servers',
      });

      render(<MCPServerList />);

      await waitFor(() => {
        // Should show empty state
        expect(screen.getByText('MCP 서버를 추가하세요')).toBeInTheDocument();
      });
    });

    it('should handle getServerStatus error gracefully', async () => {
      mockElectronAPI.mcp.getServerStatus.mockRejectedValueOnce(new Error('Status error'));

      render(<MCPServerList />);

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument();
      });

      // Should still render the server even if status fails
      expect(screen.getByText('test-server')).toBeInTheDocument();
    });
  });
});
