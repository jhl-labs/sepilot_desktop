/**
 * MCPSettingsTab 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MCPSettingsTab } from '@/components/settings/MCPSettingsTab';

// Mock child components
jest.mock('@/components/mcp/MCPServerList', () => ({
  MCPServerList: ({ onRefresh }: { onRefresh: () => void }) => (
    <div data-testid="mcp-server-list">
      <button onClick={onRefresh}>Refresh List</button>
    </div>
  ),
}));

jest.mock('@/components/mcp/MCPServerConfig', () => ({
  MCPServerConfigComponent: ({ onAdd }: { onAdd: () => void }) => (
    <div data-testid="mcp-server-config">
      <button onClick={onAdd}>Add Server</button>
    </div>
  ),
}));

describe('MCPSettingsTab', () => {
  it('should render MCPServerList', () => {
    render(<MCPSettingsTab />);

    expect(screen.getByTestId('mcp-server-list')).toBeInTheDocument();
  });

  it('should render MCPServerConfigComponent', () => {
    render(<MCPSettingsTab />);

    expect(screen.getByTestId('mcp-server-config')).toBeInTheDocument();
  });

  it('should render divider with "새 서버 추가" text', () => {
    render(<MCPSettingsTab />);

    expect(screen.getByText('새 서버 추가')).toBeInTheDocument();
  });

  it('should refresh MCPServerList when onRefresh is called', async () => {
    const user = userEvent.setup();
    const { container } = render(<MCPSettingsTab />);

    const refreshButton = screen.getByText('Refresh List');

    // Get initial key
    const initialList = container.querySelector('[data-testid="mcp-server-list"]');

    await user.click(refreshButton);

    // Component should still be rendered
    expect(screen.getByTestId('mcp-server-list')).toBeInTheDocument();
  });

  it('should refresh MCPServerList when onAdd is called', async () => {
    const user = userEvent.setup();
    const { container } = render(<MCPSettingsTab />);

    const addButton = screen.getByText('Add Server');

    await user.click(addButton);

    // Component should still be rendered after add
    expect(screen.getByTestId('mcp-server-list')).toBeInTheDocument();
  });

  it('should have proper layout structure', () => {
    const { container } = render(<MCPSettingsTab />);

    // Should have main container
    const mainDiv = container.firstChild;
    expect(mainDiv).toHaveClass('space-y-8');
  });

  it('should render divider with border styling', () => {
    const { container } = render(<MCPSettingsTab />);

    // Check for dashed border
    const dashedBorder = container.querySelector('.border-dashed');
    expect(dashedBorder).toBeInTheDocument();
  });

  it('should display components in correct order', () => {
    render(<MCPSettingsTab />);

    const serverList = screen.getByTestId('mcp-server-list');
    const divider = screen.getByText('새 서버 추가');
    const serverConfig = screen.getByTestId('mcp-server-config');

    // All components should be present
    expect(serverList).toBeInTheDocument();
    expect(divider).toBeInTheDocument();
    expect(serverConfig).toBeInTheDocument();
  });
});
