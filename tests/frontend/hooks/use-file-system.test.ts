/**
 * useFileSystem Hook 테스트
 */

import { renderHook, act } from '@testing-library/react';
import { useFileSystem } from '@/hooks/use-file-system';
import * as platformModule from '@/lib/platform';

// Mock platform module
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(),
}));

describe('useFileSystem Hook', () => {
  const mockElectronAPI = {
    fs: {
      createFile: jest.fn(),
      createDirectory: jest.fn(),
      delete: jest.fn(),
      rename: jest.fn(),
      readFile: jest.fn(),
      readDirectory: jest.fn(),
    },
  };

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();

    // Default: Electron is available
    (platformModule.isElectron as jest.Mock).mockReturnValue(true);
    (window as any).electronAPI = mockElectronAPI;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    delete (window as any).electronAPI;
  });

  describe('isAvailable', () => {
    it('should return true when Electron and electronAPI are available', () => {
      const { result } = renderHook(() => useFileSystem());

      expect(result.current.isAvailable).toBe(true);
    });

    it('should return false when not in Electron', () => {
      (platformModule.isElectron as jest.Mock).mockReturnValue(false);

      const { result } = renderHook(() => useFileSystem());

      expect(result.current.isAvailable).toBe(false);
    });

    it('should return false when electronAPI is not available', () => {
      delete (window as any).electronAPI;

      const { result } = renderHook(() => useFileSystem());

      expect(result.current.isAvailable).toBe(false);
    });
  });

  describe('createFile', () => {
    it('should create file successfully', async () => {
      mockElectronAPI.fs.createFile.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useFileSystem());

      let createResult: boolean = false;
      await act(async () => {
        createResult = await result.current.createFile('/test/file.txt', 'content');
      });

      expect(createResult).toBe(true);
      expect(mockElectronAPI.fs.createFile).toHaveBeenCalledWith('/test/file.txt', 'content');
    });

    it('should handle default empty content', async () => {
      mockElectronAPI.fs.createFile.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.createFile('/test/file.txt');
      });

      expect(mockElectronAPI.fs.createFile).toHaveBeenCalledWith('/test/file.txt', '');
    });

    it('should return false when not available', async () => {
      (platformModule.isElectron as jest.Mock).mockReturnValue(false);

      const { result } = renderHook(() => useFileSystem());

      let createResult: boolean = true;
      await act(async () => {
        createResult = await result.current.createFile('/test/file.txt');
      });

      expect(createResult).toBe(false);
      expect(console.warn).toHaveBeenCalledWith('[FileSystem] Not available in browser mode');
    });

    it('should handle createFile error', async () => {
      mockElectronAPI.fs.createFile.mockResolvedValue({
        success: false,
        error: 'Permission denied',
      });

      const { result } = renderHook(() => useFileSystem());

      let createResult: boolean = true;
      await act(async () => {
        createResult = await result.current.createFile('/test/file.txt');
      });

      expect(createResult).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle exception during createFile', async () => {
      mockElectronAPI.fs.createFile.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useFileSystem());

      let createResult: boolean = true;
      await act(async () => {
        createResult = await result.current.createFile('/test/file.txt');
      });

      expect(createResult).toBe(false);
    });
  });

  describe('createDirectory', () => {
    it('should create directory successfully', async () => {
      mockElectronAPI.fs.createDirectory.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useFileSystem());

      let createResult: boolean = false;
      await act(async () => {
        createResult = await result.current.createDirectory('/test/dir');
      });

      expect(createResult).toBe(true);
      expect(mockElectronAPI.fs.createDirectory).toHaveBeenCalledWith('/test/dir');
    });

    it('should return false when not available', async () => {
      (platformModule.isElectron as jest.Mock).mockReturnValue(false);

      const { result } = renderHook(() => useFileSystem());

      let createResult: boolean = true;
      await act(async () => {
        createResult = await result.current.createDirectory('/test/dir');
      });

      expect(createResult).toBe(false);
    });

    it('should handle createDirectory error', async () => {
      mockElectronAPI.fs.createDirectory.mockResolvedValue({
        success: false,
        error: 'Already exists',
      });

      const { result } = renderHook(() => useFileSystem());

      let createResult: boolean = true;
      await act(async () => {
        createResult = await result.current.createDirectory('/test/dir');
      });

      expect(createResult).toBe(false);
    });
  });

  describe('deleteItem', () => {
    it('should delete item successfully', async () => {
      mockElectronAPI.fs.delete.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useFileSystem());

      let deleteResult: boolean = false;
      await act(async () => {
        deleteResult = await result.current.deleteItem('/test/file.txt');
      });

      expect(deleteResult).toBe(true);
      expect(mockElectronAPI.fs.delete).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should return false when not available', async () => {
      (platformModule.isElectron as jest.Mock).mockReturnValue(false);

      const { result } = renderHook(() => useFileSystem());

      let deleteResult: boolean = true;
      await act(async () => {
        deleteResult = await result.current.deleteItem('/test/file.txt');
      });

      expect(deleteResult).toBe(false);
    });

    it('should handle delete error', async () => {
      mockElectronAPI.fs.delete.mockResolvedValue({ success: false, error: 'Not found' });

      const { result } = renderHook(() => useFileSystem());

      let deleteResult: boolean = true;
      await act(async () => {
        deleteResult = await result.current.deleteItem('/test/file.txt');
      });

      expect(deleteResult).toBe(false);
    });
  });

  describe('renameItem', () => {
    it('should rename item successfully', async () => {
      mockElectronAPI.fs.rename.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useFileSystem());

      let renameResult: boolean = false;
      await act(async () => {
        renameResult = await result.current.renameItem('/old.txt', '/new.txt');
      });

      expect(renameResult).toBe(true);
      expect(mockElectronAPI.fs.rename).toHaveBeenCalledWith('/old.txt', '/new.txt');
    });

    it('should return false when not available', async () => {
      (platformModule.isElectron as jest.Mock).mockReturnValue(false);

      const { result } = renderHook(() => useFileSystem());

      let renameResult: boolean = true;
      await act(async () => {
        renameResult = await result.current.renameItem('/old.txt', '/new.txt');
      });

      expect(renameResult).toBe(false);
    });

    it('should handle rename error', async () => {
      mockElectronAPI.fs.rename.mockResolvedValue({ success: false, error: 'Permission denied' });

      const { result } = renderHook(() => useFileSystem());

      let renameResult: boolean = true;
      await act(async () => {
        renameResult = await result.current.renameItem('/old.txt', '/new.txt');
      });

      expect(renameResult).toBe(false);
    });
  });

  describe('readFile', () => {
    it('should read file successfully', async () => {
      mockElectronAPI.fs.readFile.mockResolvedValue({ success: true, data: 'file content' });

      const { result } = renderHook(() => useFileSystem());

      let fileContent: string | null = null;
      await act(async () => {
        fileContent = await result.current.readFile('/test/file.txt');
      });

      expect(fileContent).toBe('file content');
      expect(mockElectronAPI.fs.readFile).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should return null when not available', async () => {
      (platformModule.isElectron as jest.Mock).mockReturnValue(false);

      const { result } = renderHook(() => useFileSystem());

      let fileContent: string | null = 'should be null';
      await act(async () => {
        fileContent = await result.current.readFile('/test/file.txt');
      });

      expect(fileContent).toBeNull();
    });

    it('should handle readFile error', async () => {
      mockElectronAPI.fs.readFile.mockResolvedValue({ success: false, error: 'Not found' });

      const { result } = renderHook(() => useFileSystem());

      let fileContent: string | null = 'should be null';
      await act(async () => {
        fileContent = await result.current.readFile('/test/file.txt');
      });

      expect(fileContent).toBeNull();
    });

    it('should handle exception during readFile', async () => {
      mockElectronAPI.fs.readFile.mockRejectedValue(new Error('Read error'));

      const { result } = renderHook(() => useFileSystem());

      let fileContent: string | null = 'should be null';
      await act(async () => {
        fileContent = await result.current.readFile('/test/file.txt');
      });

      expect(fileContent).toBeNull();
    });
  });

  describe('readDirectory', () => {
    it('should read directory successfully', async () => {
      const dirData = [
        { name: 'file1.txt', isDirectory: false },
        { name: 'dir1', isDirectory: true },
      ];
      mockElectronAPI.fs.readDirectory.mockResolvedValue({ success: true, data: dirData });

      const { result } = renderHook(() => useFileSystem());

      let dirContent: any[] | null = null;
      await act(async () => {
        dirContent = await result.current.readDirectory('/test/dir');
      });

      expect(dirContent).toEqual(dirData);
      expect(mockElectronAPI.fs.readDirectory).toHaveBeenCalledWith('/test/dir');
    });

    it('should return null when not available', async () => {
      (platformModule.isElectron as jest.Mock).mockReturnValue(false);

      const { result } = renderHook(() => useFileSystem());

      let dirContent: any[] | null = [];
      await act(async () => {
        dirContent = await result.current.readDirectory('/test/dir');
      });

      expect(dirContent).toBeNull();
    });

    it('should handle readDirectory error', async () => {
      mockElectronAPI.fs.readDirectory.mockResolvedValue({
        success: false,
        error: 'Permission denied',
      });

      const { result } = renderHook(() => useFileSystem());

      let dirContent: any[] | null = [];
      await act(async () => {
        dirContent = await result.current.readDirectory('/test/dir');
      });

      expect(dirContent).toBeNull();
    });

    it('should handle exception during readDirectory', async () => {
      mockElectronAPI.fs.readDirectory.mockRejectedValue(new Error('Read error'));

      const { result } = renderHook(() => useFileSystem());

      let dirContent: any[] | null = [];
      await act(async () => {
        dirContent = await result.current.readDirectory('/test/dir');
      });

      expect(dirContent).toBeNull();
    });
  });
});
