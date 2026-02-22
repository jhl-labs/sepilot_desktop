/**
 * SearchPanel 컴포넌트 테스트
 *
 * 파일 검색 UI 및 검색 기능을 테스트합니다.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SearchPanel } from '@/extensions/editor/components/SearchPanel';
import { useExtensionAPIContext } from '@sepilot/extension-sdk';

const mockOpenFile = jest.fn();
const mockSearchFiles = jest.fn();
const mockReadFile = jest.fn();

const createMockContext = (overrides: any = {}) => ({
  chat: {
    messages: [],
    addMessage: jest.fn(),
    updateMessage: jest.fn(),
    ...overrides.chat,
  },
  workspace: {
    workingDirectory: null,
    readFile: mockReadFile,
    ...overrides.workspace,
  },
  files: {
    openFile: mockOpenFile,
    openFiles: [],
    searchFiles: mockSearchFiles,
    ...overrides.files,
  },
  ipc: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    ...overrides.ipc,
  },
});

describe('SearchPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Enable Electron mode via extension SDK mock
    const sdkUtils = require('@sepilot/extension-sdk/utils');
    (sdkUtils.isElectron as jest.Mock).mockReturnValue(true);
  });

  describe('작업 디렉토리 없음', () => {
    beforeEach(() => {
      const mockContext = createMockContext({
        workspace: { workingDirectory: null, readFile: mockReadFile },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
    });

    it('작업 디렉토리 설정 안내 메시지가 표시되어야 함', () => {
      render(<SearchPanel />);

      expect(screen.getByText('작업 디렉토리를 먼저 설정하세요')).toBeInTheDocument();
      expect(screen.getByText(/Files 탭에서 폴더 아이콘을 클릭하여/)).toBeInTheDocument();
    });
  });

  describe('작업 디렉토리 설정됨', () => {
    beforeEach(() => {
      const mockContext = createMockContext({
        workspace: { workingDirectory: '/test/project', readFile: mockReadFile },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
    });

    it('검색 입력 필드가 렌더링되어야 함', () => {
      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      expect(searchInput).toBeInTheDocument();
    });

    it('검색 옵션 체크박스가 렌더링되어야 함', () => {
      render(<SearchPanel />);

      expect(screen.getByText('Aa')).toBeInTheDocument();
      expect(screen.getByText('단어')).toBeInTheDocument();
      expect(screen.getByText('.*')).toBeInTheDocument();
    });

    it('Enter 키 입력 시 검색이 실행되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: {
          query: 'test',
          totalFiles: 1,
          totalMatches: 1,
          results: [
            {
              file: '/test/project/file.ts',
              matches: [{ line: 10, column: 5, text: 'test function' }],
            },
          ],
        },
      });

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockSearchFiles).toHaveBeenCalledWith('test', '/test/project', {
          caseSensitive: false,
          wholeWord: false,
          useRegex: false,
        });
      });
    });

    it('빈 검색어로는 검색이 실행되지 않아야 함', async () => {
      render(<SearchPanel />);

      expect(mockSearchFiles).not.toHaveBeenCalled();
    });
  });

  describe('검색 결과 표시', () => {
    beforeEach(() => {
      const mockContext = createMockContext({
        workspace: { workingDirectory: '/test/project', readFile: mockReadFile },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
    });

    it('검색 결과가 표시되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: {
          query: 'function',
          totalFiles: 2,
          totalMatches: 3,
          results: [
            {
              file: '/test/project/file1.ts',
              matches: [
                { line: 10, column: 5, text: 'function test()' },
                { line: 20, column: 5, text: 'function hello()' },
              ],
            },
            {
              file: '/test/project/file2.js',
              matches: [{ line: 5, column: 1, text: 'function world()' }],
            },
          ],
        },
      });

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'function');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('2개 파일에서 3개 결과 발견')).toBeInTheDocument();
      });

      expect(screen.getByText('file1.ts')).toBeInTheDocument();
      expect(screen.getByText('file2.js')).toBeInTheDocument();
    });

    it('검색 결과 없음 메시지가 표시되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: {
          query: 'nonexistent',
          totalFiles: 0,
          totalMatches: 0,
          results: [],
        },
      });

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'nonexistent');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/검색 결과가 없습니다/)).toBeInTheDocument();
      });
    });

    it('파일 확장/축소가 동작해야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: {
          query: 'test',
          totalFiles: 1,
          totalMatches: 2,
          results: [
            {
              file: '/test/project/file.ts',
              matches: [
                { line: 10, column: 5, text: 'test function' },
                { line: 20, column: 5, text: 'test code' },
              ],
            },
          ],
        },
      });

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('file.ts')).toBeInTheDocument();
      });

      // 기본적으로 펼쳐져 있어야 함
      expect(screen.getByText('test function')).toBeInTheDocument();
      expect(screen.getByText('test code')).toBeInTheDocument();

      // 파일명 클릭하여 접기
      const fileName = screen.getByText('file.ts');
      await user.click(fileName);

      await waitFor(() => {
        expect(screen.queryByText('test function')).not.toBeInTheDocument();
      });

      // 다시 클릭하여 펼치기
      await user.click(fileName);

      await waitFor(() => {
        expect(screen.getByText('test function')).toBeInTheDocument();
      });
    });

    it('매치 클릭 시 파일이 열려야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: {
          query: 'test',
          totalFiles: 1,
          totalMatches: 1,
          results: [
            {
              file: '/test/project/test.ts',
              matches: [{ line: 10, column: 5, text: 'test function' }],
            },
          ],
        },
      });

      mockReadFile.mockResolvedValue('const test = "Hello";');

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('test function')).toBeInTheDocument();
      });

      const matchText = screen.getByText('test function');
      await user.click(matchText);

      await waitFor(() => {
        expect(mockReadFile).toHaveBeenCalledWith('/test/project/test.ts');
        expect(mockOpenFile).toHaveBeenCalledWith({
          path: '/test/project/test.ts',
          filename: 'test.ts',
          content: 'const test = "Hello";',
          language: 'typescript',
          initialPosition: {
            lineNumber: 10,
            column: 5,
          },
        });
      });
    });
  });

  describe('검색 옵션', () => {
    beforeEach(() => {
      const mockContext = createMockContext({
        workspace: { workingDirectory: '/test/project', readFile: mockReadFile },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
    });

    it('대소문자 구분 옵션이 전달되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: { query: 'Test', totalFiles: 0, totalMatches: 0, results: [] },
      });

      render(<SearchPanel />);

      const aaLabel = screen.getByText('Aa');
      const caseSensitiveCheckbox = aaLabel
        .closest('label')
        ?.querySelector('input[type="checkbox"]');

      if (caseSensitiveCheckbox) {
        await user.click(caseSensitiveCheckbox);
      }

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'Test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockSearchFiles).toHaveBeenCalledWith('Test', '/test/project', {
          caseSensitive: true,
          wholeWord: false,
          useRegex: false,
        });
      });
    });

    it('전체 단어 옵션이 전달되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: { query: 'test', totalFiles: 0, totalMatches: 0, results: [] },
      });

      render(<SearchPanel />);

      const wordLabel = screen.getByText('단어');
      const wholeWordCheckbox = wordLabel.closest('label')?.querySelector('input[type="checkbox"]');

      if (wholeWordCheckbox) {
        await user.click(wholeWordCheckbox);
      }

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockSearchFiles).toHaveBeenCalledWith('test', '/test/project', {
          caseSensitive: false,
          wholeWord: true,
          useRegex: false,
        });
      });
    });

    it('정규식 옵션이 전달되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: true,
        data: { query: 'test.*', totalFiles: 0, totalMatches: 0, results: [] },
      });

      render(<SearchPanel />);

      const regexLabel = screen.getByText('.*');
      const regexCheckbox = regexLabel.closest('label')?.querySelector('input[type="checkbox"]');

      if (regexCheckbox) {
        await user.click(regexCheckbox);
      }

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test.*');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockSearchFiles).toHaveBeenCalledWith('test.*', '/test/project', {
          caseSensitive: false,
          wholeWord: false,
          useRegex: true,
        });
      });
    });
  });

  describe('에러 처리', () => {
    beforeEach(() => {
      const mockContext = createMockContext({
        workspace: { workingDirectory: '/test/project', readFile: mockReadFile },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
    });

    it('검색 실패 시 에러 메시지가 표시되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockResolvedValue({
        success: false,
        error: 'Search failed: Permission denied',
      });

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/Permission denied/)).toBeInTheDocument();
      });
    });

    it('예외 발생 시 에러 메시지가 표시되어야 함', async () => {
      const user = userEvent.setup();
      mockSearchFiles.mockRejectedValue(new Error('Network error'));

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });

  describe('파일 열기 에러', () => {
    beforeEach(() => {
      const mockContext = createMockContext({
        workspace: { workingDirectory: '/test/project', readFile: mockReadFile },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
    });

    it('파일 열기 실패 시 에러를 처리해야 함', async () => {
      const user = userEvent.setup();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockSearchFiles.mockResolvedValue({
        success: true,
        data: {
          query: 'test',
          totalFiles: 1,
          totalMatches: 1,
          results: [
            {
              file: '/test/project/test.ts',
              matches: [{ line: 10, column: 5, text: 'test function' }],
            },
          ],
        },
      });

      mockReadFile.mockRejectedValue(new Error('File read error'));

      render(<SearchPanel />);

      const searchInput = screen.getByPlaceholderText('검색어 입력...');
      await user.type(searchInput, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('test function')).toBeInTheDocument();
      });

      const matchText = screen.getByText('test function');
      await user.click(matchText);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });
});
