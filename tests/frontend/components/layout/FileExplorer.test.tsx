/**
 * FileExplorer 컴포넌트 테스트
 *
 * 파일 탐색기 UI 및 파일/폴더 관리 기능을 테스트합니다.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileExplorer } from '@/components/layout/FileExplorer';
import { useChatStore } from '@/lib/store/chat-store';
import { enableElectronMode, mockElectronAPI } from '../../../setup';

// Mock dependencies
jest.mock('@/lib/store/chat-store');
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => true),
}));

describe('FileExplorer', () => {
  const mockSetWorkingDirectory = jest.fn();
  const mockOpenFile = jest.fn();
  const mockLoadWorkingDirectory = jest.fn();
  let storeState = createStore();
  const createStore = (overrides: Record<string, any> = {}) => ({
    workingDirectory: null,
    setWorkingDirectory: mockSetWorkingDirectory,
    openFile: mockOpenFile,
    activeFilePath: null,
    loadWorkingDirectory: mockLoadWorkingDirectory,
    fileTreeRefreshTrigger: 0,
    refreshFileTree: jest.fn(),
    expandedFolderPaths: new Set<string>(),
    clearExpandedFolders: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();

    storeState = createStore();
    (useChatStore as unknown as jest.Mock).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(storeState);
      }
      return storeState;
    });
    (useChatStore as any).getState = () => storeState;
  });

  describe('초기 렌더링', () => {
    it('디렉토리 선택 전 기본 상태를 표시해야 함', () => {
      render(<FileExplorer />);

      expect(screen.getByText('Working Directory')).toBeInTheDocument();
      expect(screen.getByTitle('디렉토리 선택')).toBeInTheDocument();
      expect(screen.getAllByText('디렉토리를 선택하세요')).toHaveLength(2); // Header + empty state
      expect(screen.getByText('파일 탐색을 시작합니다')).toBeInTheDocument();
    });

    it('디렉토리 선택 버튼이 렌더링되어야 함', () => {
      render(<FileExplorer />);

      const selectButton = screen.getByTitle('디렉토리 선택');
      expect(selectButton).toBeInTheDocument();
    });
  });

  describe('디렉토리 선택', () => {
    it('디렉토리 선택 성공 시 working directory를 설정해야 함', async () => {
      const user = userEvent.setup();
      render(<FileExplorer />);

      (mockElectronAPI.file.selectDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: '/test/directory',
      });

      const selectButton = screen.getByTitle('디렉토리 선택');
      await user.click(selectButton);

      await waitFor(() => {
        expect(mockSetWorkingDirectory).toHaveBeenCalledWith('/test/directory');
      });
    });

    it('디렉토리 선택 실패 시 에러를 처리해야 함', async () => {
      const user = userEvent.setup();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      render(<FileExplorer />);

      (mockElectronAPI.file.selectDirectory as jest.Mock).mockRejectedValue(
        new Error('Selection failed')
      );

      const selectButton = screen.getByTitle('디렉토리 선택');
      await user.click(selectButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[FileExplorer] Failed to select directory:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('디렉토리 선택 취소 시 아무 작업도 하지 않아야 함', async () => {
      const user = userEvent.setup();
      render(<FileExplorer />);

      (mockElectronAPI.file.selectDirectory as jest.Mock).mockResolvedValue({
        success: false,
      });

      const selectButton = screen.getByTitle('디렉토리 선택');
      await user.click(selectButton);

      await waitFor(() => {
        expect(mockSetWorkingDirectory).not.toHaveBeenCalled();
      });
    });
  });

  describe('파일 트리 표시', () => {
    beforeEach(() => {
      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [
          { name: 'folder1', path: '/test/folder1', isDirectory: true },
          { name: 'file1.ts', path: '/test/file1.ts', isDirectory: false },
          { name: 'file2.js', path: '/test/file2.js', isDirectory: false },
        ],
      });
    });

    it('working directory 설정 시 파일 트리를 로드해야 함', async () => {
      const { rerender } = render(<FileExplorer />);

      storeState = createStore({
        workingDirectory: '/test/directory',
      });

      rerender(<FileExplorer />);

      await waitFor(() => {
        expect(mockElectronAPI.fs.readDirectory).toHaveBeenCalledWith('/test/directory');
        expect(screen.getByText('folder1')).toBeInTheDocument();
        expect(screen.getByText('file1.ts')).toBeInTheDocument();
        expect(screen.getByText('file2.js')).toBeInTheDocument();
      });
    });

    it('로딩 중 상태를 표시해야 함', async () => {
      (mockElectronAPI.fs.readDirectory as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: [] }), 100))
      );

      const { rerender } = render(<FileExplorer />);

      storeState = createStore({
        workingDirectory: '/test/directory',
      });

      rerender(<FileExplorer />);

      expect(screen.getByText('로딩 중...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();
      });
    });

    it('빈 디렉토리 상태를 표시해야 함', async () => {
      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      const { rerender } = render(<FileExplorer />);

      storeState = createStore({
        workingDirectory: '/test/empty',
      });

      rerender(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('빈 디렉토리')).toBeInTheDocument();
      });
    });

    it('선택된 working directory 경로를 표시해야 함', () => {
      storeState = createStore({
        workingDirectory: '/home/user/projects/my-app',
      });

      render(<FileExplorer />);

      expect(screen.getByText('/home/user/projects/my-app')).toBeInTheDocument();
    });
  });

  describe('폴더 확장/축소', () => {
    beforeEach(() => {
      (mockElectronAPI.fs.readDirectory as jest.Mock).mockImplementation((path: string) => {
        if (path === '/test/directory') {
          return Promise.resolve({
            success: true,
            data: [
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
            ],
          });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      storeState = createStore({
        workingDirectory: '/test/directory',
      });
    });

    it('폴더 클릭 시 자식이 표시/숨겨져야 함', async () => {
      const user = userEvent.setup();
      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
      });

      // 초기에는 자식이 숨겨져 있음
      expect(screen.queryByText('nested.js')).not.toBeInTheDocument();

      const folderButton = screen.getByText('folder1');

      // 확장
      await user.click(folderButton);
      await waitFor(() => {
        expect(screen.getByText('nested.js')).toBeInTheDocument();
      });

      // 축소
      await user.click(folderButton);
      await waitFor(() => {
        expect(screen.queryByText('nested.js')).not.toBeInTheDocument();
      });
    });
  });

  describe('파일 클릭', () => {
    beforeEach(() => {
      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [
          { name: 'test.ts', path: '/test/test.ts', isDirectory: false },
          { name: 'script.js', path: '/test/script.js', isDirectory: false },
          { name: 'data.json', path: '/test/data.json', isDirectory: false },
          { name: 'readme.md', path: '/test/readme.md', isDirectory: false },
        ],
      });

      storeState = createStore({
        workingDirectory: '/test',
      });
    });

    it('파일 클릭 시 파일을 읽고 openFile을 호출해야 함', async () => {
      const user = userEvent.setup();
      (mockElectronAPI.fs.readFile as jest.Mock).mockResolvedValue({
        success: true,
        data: 'const test = "Hello";',
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('test.ts')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('test.ts');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockElectronAPI.fs.readFile).toHaveBeenCalledWith('/test/test.ts');
        expect(mockOpenFile).toHaveBeenCalledWith({
          path: '/test/test.ts',
          filename: 'test.ts',
          content: 'const test = "Hello";',
          language: 'typescript',
        });
      });
    });

    it('JavaScript 파일의 언어를 올바르게 감지해야 함', async () => {
      const user = userEvent.setup();
      (mockElectronAPI.fs.readFile as jest.Mock).mockResolvedValue({
        success: true,
        data: 'console.log("test");',
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('script.js')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('script.js');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'javascript',
          })
        );
      });
    });

    it('JSON 파일의 언어를 올바르게 감지해야 함', async () => {
      const user = userEvent.setup();
      (mockElectronAPI.fs.readFile as jest.Mock).mockResolvedValue({
        success: true,
        data: '{"test": true}',
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('data.json')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('data.json');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'json',
          })
        );
      });
    });

    it('Markdown 파일의 언어를 올바르게 감지해야 함', async () => {
      const user = userEvent.setup();
      (mockElectronAPI.fs.readFile as jest.Mock).mockResolvedValue({
        success: true,
        data: '# Test',
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('readme.md')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('readme.md');
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'markdown',
          })
        );
      });
    });

    it('파일 읽기 실패 시 에러를 처리해야 함', async () => {
      const user = userEvent.setup();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (mockElectronAPI.fs.readFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('test.ts')).toBeInTheDocument();
      });

      const fileButton = screen.getByText('test.ts');
      await user.click(fileButton);

      await waitFor(() => {
        // useFileSystem logs first, then FileExplorer
        expect(consoleSpy).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('[FileExplorer] Failed to read file');
      });

      consoleSpy.mockRestore();
    });
  });

  describe('활성 파일 하이라이트', () => {
    it('활성 파일에 하이라이트 스타일이 적용되어야 함', async () => {
      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [
          { name: 'active.ts', path: '/test/active.ts', isDirectory: false },
          { name: 'inactive.ts', path: '/test/inactive.ts', isDirectory: false },
        ],
      });

      storeState = createStore({
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
      const user = userEvent.setup();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockImplementation((path: string) => {
        if (path === '/test') {
          return Promise.resolve({
            success: true,
            data: [{ name: 'error-folder', path: '/test/error-folder', isDirectory: true }],
          });
        }
        return Promise.reject(new Error('Permission denied'));
      });

      storeState = createStore({
        workingDirectory: '/test',
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText('error-folder')).toBeInTheDocument();
      });

      const folderButton = screen.getByText('error-folder');
      await user.click(folderButton);

      await waitFor(() => {
        // useFileSystem logs the error
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('에러 처리', () => {
    it('loadFileTree 에러 시 로딩 상태가 해제되어야 함', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockRejectedValue(new Error('Network error'));

      storeState = createStore({
        workingDirectory: '/test',
      });

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

  describe('새 파일/폴더 버튼', () => {
    it('working directory가 없으면 버튼이 비활성화되어야 함', () => {
      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      const newFolderButton = screen.getByTitle('새 폴더');

      expect(newFileButton).toBeDisabled();
      expect(newFolderButton).toBeDisabled();
    });

    it('working directory가 있으면 버튼이 활성화되어야 함', () => {
      storeState = createStore({
        workingDirectory: '/test',
      });

      render(<FileExplorer />);

      const newFileButton = screen.getByTitle('새 파일');
      const newFolderButton = screen.getByTitle('새 폴더');

      expect(newFileButton).toBeEnabled();
      expect(newFolderButton).toBeEnabled();
    });

    it('새 파일 버튼 클릭 시 dialog가 열려야 함', async () => {
      const user = userEvent.setup();
      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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

      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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

      storeState = createStore({
        workingDirectory: '/test',
      });

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
      storeState = createStore({
        workingDirectory: '/test',
      });

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
      (mockElectronAPI.fs.readFile as jest.Mock).mockResolvedValue({
        success: true,
        data: 'test content',
      });

      storeState = createStore({
        workingDirectory: '/test',
      });
    });

    const testLanguageDetection = async (filename: string, expectedLanguage: string) => {
      const user = userEvent.setup();

      (mockElectronAPI.fs.readDirectory as jest.Mock).mockResolvedValue({
        success: true,
        data: [{ name: filename, path: `/test/${filename}`, isDirectory: false }],
      });

      render(<FileExplorer />);

      await waitFor(() => {
        expect(screen.getByText(filename)).toBeInTheDocument();
      });

      const fileButton = screen.getByText(filename);
      await user.click(fileButton);

      await waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith(
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
      const { isElectron } = require('@/lib/platform');
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Temporarily set isElectron to false
      (isElectron as jest.Mock).mockReturnValue(false);

      render(<FileExplorer />);

      const selectButton = screen.getByTitle('디렉토리 선택');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[FileExplorer] Directory selection is only available in Electron'
        );
      });

      // Restore
      (isElectron as jest.Mock).mockReturnValue(true);
      consoleWarnSpy.mockRestore();
    });

    it('should warn when trying to create file without name', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      storeState = createStore({
        workingDirectory: '/test',
      });

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

    it('should warn when trying to create folder without name', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      storeState = createStore({
        workingDirectory: '/test',
      });

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
