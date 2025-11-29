/**
 * BackupRestoreSettings 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BackupRestoreSettings } from '@/components/settings/BackupRestoreSettings';

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => true),
}));

describe('BackupRestoreSettings', () => {
  beforeEach(() => {
    // Set up minimal electron API mock
    (window as any).electronAPI = {
      chat: { loadConversations: jest.fn(), loadMessages: jest.fn() },
      config: { load: jest.fn() },
    };
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('should render backup and restore settings', () => {
    render(<BackupRestoreSettings />);

    expect(screen.getByText('백업 및 복구')).toBeInTheDocument();
    expect(screen.getByText('내보내기')).toBeInTheDocument();
    expect(screen.getByText('가져오기')).toBeInTheDocument();
  });

  it('should show export button', () => {
    render(<BackupRestoreSettings />);

    const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
    expect(exportButton).toBeInTheDocument();
    expect(exportButton).not.toBeDisabled();
  });

  it('should show import button', () => {
    render(<BackupRestoreSettings />);

    const importButton = screen.getByRole('button', { name: /XML에서 가져오기/ });
    expect(importButton).toBeInTheDocument();
    expect(importButton).not.toBeDisabled();
  });

  it('should show all UI elements', () => {
    render(<BackupRestoreSettings />);

    expect(screen.getByText('주의사항')).toBeInTheDocument();
    expect(screen.getByText(/가져오기는 기존 대화에 추가됩니다/)).toBeInTheDocument();
    expect(screen.getByText('내보내기')).toBeInTheDocument();
    expect(screen.getByText('가져오기')).toBeInTheDocument();
  });

  it('should show description text', () => {
    render(<BackupRestoreSettings />);

    expect(screen.getByText(/백업 및 복구/)).toBeInTheDocument();
    expect(screen.getByText(/모든 대화 내용을 XML 파일로 내보내거나 가져올 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/모든 대화와 메시지를 XML 파일로 내보냅니다/)).toBeInTheDocument();
    expect(screen.getByText(/XML 백업 파일에서 대화를 복원합니다/)).toBeInTheDocument();
  });
});
