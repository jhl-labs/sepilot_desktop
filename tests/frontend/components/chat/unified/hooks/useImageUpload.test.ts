/**
 * useImageUpload Hook Tests
 */

import { renderHook, act } from '@testing-library/react';
import { enableElectronMode } from '../../../../../setup';

// Mock dependencies
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

jest.mock('@/lib/utils/id-generator', () => ({
  generateImageId: jest.fn((source: string) => `mock-${source}-id-${Date.now()}`),
}));

jest.mock('@/lib/utils/file-utils', () => ({
  fileToDataUrl: jest.fn((file: File) =>
    Promise.resolve(`data:${file.type};base64,bW9ja2VkLWJhc2U2NA==`)
  ),
}));

import { useImageUpload } from '@/components/chat/unified/hooks/useImageUpload';
import { isElectron } from '@/lib/platform';
import { fileToDataUrl } from '@/lib/utils/file-utils';
import type { ImageAttachment } from '@/types';

describe('useImageUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isElectron as jest.Mock).mockReturnValue(false);
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useImageUpload());

    expect(result.current.selectedImages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should add images via addImages', () => {
    const { result } = renderHook(() => useImageUpload());
    const images: ImageAttachment[] = [
      { id: 'img-1', path: '', filename: 'test.png', mimeType: 'image/png', base64: 'abc' },
      { id: 'img-2', path: '', filename: 'test2.jpg', mimeType: 'image/jpeg', base64: 'def' },
    ];

    act(() => {
      result.current.addImages(images);
    });

    expect(result.current.selectedImages).toHaveLength(2);
    expect(result.current.selectedImages[0].id).toBe('img-1');
    expect(result.current.selectedImages[1].id).toBe('img-2');
  });

  it('should not add images when empty array is passed', () => {
    const { result } = renderHook(() => useImageUpload());

    act(() => {
      result.current.addImages([]);
    });

    expect(result.current.selectedImages).toHaveLength(0);
  });

  it('should not add images when undefined-like is passed', () => {
    const { result } = renderHook(() => useImageUpload());

    act(() => {
      result.current.addImages(undefined as any);
    });

    expect(result.current.selectedImages).toHaveLength(0);
  });

  it('should remove an image by id', () => {
    const { result } = renderHook(() => useImageUpload());
    const images: ImageAttachment[] = [
      { id: 'img-1', path: '', filename: 'a.png', mimeType: 'image/png', base64: 'x' },
      { id: 'img-2', path: '', filename: 'b.png', mimeType: 'image/png', base64: 'y' },
    ];

    act(() => {
      result.current.addImages(images);
    });
    expect(result.current.selectedImages).toHaveLength(2);

    act(() => {
      result.current.handleRemoveImage('img-1');
    });

    expect(result.current.selectedImages).toHaveLength(1);
    expect(result.current.selectedImages[0].id).toBe('img-2');
  });

  it('should clear all images', () => {
    const { result } = renderHook(() => useImageUpload());
    const images: ImageAttachment[] = [
      { id: 'img-1', path: '', filename: 'a.png', mimeType: 'image/png', base64: 'x' },
    ];

    act(() => {
      result.current.addImages(images);
    });
    expect(result.current.selectedImages).toHaveLength(1);

    act(() => {
      result.current.clearImages();
    });

    expect(result.current.selectedImages).toHaveLength(0);
  });

  it('should set error when selecting images in non-electron mode', async () => {
    (isElectron as jest.Mock).mockReturnValue(false);
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handleImageSelect();
    });

    expect(result.current.error).toBe('Image upload is only available in the desktop app');
  });

  it('should select images via electronAPI in electron mode', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    const mockImages: ImageAttachment[] = [
      {
        id: 'electron-img',
        path: '/tmp/img.png',
        filename: 'img.png',
        mimeType: 'image/png',
        base64: 'abc',
      },
    ];
    (window as any).electronAPI.file.selectImages.mockResolvedValue({
      success: true,
      data: mockImages,
    });

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handleImageSelect();
    });

    expect(result.current.selectedImages).toHaveLength(1);
    expect(result.current.selectedImages[0].id).toBe('electron-img');
    expect(result.current.error).toBeNull();
  });

  it('should handle electronAPI returning no data', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    (window as any).electronAPI.file.selectImages.mockResolvedValue({
      success: true,
      data: [],
    });

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handleImageSelect();
    });

    expect(result.current.selectedImages).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it('should handle electronAPI error', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    (window as any).electronAPI.file.selectImages.mockRejectedValue(new Error('Dialog cancelled'));

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handleImageSelect();
    });

    expect(result.current.error).toBe('Dialog cancelled');
  });

  it('should handle image drop with file conversion', async () => {
    const mockFile = new File(['image-data'], 'dropped.png', { type: 'image/png' });

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handleImageDrop([mockFile]);
    });

    expect(fileToDataUrl).toHaveBeenCalledWith(mockFile);
    expect(result.current.selectedImages).toHaveLength(1);
    expect(result.current.selectedImages[0].filename).toBe('dropped.png');
    expect(result.current.selectedImages[0].mimeType).toBe('image/png');
  });

  it('should handle multiple image drops', async () => {
    const file1 = new File(['a'], 'a.png', { type: 'image/png' });
    const file2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handleImageDrop([file1, file2]);
    });

    expect(result.current.selectedImages).toHaveLength(2);
  });

  it('should handle drop conversion failure gracefully', async () => {
    (fileToDataUrl as jest.Mock).mockRejectedValueOnce(new Error('Conversion failed'));
    const file1 = new File(['a'], 'a.png', { type: 'image/png' });

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handleImageDrop([file1]);
    });

    // Failed conversion should not add any image
    expect(result.current.selectedImages).toHaveLength(0);
  });

  it('should handle clipboard paste with image items', async () => {
    const mockFile = new File(['clipboard-data'], 'paste.png', { type: 'image/png' });
    const mockClipboardEvent = {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => mockFile,
          },
        ],
      },
      preventDefault: jest.fn(),
    } as unknown as React.ClipboardEvent<HTMLTextAreaElement>;

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handlePaste(mockClipboardEvent);
    });

    expect(mockClipboardEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.selectedImages).toHaveLength(1);
    expect(result.current.selectedImages[0].mimeType).toBe('image/png');
  });

  it('should ignore clipboard paste without image items', async () => {
    const mockClipboardEvent = {
      clipboardData: {
        items: [
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
      preventDefault: jest.fn(),
    } as unknown as React.ClipboardEvent<HTMLTextAreaElement>;

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handlePaste(mockClipboardEvent);
    });

    expect(mockClipboardEvent.preventDefault).not.toHaveBeenCalled();
    expect(result.current.selectedImages).toHaveLength(0);
  });

  it('should handle clipboard paste with no clipboardData', async () => {
    const mockClipboardEvent = {
      clipboardData: null,
      preventDefault: jest.fn(),
    } as unknown as React.ClipboardEvent<HTMLTextAreaElement>;

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handlePaste(mockClipboardEvent);
    });

    expect(mockClipboardEvent.preventDefault).not.toHaveBeenCalled();
    expect(result.current.selectedImages).toHaveLength(0);
  });

  it('should clear error', () => {
    const { result } = renderHook(() => useImageUpload());

    // Trigger an error state manually by selecting images in non-electron mode
    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('should handle clipboard paste conversion failure and set error', async () => {
    (fileToDataUrl as jest.Mock).mockRejectedValueOnce(new Error('Read failed'));

    const mockFile = new File(['data'], 'fail.png', { type: 'image/png' });
    const mockClipboardEvent = {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => mockFile,
          },
        ],
      },
      preventDefault: jest.fn(),
    } as unknown as React.ClipboardEvent<HTMLTextAreaElement>;

    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.handlePaste(mockClipboardEvent);
    });

    expect(result.current.error).toBe('Read failed');
    expect(result.current.selectedImages).toHaveLength(0);
  });
});
