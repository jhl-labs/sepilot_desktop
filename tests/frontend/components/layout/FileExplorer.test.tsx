/**
 * FileExplorer 컴포넌트 테스트
 *
 * 파일 탐색기 UI 및 파일/폴더 관리 기능을 테스트합니다.
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileExplorer } from '@/extensions/editor/components/FileExplorer';
import { enableElectronMode, mockElectronAPI } from '../../../setup';

// Mock Extension SDK
const mockSetWorkingDirectoryCtx = jest.fn();
const mockOpenFileCtx = jest.fn();
const mockLoadWorkingDirectoryCtx = jest.fn();
const mockRefreshFileTreeCtx = jest.fn();
const mockClearExpandedFoldersCtx = jest.fn();
const mockToggleExpandedFolderCtx = jest.fn();
const mockSetEditorViewModeCtx = jest.fn();

const extensionContextHolder: { current: Record<string, any> } = { current: {} };

const createExtensionContext = (overrides: Record<string, any> = {}) => {
  extensionContextHolder.current = {
    workspace: {
      workingDirectory: overrides.workingDirectory ?? null,
      setWorkingDirectory: overrides.setWorkingDirectory ?? mockSetWorkingDirectoryCtx,
      loadWorkingDirectory: overrides.loadWorkingDirectory ?? mockLoadWorkingDirectoryCtx,
      expandedFolderPaths: overrides.expandedFolderPaths ?? new Set<string>(),
      clearExpandedFolders: overrides.clearExpandedFolders ?? mockClearExpandedFoldersCtx,
      toggleExpandedFolder: overrides.toggleExpandedFolder ?? mockToggleExpandedFolderCtx,
      fileTreeRefreshTrigger: overrides.fileTreeRefreshTrigger ?? 0,
      refreshFileTree: overrides.refreshFileTree ?? mockRefreshFileTreeCtx,
      duplicate: jest.fn(),
      getRelativePath: jest.fn(),
      showInFolder: jest.fn(),
      openWithDefaultApp: jest.fn(),
      addExpandedFolders: jest.fn(),
    },
    files: {
      activeFilePath: overrides.activeFilePath ?? null,
      openFile: overrides.openFile ?? mockOpenFileCtx,
    },
    editor: {
      editorViewMode: overrides.editorViewMode ?? 'split',
      setEditorViewMode: overrides.setEditorViewMode ?? mockSetEditorViewModeCtx,
    },
    ui: {
      toggleTerminal: jest.fn(),
    },
    chat: {},
    ...overrides._contextOverrides,
  };
  return extensionContextHolder.current;
};

jest.mock('@sepilot/extension-sdk', () => ({
  useExtensionAPIContext: jest.fn(() => extensionContextHolder.current),
}));

jest.mock('@sepilot/extension-sdk/ui', () => {
  const React = require('react');
  return {
    Button: React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('button', { ...props, ref }, children)
    ),
    Input: React.forwardRef((props: any, ref: any) =>
      React.createElement('input', { ...props, ref })
    ),
    Tooltip: ({ children }: any) => React.createElement(React.Fragment, null, children),
    TooltipContent: ({ children }: any) => React.createElement('div', null, children),
    TooltipTrigger: React.forwardRef(({ children, asChild, ...props }: any, ref: any) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, { ...props, ref } as any);
      }
      return React.createElement('div', { ...props, ref }, children);
    }),
    TooltipProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Dialog: ({ children, open }: any) =>
      open ? React.createElement('div', { 'data-testid': 'dialog' }, children) : null,
    DialogContent: ({ children }: any) => React.createElement('div', null, children),
    DialogDescription: ({ children }: any) => React.createElement('p', null, children),
    DialogFooter: ({ children }: any) => React.createElement('div', null, children),
    DialogHeader: ({ children }: any) => React.createElement('div', null, children),
    DialogTitle: ({ children }: any) => React.createElement('h2', null, children),
    OverflowToolbar: ({ children }: any) => React.createElement('div', null, children),
    cn: (...args: any[]) => args.filter(Boolean).join(' '),
  };
});

jest.mock('@sepilot/extension-sdk/utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  isElectron: jest.fn(() => true),
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock useFileSystem hook (extension-local)
const mockReadDirectory = jest.fn();
const mockReadFile = jest.fn();
const mockCreateFile = jest.fn();
const mockCreateDirectory = jest.fn();

jest.mock('@/extensions/editor/hooks/use-extension-fs', () => ({
  useFileSystem: jest.fn(() => ({
    readDirectory: mockReadDirectory,
    readFile: mockReadFile,
    createFile: mockCreateFile,
    createDirectory: mockCreateDirectory,
    deleteItem: jest.fn(),
    renameItem: jest.fn(),
    isAvailable: true,
    error: null,
  })),
}));

// Mock useFileClipboard
jest.mock('@/extensions/editor/hooks/use-extension-clipboard', () => ({
  useFileClipboard: jest.fn(() => ({
    copy: jest.fn(),
    cut: jest.fn(),
    paste: jest.fn(),
    hasClipboard: false,
  })),
}));

// Mock useWiki
jest.mock('@/extensions/editor/hooks/use-wiki', () => ({
  useWiki: jest.fn(() => ({
    backlinks: [],
    isAnalyzing: false,
  })),
}));

// Mock FileTreeItem
jest.mock('@/extensions/editor/components/FileTreeItem', () => ({
  FileTreeItem: ({ node, onFileClick, isActive, level }: any) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': `file-tree-item-${node.name}`, style: { paddingLeft: level * 16 } },
      React.createElement(
        'button',
        {
          onClick: () => {
            if (node.isDirectory) {
              // Simulated folder click
            } else {
              onFileClick?.(node.path, node.name);
            }
          },
          className: isActive ? 'bg-accent' : '',
        },
        node.name
      ),
      node.children?.map((child: any) =>
        React.createElement(
          'div',
          { key: child.path },
          React.createElement(
            'button',
            {
              onClick: () => {
                if (!child.isDirectory) {
                  onFileClick?.(child.path, child.name);
                }
              },
            },
            child.name
          )
        )
      )
    );
  },
}));

// Mock FileTreeContextMenu
jest.mock('@/extensions/editor/components/FileTreeContextMenu', () => ({
  FileTreeContextMenu: ({ children }: any) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
}));

// Mock clipboard utils
jest.mock('@/extensions/editor/utils/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => true),
}));

// TODO: FileExplorer component is heavily coupled with @sepilot/extension-sdk
// and requires complex mocking of the SDK UI components (Button, Dialog, Tooltip, etc.)
// The SDK UI module resolution through jest moduleNameMapper conflicts with jest.mock().
// These tests need to be rewritten with a proper SDK mock setup or moved to E2E tests.
describe.skip('FileExplorer - SKIPPED: SDK UI mock resolution issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
    createExtensionContext();
    mockReadDirectory.mockReset();
    mockReadFile.mockReset();
    mockCreateFile.mockReset();
    mockCreateDirectory.mockReset();
  });

  describe('초기 렌더링', () => {
    it('디렉토리 선택 전 기본 상태를 표시해야 함', () => {
      render(<FileExplorer />);

      expect(screen.getByTitle('디렉토리 선택')).toBeInTheDocument();
    });

    it('디렉토리 선택 버튼이 렌더링되어야 함', () => {
      render(<FileExplorer />);

      const selectButton = screen.getByTitle('디렉토리 선택');
      expect(selectButton).toBeInTheDocument();
    });
  });

  describe('디렉토리 선택', () => {
    it('디렉토리 선택 성공 시 working directory를 설정해야 함', async () => {
      const mockSelectDirectory = jest.fn().mockResolvedValue('/test/directory');
      createExtensionContext();
      extensionContextHolder.current.workspace.selectDirectory = mockSelectDirectory;

      const user = userEvent.setup();
      render(<FileExplorer />);

      const selectButton = screen.getByTitle('디렉토리 선택');
      await user.click(selectButton);

      await waitFor(() => {
        expect(mockSelectDirectory).toHaveBeenCalled();
        expect(mockSetWorkingDirectoryCtx).toHaveBeenCalledWith('/test/directory');
      });
    });

    it('디렉토리 선택 실패 시 에러를 처리해야 함', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockSelectDirectory = jest.fn().mockRejectedValue(new Error('Selection failed'));
      createExtensionContext();
      extensionContextHolder.current.workspace.selectDirectory = mockSelectDirectory;

      const user = userEvent.setup();
      render(<FileExplorer />);

      const selectButton = screen.getByTitle('디렉토리 선택');
      await user.click(selectButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('디렉토리 선택 취소 시 아무 작업도 하지 않아야 함', async () => {
      const mockSelectDirectory = jest.fn().mockResolvedValue(null);
      createExtensionContext();
      extensionContextHolder.current.workspace.selectDirectory = mockSelectDirectory;

      const user = userEvent.setup();
      render(<FileExplorer />);

      const selectButton = screen.getByTitle('디렉토리 선택');
      await user.click(selectButton);

      await waitFor(() => {
        expect(mockSetWorkingDirectoryCtx).not.toHaveBeenCalled();
      });
    });
  });

  describe('파일 트리 표시', () => {
    beforeEach(() => {
      mockReadDirectory.mockResolvedValue([
        { name: 'folder1', path: '/test/folder1', isDirectory: true },
        { name: 'file1.ts', path: '/test/file1.ts', isDirectory: false },
        { name: 'file2.js', path: '/test/file2.js', isDirectory: false },
      ]);
    });

    it('working directory 설정 시 파일 트리를 로드해야 함', async () => {
      createExtensionContext({ workingDirectory: '/test/directory' });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(mockReadDirectory).toHaveBeenCalledWith('/test/directory');
        expect(screen.getByText('folder1')).toBeInTheDocument();
        expect(screen.getByText('file1.ts')).toBeInTheDocument();
        expect(screen.getByText('file2.js')).toBeInTheDocument();
      });
    });

    it('로딩 중 상태를 표시해야 함', async () => {
      mockReadDirectory.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );

      createExtensionContext({ workingDirectory: '/test/directory' });

      render(<FileExplorer />);

      expect(screen.getByText('로딩 중...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();
      });
    });

    it('빈 디렉토리 상태를 표시해야 함', async () => {
      mockReadDirectory.mockResolvedValue([]);

      createExtensionContext({ workingDirectory: '/test/empty' });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('빈 디렉토리')).toBeInTheDocument();
      });
    });

    it('선택된 working directory 경로를 표시해야 함', () => {
      createExtensionContext({ workingDirectory: '/test/projects/my-app' });

      render(<FileExplorer />);

      expect(screen.getByText('/test/projects/my-app')).toBeInTheDocument();
    });
  });

  describe('폴더 확장/축소', () => {
    beforeEach(() => {
      mockReadDirectory.mockImplementation((path: string) => {
        if (path === '/test/directory') {
          return Promise.resolve([
            {
              name: 'folder1',
              path: '/test/directory/folder1',
              isDirectory: true,
              children: [
                {
                  name: 'nested.js',
                  path: '/test/directory/folder1/nested.js',
                  isDirectory: false,
                },
              ],
            },
            { name: 'file1.ts', path: '/test/directory/file1.ts', isDirectory: false },
          ]);
        }
        return Promise.resolve([]);
      });

      createExtensionContext({ workingDirectory: '/test/directory' });
    });

    it('파일 트리가 로드되어야 함', async () => {
      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
        expect(screen.getByText('file1.ts')).toBeInTheDocument();
      });
    });
  });

  describe('파일 클릭', () => {
    beforeEach(() => {
      mockReadDirectory.mockResolvedValue([
        { name: 'test.ts', path: '/test/test.ts', isDirectory: false },
        { name: 'script.js', path: '/test/script.js', isDirectory: false },
        { name: 'data.json', path: '/test/data.json', isDirectory: false },
        { name: 'readme.md', path: '/test/readme.md', isDirectory: false },
      ]);

      createExtensionContext({ workingDirectory: '/test' });
    });

    it('파일 클릭 시 파일을 읽고 openFile을 호출해야 함', async () => {
      const user = userEvent.setup();
      mockReadFile.mockResolvedValue('const test = "Hello";');

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('test.ts')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('test.ts');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockReadFile).toHaveBeenCalledWith('/test/test.ts');
        expect(mockOpenFileCtx).toHaveBeenCalledWith({
          path: '/test/test.ts',
          filename: 'test.ts',
          content: 'const test = "Hello";',
          language: 'typescript',
        });
      });
    });

    it('JavaScript 파일의 언어를 올바르게 감지해야 함', async () => {
      const user = userEvent.setup();
      mockReadFile.mockResolvedValue('console.log("test");');

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('script.js')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('script.js');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFileCtx).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'javascript',
          })
        );
      });
    });

    it('JSON 파일의 언어를 올바르게 감지해야 함', async () => {
      const user = userEvent.setup();
      mockReadFile.mockResolvedValue('{"test": true}');

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('data.json')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('data.json');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFileCtx).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'json',
          })
        );
      });
    });

    it('Markdown 파일의 언어를 올바르게 감지해야 함', async () => {
      const user = userEvent.setup();
      mockReadFile.mockResolvedValue('# Test');

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('readme.md')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('readme.md');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFileCtx).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'markdown',
          })
        );
      });
    });

    it('파일 읽기 실패 시 에러를 처리해야 함', async () => {
      const user = userEvent.setup();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('test.ts')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('test.ts');
      await user.click(fileButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('활성 파일 하이라이트', () => {
    it('활성 파일에 하이라이트 스타일이 적용되어야 함', async () => {
      mockReadDirectory.mockResolvedValue([
        { name: 'active.ts', path: '/test/active.ts', isDirectory: false },
        { name: 'inactive.ts', path: '/test/inactive.ts', isDirectory: false },
      ]);

      createExtensionContext({
        workingDirectory: '/test',
        activeFilePath: '/test/active.ts',
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('active.ts')).toBeInTheDocument();
      });

      const activeFileButton = screen.getByText('active.ts').closest('button');
      const inactiveFileButton = screen.getByText('inactive.ts').closest('button');

      expect(activeFileButton).toHaveClass('bg-accent');
      expect(inactiveFileButton).not.toHaveClass('bg-accent');
    });
  });

  describe('Lazy loading 폴더', () => {
    it('lazy load 실패 시 에러를 처리해야 함', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockReadDirectory.mockImplementation((path: string) => {
        if (path === '/test') {
          return Promise.resolve([
            { name: 'error-folder', path: '/test/error-folder', isDirectory: true },
          ]);
        }
        return Promise.reject(new Error('Permission denied'));
      });

      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('error-folder')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('에러 처리', () => {
    it('loadFileTree 에러 시 로딩 상태가 해제되어야 함', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockReadDirectory.mockRejectedValue(new Error('Network error'));

      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      await waitFor(() => {
        // useFileSystem logs the error
        expect(consoleSpy).toHaveBeenCalled();
      });

      // Loading should be cleared even after error
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe.skip('새 파일/폴더 버튼', () => {
    // TODO: Move to FileTreeContextMenu.test.tsx
    // UI has been changed from toolbar buttons to context menu
    it('working directory가 없으면 버튼이 비활성화되어야 함', () => {
      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      const newFolderButton = screen.getByTitle('새 폴더');

      expect(newFileButton).toBeDisabled();
      expect(newFolderButton).toBeDisabled();
    });

    it('working directory가 있으면 버튼이 활성화되어야 함', () => {
      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      const newFolderButton = screen.getByTitle('새 폴더');

      expect(newFileButton).toBeEnabled();
      expect(newFolderButton).toBeEnabled();
    });

    it('새 파일 버튼 클릭 시 dialog가 열려야 함', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      await user.click(newFileButton);

      await waitFor(() => {
        expect(screen.getByText('새 파일 생성')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('예: example.txt')).toBeInTheDocument();
      });
    });

    it('새 폴더 버튼 클릭 시 dialog가 열려야 함', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      const newFolderButton = screen.getByTitle('새 폴더');
      await user.click(newFolderButton);

      await waitFor(() => {
        expect(screen.getByText('새 폴더 생성')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('예: my-folder')).toBeInTheDocument();
      });
    });

    it('새 파일 dialog에서 파일 생성 성공', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      (mockElectronAPI.fs.createFile as jest.Mock).mockResolvedValue({
        success: true,
      });

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      await user.click(newFileButton);

      const input = await screen.findByPlaceholderText('예: example.txt');
      await user.type(input, 'test.txt');

      const createButton = screen.getByText('생성');
      await user.click(createButton);

      await waitFor(() => {
        expect(mockElectronAPI.fs.createFile).toHaveBeenCalledWith('/test/test.txt', '');
        expect(mockElectronAPI.fs.readDirectory).toHaveBeenCalledWith('/test');
      });
    });

    it('새 파일 dialog에서 Enter 키로 파일 생성', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      (mockElectronAPI.fs.createFile as jest.Mock).mockResolvedValue({
        success: true,
      });

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      await user.click(newFileButton);

      const input = await screen.findByPlaceholderText('예: example.txt');
      await user.type(input, 'test.txt{Enter}');

      await waitFor(() => {
        expect(mockElectronAPI.fs.createFile).toHaveBeenCalledWith('/test/test.txt', '');
      });
    });

    it('새 파일 dialog 취소 버튼', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      await user.click(newFileButton);

      await screen.findByText('새 파일 생성');

      const cancelButton = screen.getByText('취소');
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('새 파일 생성')).not.toBeInTheDocument();
      });
    });

    it('새 파일 생성 실패 시 alert 표시', async () => {
      const user = userEvent.setup();
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

      createExtensionContext({ workingDirectory: '/test' });

      (mockElectronAPI.fs.createFile as jest.Mock).mockResolvedValue({
        success: false,
      });

      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      await user.click(newFileButton);

      const input = await screen.findByPlaceholderText('예: example.txt');
      await user.type(input, 'test.txt');

      const createButton = screen.getByText('생성');
      await user.click(createButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('파일 생성 실패');
      });

      alertSpy.mockRestore();
    });

    it('새 폴더 dialog에서 폴더 생성 성공', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      (mockElectronAPI.fs.createDirectory as jest.Mock).mockResolvedValue({
        success: true,
      });

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      render(<FileExplorer />);

      const newFolderButton = screen.getByTitle('새 폴더');
      await user.click(newFolderButton);

      const input = await screen.findByPlaceholderText('예: my-folder');
      await user.type(input, 'new-folder');

      const createButton = screen.getByText('생성');
      await user.click(createButton);

      await waitFor(() => {
        expect(mockElectronAPI.fs.createDirectory).toHaveBeenCalledWith('/test/new-folder');
        expect(mockElectronAPI.fs.readDirectory).toHaveBeenCalledWith('/test');
      });
    });

    it('새 폴더 dialog에서 Enter 키로 폴더 생성', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      (mockElectronAPI.fs.createDirectory as jest.Mock).mockResolvedValue({
        success: true,
      });

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      render(<FileExplorer />);

      const newFolderButton = screen.getByTitle('새 폴더');
      await user.click(newFolderButton);

      const input = await screen.findByPlaceholderText('예: my-folder');
      await user.type(input, 'new-folder{Enter}');

      await waitFor(() => {
        expect(mockElectronAPI.fs.createDirectory).toHaveBeenCalledWith('/test/new-folder');
      });
    });

    it('새 폴더 dialog 취소 버튼', async () => {
      const user = userEvent.setup();
      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      const newFolderButton = screen.getByTitle('새 폴더');
      await user.click(newFolderButton);

      await screen.findByText('새 폴더 생성');

      const cancelButton = screen.getByText('취소');
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('새 폴더 생성')).not.toBeInTheDocument();
      });
    });

    it('새 폴더 생성 실패 시 alert 표시', async () => {
      const user = userEvent.setup();
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

      createExtensionContext({ workingDirectory: '/test' });

      (mockElectronAPI.fs.createDirectory as jest.Mock).mockResolvedValue({
        success: false,
      });

      render(<FileExplorer />);

      const newFolderButton = screen.getByTitle('새 폴더');
      await user.click(newFolderButton);

      const input = await screen.findByPlaceholderText('예: my-folder');
      await user.type(input, 'new-folder');

      const createButton = screen.getByText('생성');
      await user.click(createButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('폴더 생성 실패');
      });

      alertSpy.mockRestore();
    });

    it('빈 디렉토리 메시지 표시', async () => {
      createExtensionContext({ workingDirectory: '/test' });

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('빈 디렉토리')).toBeInTheDocument();
      });
    });
  });

  describe('다양한 파일 확장자 언어 감지', () => {
    beforeEach(() => {
      mockReadFile.mockResolvedValue('test content');

      createExtensionContext({ workingDirectory: '/test' });
    });

    const testLanguageDetection = async (filename: string, expectedLanguage: string) => {
      const user = userEvent.setup();

      mockReadDirectory.mockResolvedValue([
        { name: filename, path: `/test/${filename}`, isDirectory: false },
      ]);

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText(filename)).toBeInTheDocument();
      });

      const fileButton = screen.getByText(filename);
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFileCtx).toHaveBeenCalledWith(
          expect.objectContaining({
            language: expectedLanguage,
          })
        );
      });
    };

    it('Python 파일', async () => {
      await testLanguageDetection('script.py', 'python');
    });

    it('Java 파일', async () => {
      await testLanguageDetection('Main.java', 'java');
    });

    it('C 파일', async () => {
      await testLanguageDetection('program.c', 'c');
    });

    it('C++ 파일', async () => {
      await testLanguageDetection('program.cpp', 'cpp');
    });

    it('Shell 파일', async () => {
      await testLanguageDetection('script.sh', 'shell');
    });

    it('CSS 파일', async () => {
      await testLanguageDetection('styles.css', 'css');
    });

    it('HTML 파일', async () => {
      await testLanguageDetection('index.html', 'html');
    });

    it('알 수 없는 확장자는 plaintext로 감지', async () => {
      await testLanguageDetection('unknown.xyz', 'plaintext');
    });

    it('확장자가 없는 파일은 plaintext로 감지', async () => {
      await testLanguageDetection('README', 'plaintext');
    });
  });

  describe('Validation 및 Guard 체크', () => {
    it('should warn when trying to select directory in non-Electron environment', async () => {
      const { isElectron } = require('@sepilot/extension-sdk/utils');
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Temporarily set isElectron to false
      (isElectron as jest.Mock).mockReturnValue(false);

      render(<FileExplorer />);

      const selectButton = screen.getByTitle('디렉토리 선택');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalled();
      });

      // Restore
      (isElectron as jest.Mock).mockReturnValue(true);
      consoleWarnSpy.mockRestore();
    });

    it.skip('should warn when trying to create file without name', async () => {
      // TODO: Move to FileTreeContextMenu.test.tsx - UI changed to context menu
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      // Open new file dialog
      const newFileButton = screen.getByTitle('새 파일');
      await userEvent.click(newFileButton);

      await waitFor(() => {
        expect(screen.getByText('새 파일 생성')).toBeInTheDocument();
      });

      // Try to create without entering name
      const createButton = screen.getByRole('button', { name: /생성/i });
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[FileExplorer] Cannot create item - missing name or parent path'
        );
      });

      consoleWarnSpy.mockRestore();
    });

    it.skip('should warn when trying to create folder without name', async () => {
      // TODO: Move to FileTreeContextMenu.test.tsx - UI changed to context menu
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      createExtensionContext({ workingDirectory: '/test' });

      render(<FileExplorer />);

      // Open new folder dialog
      const newFolderButton = screen.getByTitle('새 폴더');
      await userEvent.click(newFolderButton);

      await waitFor(() => {
        expect(screen.getByText('새 폴더 생성')).toBeInTheDocument();
      });

      // Try to create without entering name
      const createButton = screen.getByRole('button', { name: /생성/i });
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[FileExplorer] Cannot create item - missing name or parent path'
        );
      });

      consoleWarnSpy.mockRestore();
    });
  });
});
