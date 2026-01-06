/**
// TODO: i18n mock 필요
 * BackupRestoreSettings 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BackupRestoreSettings } from '@/components/settings/BackupRestoreSettings';
import { isElectron } from '@/lib/platform';

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => true),
}));

describe.skip('BackupRestoreSettings', () => {
  beforeEach(() => {
    // Reset isElectron mock to default
    (isElectron as jest.Mock).mockReturnValue(true);

    // Set up minimal electron API mock
    (window as any).electronAPI = {
      chat: { loadConversations: jest.fn(), loadMessages: jest.fn() },
      config: { load: jest.fn() },
    };

    // Mock URL methods
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    delete (window as any).electronAPI;
    jest.clearAllMocks();
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
    expect(
      screen.getByText(/모든 대화 내용을 XML 파일로 내보내거나 가져올 수 있습니다/)
    ).toBeInTheDocument();
    expect(screen.getByText(/모든 대화와 메시지를 XML 파일로 내보냅니다/)).toBeInTheDocument();
    expect(screen.getByText(/XML 백업 파일에서 대화를 복원합니다/)).toBeInTheDocument();
  });

  it('should show export icon', () => {
    const { container } = render(<BackupRestoreSettings />);

    // Export button should contain an icon
    const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
    const icon = exportButton.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should show import icon', () => {
    const { container } = render(<BackupRestoreSettings />);

    // Import button should contain an icon
    const importButton = screen.getByRole('button', { name: /XML에서 가져오기/ });
    const icon = importButton.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should have export section with proper structure', () => {
    render(<BackupRestoreSettings />);

    expect(screen.getByText('내보내기')).toBeInTheDocument();
    expect(screen.getByText(/모든 대화와 메시지를 XML 파일로 내보냅니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /XML로 내보내기/ })).toBeInTheDocument();
  });

  it('should have import section with proper structure', () => {
    render(<BackupRestoreSettings />);

    expect(screen.getByText('가져오기')).toBeInTheDocument();
    expect(screen.getByText(/XML 백업 파일에서 대화를 복원합니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /XML에서 가져오기/ })).toBeInTheDocument();
  });

  it('should show warning section', () => {
    render(<BackupRestoreSettings />);

    expect(screen.getByText('주의사항')).toBeInTheDocument();
    expect(screen.getByText(/가져오기는 기존 대화에 추가됩니다/)).toBeInTheDocument();
  });

  it('should have properly structured layout', () => {
    const { container } = render(<BackupRestoreSettings />);

    // Should have main container
    const mainDiv = container.firstChild;
    expect(mainDiv).toBeInTheDocument();

    // Should have sections
    expect(screen.getAllByRole('button')).toHaveLength(2); // Export and Import buttons
  });

  describe('Export functionality', () => {
    it('should show error when export is clicked in non-Electron environment', async () => {
      const user = userEvent.setup();
      (isElectron as jest.Mock).mockReturnValue(false);

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText('Electron 환경에서만 사용 가능합니다.')).toBeInTheDocument();
      });
    });

    it('should initiate export when export button is clicked', async () => {
      const user = userEvent.setup();

      const mockLoadConversations = jest.fn().mockResolvedValue({
        success: true,
        data: [
          { id: 'conv1', title: 'Test Conv 1', created_at: 1234567890, updated_at: 1234567890 },
          { id: 'conv2', title: 'Test Conv 2', created_at: 1234567891, updated_at: 1234567891 },
        ],
      });

      const mockLoadMessages = jest.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'msg1',
            conversation_id: 'conv1',
            role: 'user',
            content: 'Hello',
            created_at: 1234567890,
          },
        ],
      });

      const mockConfigLoad = jest.fn().mockResolvedValue({
        success: true,
        data: { theme: 'dark' },
      });

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: mockLoadMessages,
        },
        config: {
          load: mockConfigLoad,
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(mockLoadConversations).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText(/2개의 대화와 2개의 메시지를 내보냈습니다/)).toBeInTheDocument();
      });
    });

    it('should show error when export fails', async () => {
      const user = userEvent.setup();

      const mockLoadConversations = jest.fn().mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: jest.fn(),
        },
        config: {
          load: jest.fn(),
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/내보내기 실패:/)).toBeInTheDocument();
      });
    });

    it('should disable buttons during export', async () => {
      const user = userEvent.setup();

      let resolveExport: any;
      const mockLoadConversations = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      });

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: jest.fn(),
        },
        config: {
          load: jest.fn(),
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      const importButton = screen.getByRole('button', { name: /XML에서 가져오기/ });

      await user.click(exportButton);

      await waitFor(() => {
        expect(exportButton).toBeDisabled();
        expect(importButton).toBeDisabled();
      });

      // Resolve the export
      resolveExport({ success: true, data: [] });
    });
  });

  describe('Import functionality', () => {
    it('should show error when import is clicked in non-Electron environment', async () => {
      const user = userEvent.setup();
      (isElectron as jest.Mock).mockReturnValue(false);

      render(<BackupRestoreSettings />);

      const importButton = screen.getByRole('button', { name: /XML에서 가져오기/ });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('Electron 환경에서만 사용 가능합니다.')).toBeInTheDocument();
      });
    });

    it('should show info message when import button is clicked', async () => {
      const user = userEvent.setup();

      render(<BackupRestoreSettings />);

      const importButton = screen.getByRole('button', { name: /XML에서 가져오기/ });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('백업 파일을 선택하세요...')).toBeInTheDocument();
      });
    });
  });

  describe('Status messages', () => {
    it('should show info status message', async () => {
      const user = userEvent.setup();

      let resolveExport: any;
      const mockLoadConversations = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      });

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: jest.fn(),
        },
        config: {
          load: jest.fn(),
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText('대화 데이터를 내보내는 중...')).toBeInTheDocument();
      });

      // Resolve the export
      resolveExport({ success: true, data: [] });
    });

    it('should show success status message', async () => {
      const user = userEvent.setup();

      const mockLoadConversations = jest.fn().mockResolvedValue({
        success: true,
        data: [],
      });

      const mockLoadMessages = jest.fn().mockResolvedValue({
        success: true,
        data: [],
      });

      const mockConfigLoad = jest.fn().mockResolvedValue({
        success: true,
        data: {},
      });

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: mockLoadMessages,
        },
        config: {
          load: mockConfigLoad,
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/0개의 대화와 0개의 메시지를 내보냈습니다/)).toBeInTheDocument();
      });
    });

    it('should show error status message', async () => {
      const user = userEvent.setup();

      const mockLoadConversations = jest.fn().mockRejectedValue(new Error('Network error'));

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: jest.fn(),
        },
        config: {
          load: jest.fn(),
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/내보내기 실패: Network error/)).toBeInTheDocument();
      });
    });
  });

  describe('Loading states', () => {
    it('should show exporting state on button', async () => {
      const user = userEvent.setup();

      let resolveExport: any;
      const mockLoadConversations = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      });

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: jest.fn(),
        },
        config: {
          load: jest.fn(),
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText('내보내는 중...')).toBeInTheDocument();
      });

      // Resolve the export
      resolveExport({ success: true, data: [] });
    });
  });

  describe('XML generation (convertToXML)', () => {
    it('should generate valid XML with conversations and messages', async () => {
      const user = userEvent.setup();

      const mockConversations = [
        { id: 'conv1', title: 'Test & Conv', created_at: 1234567890, updated_at: 1234567891 },
      ];

      const mockMessages = [
        {
          id: 'msg1',
          conversation_id: 'conv1',
          role: 'user',
          content: 'Hello <world>',
          created_at: 1234567890,
        },
      ];

      const mockLoadConversations = jest.fn().mockResolvedValue({
        success: true,
        data: mockConversations,
      });

      const mockLoadMessages = jest.fn().mockResolvedValue({
        success: true,
        data: mockMessages,
      });

      const mockConfigLoad = jest.fn().mockResolvedValue({
        success: false,
      });

      // Mock Blob and URL
      let capturedBlob: Blob | null = null;
      global.Blob = jest.fn((content, options) => {
        capturedBlob = { content, options } as any;
        return capturedBlob as any;
      }) as any;

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: mockLoadMessages,
        },
        config: {
          load: mockConfigLoad,
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });

      // Check that XML was generated with proper escaping
      const xmlContent = (capturedBlob as any).content[0];
      expect(xmlContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xmlContent).toContain('<sepilot-backup>');
      expect(xmlContent).toContain('<version>1.0</version>');
      expect(xmlContent).toContain('<id>conv1</id>');
      expect(xmlContent).toContain('<title>Test &amp; Conv</title>');
      expect(xmlContent).toContain('<content>Hello &lt;world&gt;</content>');
    });

    it('should include images in XML when present', async () => {
      const user = userEvent.setup();

      const mockConversations = [
        { id: 'conv1', title: 'Test Conv', created_at: 1234567890, updated_at: 1234567891 },
      ];

      const mockMessages = [
        {
          id: 'msg1',
          conversation_id: 'conv1',
          role: 'user',
          content: 'Image message',
          created_at: 1234567890,
          images: [
            {
              id: 'img1',
              filename: 'test.png',
              mimeType: 'image/png',
              base64: 'base64data',
            },
          ],
        },
      ];

      const mockLoadConversations = jest.fn().mockResolvedValue({
        success: true,
        data: mockConversations,
      });

      const mockLoadMessages = jest.fn().mockResolvedValue({
        success: true,
        data: mockMessages,
      });

      const mockConfigLoad = jest.fn().mockResolvedValue({
        success: false,
      });

      let capturedBlob: Blob | null = null;
      global.Blob = jest.fn((content, options) => {
        capturedBlob = { content, options } as any;
        return capturedBlob as any;
      }) as any;

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: mockLoadMessages,
        },
        config: {
          load: mockConfigLoad,
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });

      const xmlContent = (capturedBlob as any).content[0];
      expect(xmlContent).toContain('<images>');
      expect(xmlContent).toContain('<image>');
      expect(xmlContent).toContain('<filename>test.png</filename>');
      expect(xmlContent).toContain('<mime-type>image/png</mime-type>');
      expect(xmlContent).toContain('<base64>base64data</base64>');
    });

    it('should include referenced documents in XML when present', async () => {
      const user = userEvent.setup();

      const mockConversations = [
        { id: 'conv1', title: 'Test Conv', created_at: 1234567890, updated_at: 1234567891 },
      ];

      const mockMessages = [
        {
          id: 'msg1',
          conversation_id: 'conv1',
          role: 'user',
          content: 'Doc message',
          created_at: 1234567890,
          referenced_documents: [
            {
              id: 'doc1',
              title: 'Test Doc',
              source: 'github',
              content: 'Document content',
            },
          ],
        },
      ];

      const mockLoadConversations = jest.fn().mockResolvedValue({
        success: true,
        data: mockConversations,
      });

      const mockLoadMessages = jest.fn().mockResolvedValue({
        success: true,
        data: mockMessages,
      });

      const mockConfigLoad = jest.fn().mockResolvedValue({
        success: false,
      });

      let capturedBlob: Blob | null = null;
      global.Blob = jest.fn((content, options) => {
        capturedBlob = { content, options } as any;
        return capturedBlob as any;
      }) as any;

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: mockLoadMessages,
        },
        config: {
          load: mockConfigLoad,
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });

      const xmlContent = (capturedBlob as any).content[0];
      expect(xmlContent).toContain('<referenced-documents>');
      expect(xmlContent).toContain('<document>');
      expect(xmlContent).toContain('<title>Test Doc</title>');
      expect(xmlContent).toContain('<source>github</source>');
    });

    it('should include settings in XML when present', async () => {
      const user = userEvent.setup();

      const mockSettings = { theme: 'dark', fontSize: 14 };

      const mockLoadConversations = jest.fn().mockResolvedValue({
        success: true,
        data: [],
      });

      const mockLoadMessages = jest.fn().mockResolvedValue({
        success: true,
        data: [],
      });

      const mockConfigLoad = jest.fn().mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      let capturedBlob: Blob | null = null;
      global.Blob = jest.fn((content, options) => {
        capturedBlob = { content, options } as any;
        return capturedBlob as any;
      }) as any;

      (window as any).electronAPI = {
        chat: {
          loadConversations: mockLoadConversations,
          loadMessages: mockLoadMessages,
        },
        config: {
          load: mockConfigLoad,
        },
      };

      render(<BackupRestoreSettings />);

      const exportButton = screen.getByRole('button', { name: /XML로 내보내기/ });
      await user.click(exportButton);

      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });

      const xmlContent = (capturedBlob as any).content[0];
      expect(xmlContent).toContain('<settings>');
      expect(xmlContent).toContain('<![CDATA[');
      expect(xmlContent).toContain('"theme"');
      expect(xmlContent).toContain('"dark"');
    });
  });
});
