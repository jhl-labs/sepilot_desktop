/**
 * FileTreeItem 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileTreeItem, FileNode } from '@/components/layout/FileTreeItem';
import * as useFileSystemModule from '@/hooks/use-file-system';

// Mock useFileSystem hook
const mockDeleteItem = jest.fn();
const mockRenameItem = jest.fn();
const mockReadDirectory = jest.fn();

jest.mock('@/hooks/use-file-system', () => ({
  useFileSystem: jest.fn(() => ({
    deleteItem: mockDeleteItem,
    renameItem: mockRenameItem,
    readDirectory: mockReadDirectory,
    isAvailable: true,
  })),
}));

// Mock window functions
const originalConfirm = window.confirm;
const originalAlert = window.alert;

describe('FileTreeItem Component', () => {
  const mockOnFileClick = jest.fn();
  const mockOnRefresh = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    window.alert = originalAlert;
  });

  describe('File Rendering', () => {
    it('should render file node', () => {
      const fileNode: FileNode = {
        name: 'test.txt',
        path: '/test.txt',
        isDirectory: false,
      };

      render(
        <FileTreeItem
          node={fileNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    it('should render active file with highlighted style', () => {
      const fileNode: FileNode = {
        name: 'active.txt',
        path: '/active.txt',
        isDirectory: false,
      };

      render(
        <FileTreeItem
          node={fileNode}
          level={0}
          isActive={true}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      const button = screen.getByText('active.txt').closest('button');
      expect(button).toHaveClass('bg-accent');
    });

    it('should call onFileClick when file is clicked', () => {
      const fileNode: FileNode = {
        name: 'clickable.txt',
        path: '/clickable.txt',
        isDirectory: false,
      };

      render(
        <FileTreeItem
          node={fileNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      const button = screen.getByText('clickable.txt');
      fireEvent.click(button);

      expect(mockOnFileClick).toHaveBeenCalledWith('/clickable.txt', 'clickable.txt');
    });
  });

  describe('Directory Rendering', () => {
    it('should render directory node', () => {
      const dirNode: FileNode = {
        name: 'folder',
        path: '/folder',
        isDirectory: true,
      };

      render(
        <FileTreeItem
          node={dirNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      expect(screen.getByText('folder')).toBeInTheDocument();
    });

    it('should expand directory when clicked', () => {
      const dirNode: FileNode = {
        name: 'folder',
        path: '/folder',
        isDirectory: true,
        children: [
          { name: 'child.txt', path: '/folder/child.txt', isDirectory: false },
        ],
      };

      render(
        <FileTreeItem
          node={dirNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      const folderButton = screen.getByText('folder');
      fireEvent.click(folderButton);

      expect(screen.getByText('child.txt')).toBeInTheDocument();
    });

    it('should lazy load directory children', async () => {
      const dirNode: FileNode = {
        name: 'lazy-folder',
        path: '/lazy-folder',
        isDirectory: true,
      };

      mockReadDirectory.mockResolvedValue([
        { name: 'lazy-child.txt', path: '/lazy-folder/lazy-child.txt', isDirectory: false },
      ]);

      render(
        <FileTreeItem
          node={dirNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      const folderButton = screen.getByText('lazy-folder');
      fireEvent.click(folderButton);

      await waitFor(() => {
        expect(mockReadDirectory).toHaveBeenCalledWith('/lazy-folder');
      });
    });
  });

  describe('Context Menu Actions', () => {
    it('should call deleteItem when delete is confirmed', async () => {
      mockDeleteItem.mockResolvedValue(true);

      const fileNode: FileNode = {
        name: 'delete-test.txt',
        path: '/delete-test.txt',
        isDirectory: false,
      };

      render(
        <FileTreeItem
          node={fileNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      const trigger = screen.getByText('delete-test.txt');
      fireEvent.contextMenu(trigger);

      const deleteMenuItem = screen.getByText('삭제');
      fireEvent.click(deleteMenuItem);

      await waitFor(() => {
        expect(mockDeleteItem).toHaveBeenCalledWith('/delete-test.txt');
        expect(mockOnRefresh).toHaveBeenCalled();
      });
    });

    it('should not delete when user cancels confirmation', async () => {
      window.confirm = jest.fn(() => false);

      const fileNode: FileNode = {
        name: 'cancel-delete.txt',
        path: '/cancel-delete.txt',
        isDirectory: false,
      };

      render(
        <FileTreeItem
          node={fileNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      const trigger = screen.getByText('cancel-delete.txt');
      fireEvent.contextMenu(trigger);

      const deleteMenuItem = screen.getByText('삭제');
      fireEvent.click(deleteMenuItem);

      await waitFor(() => {
        expect(mockDeleteItem).not.toHaveBeenCalled();
      });
    });

    it('should show alert when delete fails', async () => {
      mockDeleteItem.mockResolvedValue(false);

      const fileNode: FileNode = {
        name: 'fail-delete.txt',
        path: '/fail-delete.txt',
        isDirectory: false,
      };

      render(
        <FileTreeItem
          node={fileNode}
          level={0}
          isActive={false}
          onFileClick={mockOnFileClick}
          onRefresh={mockOnRefresh}
          parentPath="/"
        />
      );

      const trigger = screen.getByText('fail-delete.txt');
      fireEvent.contextMenu(trigger);

      const deleteMenuItem = screen.getByText('삭제');
      fireEvent.click(deleteMenuItem);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('삭제 실패');
      });
    });
  });

});
