/**
 * GitHubOAuthSettings 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { GitHubOAuthSettings } from '@/components/settings/GitHubOAuthSettings';
import { GitHubOAuthConfig } from '@/types';

// Mock Electron API
const mockElectronAPI = {
  github: {
    hasPrivateKey: jest.fn().mockResolvedValue({ success: true, data: false }),
    setPrivateKey: jest.fn().mockResolvedValue({ success: true }),
    getRepositories: jest.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 1, name: 'repo1', full_name: 'owner/repo1', private: false },
        { id: 2, name: 'repo2', full_name: 'owner/repo2', private: true },
      ],
    }),
  },
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
};

describe('GitHubOAuthSettings', () => {
  const mockOnSave = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (window as any).electronAPI = mockElectronAPI;
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('should render initial config step', () => {
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    expect(screen.getByText('GitHub App 설정 진행 상태')).toBeInTheDocument();
    expect(screen.getByLabelText(/GitHub 서버 타입/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/App ID/i)).toBeInTheDocument();
  });

  it('should have GitHub.com selected by default', () => {
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    const serverTypeSelect = screen.getByLabelText(/GitHub 서버 타입/i) as HTMLSelectElement;
    expect(serverTypeSelect.value).toBe('github.com');
  });

  it('should show GHES URL input when GHES is selected', async () => {
    const user = userEvent.setup();
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    const serverTypeSelect = screen.getByLabelText(/GitHub 서버 타입/i);
    await user.selectOptions(serverTypeSelect, 'ghes');

    await waitFor(() => {
      expect(screen.getByLabelText(/GHES URL/i)).toBeInTheDocument();
    });
  });

  it('should accept App ID input', async () => {
    const user = userEvent.setup();
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    const appIdInput = screen.getByLabelText(/App ID/i);
    await user.type(appIdInput, '12345');

    expect(appIdInput).toHaveValue('12345');
  });

  it('should show error when clicking next without completing fields', async () => {
    const user = userEvent.setup();
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    const nextButton = screen.getByRole('button', { name: /다음 단계/ });
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText(/모든 필드를 입력해주세요/i)).toBeInTheDocument();
    });
  });

  it('should load existing config', async () => {
    const existingConfig: GitHubOAuthConfig = {
      serverType: 'github.com',
      appId: '67890',
      installationId: '111',
      selectedRepo: 'owner/repo1',
    };

    render(<GitHubOAuthSettings config={existingConfig} onSave={mockOnSave} />);

    await waitFor(() => {
      const appIdInput = screen.getByLabelText(/App ID/i) as HTMLInputElement;
      expect(appIdInput.value).toBe('67890');
    });
  });

  it('should check for existing private key on mount', async () => {
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    await waitFor(() => {
      expect(mockElectronAPI.github.hasPrivateKey).toHaveBeenCalled();
    });
  });

  it('should handle GHES server type in config', async () => {
    const ghesConfig: GitHubOAuthConfig = {
      serverType: 'ghes',
      ghesUrl: 'https://github.enterprise.com',
      appId: '12345',
      installationId: '111',
    };

    render(<GitHubOAuthSettings config={ghesConfig} onSave={mockOnSave} />);

    await waitFor(() => {
      const serverTypeSelect = screen.getByLabelText(/GitHub 서버 타입/i) as HTMLSelectElement;
      expect(serverTypeSelect.value).toBe('ghes');
    });

    await waitFor(() => {
      const ghesUrlInput = screen.getByLabelText(/GHES URL/i) as HTMLInputElement;
      expect(ghesUrlInput.value).toBe('https://github.enterprise.com');
    });
  });

  it('should render progress steps', () => {
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    expect(screen.getByText('GitHub App 설정 진행 상태')).toBeInTheDocument();
    expect(screen.getAllByText('1. 기본 설정').length).toBeGreaterThan(0);
    expect(screen.getByText('2. GitHub App 설치')).toBeInTheDocument();
    expect(screen.getByText('3. Installation 검증')).toBeInTheDocument();
    expect(screen.getByText('4. 레포지토리 선택')).toBeInTheDocument();
    expect(screen.getByText('5. 완료')).toBeInTheDocument();
  });

  it('should show security information', () => {
    render(<GitHubOAuthSettings config={null} onSave={mockOnSave} />);

    expect(screen.getByText(/보안 정보/)).toBeInTheDocument();
    expect(screen.getByText(/AES-256-GCM/)).toBeInTheDocument();
  });
});
