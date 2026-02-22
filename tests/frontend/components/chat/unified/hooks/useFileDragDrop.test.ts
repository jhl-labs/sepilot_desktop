/**
 * useFileDragDrop Hook Tests
 */

import { renderHook, act } from '@testing-library/react';

// Mock dependencies
jest.mock('@/lib/utils', () => ({
  isTextFile: jest.fn((file: File) => {
    return (
      file.type.startsWith('text/') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.json') ||
      file.name.endsWith('.ts') ||
      file.name.endsWith('.js')
    );
  }),
}));

jest.mock('@/lib/utils/id-generator', () => ({
  generateImageId: jest.fn((source: string) => `mock-${source}-id`),
}));

jest.mock('@/lib/utils/file-utils', () => ({
  fileToDataUrl: jest.fn((file: File) => Promise.resolve(`data:${file.type};base64,bW9ja2Vk`)),
}));

import { useFileDragDrop } from '@/components/chat/unified/hooks/useFileDragDrop';
import { isTextFile } from '@/lib/utils';
import { fileToDataUrl } from '@/lib/utils/file-utils';

describe('useFileDragDrop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with isDragging false', () => {
    const { result } = renderHook(() => useFileDragDrop());

    expect(result.current.isDragging).toBe(false);
  });

  it('should update isDragging state', () => {
    const { result } = renderHook(() => useFileDragDrop());

    act(() => {
      result.current.setIsDragging(true);
    });

    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.setIsDragging(false);
    });

    expect(result.current.isDragging).toBe(false);
  });

  it('should handle text file drop', async () => {
    const textFile = new File(['Hello World'], 'readme.txt', { type: 'text/plain' });
    const onTextAttachments = jest.fn();
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([textFile], onTextAttachments, onImageDrop);
    });

    expect(onTextAttachments).toHaveBeenCalledTimes(1);
    const textAttachments = onTextAttachments.mock.calls[0][0];
    expect(textAttachments).toHaveLength(1);
    expect(textAttachments[0].filename).toBe('readme.txt');
    expect(textAttachments[0].content).toBe('Hello World');
    expect(textAttachments[0].size).toBe(textFile.size);
    expect(onImageDrop).not.toHaveBeenCalled();
  });

  it('should handle image file drop', async () => {
    (isTextFile as jest.Mock).mockReturnValue(false);
    const imageFile = new File(['img-data'], 'photo.png', { type: 'image/png' });
    const onTextAttachments = jest.fn();
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([imageFile], onTextAttachments, onImageDrop);
    });

    expect(onImageDrop).toHaveBeenCalledTimes(1);
    const images = onImageDrop.mock.calls[0][0];
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('photo.png');
    expect(images[0].mimeType).toBe('image/png');
    expect(fileToDataUrl).toHaveBeenCalledWith(imageFile);
    expect(onTextAttachments).not.toHaveBeenCalled();
  });

  it('should handle mixed file drop (text + image)', async () => {
    // Reset mock to use real-like behavior
    (isTextFile as jest.Mock).mockImplementation((file: File) => {
      return file.type.startsWith('text/') || file.name.endsWith('.md');
    });

    const textFile = new File(['# Title'], 'doc.md', { type: 'text/markdown' });
    const imageFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    const onTextAttachments = jest.fn();
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([textFile, imageFile], onTextAttachments, onImageDrop);
    });

    expect(onTextAttachments).toHaveBeenCalledTimes(1);
    expect(onTextAttachments.mock.calls[0][0]).toHaveLength(1);
    expect(onImageDrop).toHaveBeenCalledTimes(1);
    expect(onImageDrop.mock.calls[0][0]).toHaveLength(1);
  });

  it('should skip unsupported file types', async () => {
    (isTextFile as jest.Mock).mockReturnValue(false);
    const binaryFile = new File(['binary'], 'data.bin', { type: 'application/octet-stream' });
    const onTextAttachments = jest.fn();
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([binaryFile], onTextAttachments, onImageDrop);
    });

    expect(onTextAttachments).not.toHaveBeenCalled();
    expect(onImageDrop).not.toHaveBeenCalled();
  });

  it('should handle empty file list', async () => {
    const onTextAttachments = jest.fn();
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([], onTextAttachments, onImageDrop);
    });

    expect(onTextAttachments).not.toHaveBeenCalled();
    expect(onImageDrop).not.toHaveBeenCalled();
  });

  it('should handle file processing failure gracefully', async () => {
    (isTextFile as jest.Mock).mockReturnValue(false);
    (fileToDataUrl as jest.Mock).mockRejectedValueOnce(new Error('Read error'));

    const imageFile = new File(['data'], 'broken.png', { type: 'image/png' });
    const onTextAttachments = jest.fn();
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([imageFile], onTextAttachments, onImageDrop);
    });

    // Failed file should be skipped, not cause crash
    expect(onImageDrop).not.toHaveBeenCalled();
  });

  it('should work without callbacks', async () => {
    (isTextFile as jest.Mock).mockReturnValue(true);
    const textFile = new File(['content'], 'file.txt', { type: 'text/plain' });

    const { result } = renderHook(() => useFileDragDrop());

    // Should not throw even without callbacks
    await act(async () => {
      await result.current.handleFileDrop([textFile]);
    });
  });

  it('should handle multiple text files', async () => {
    (isTextFile as jest.Mock).mockReturnValue(true);
    const file1 = new File(['content1'], 'file1.ts', { type: 'text/typescript' });
    const file2 = new File(['content2'], 'file2.js', { type: 'text/javascript' });
    const file3 = new File(['content3'], 'file3.json', { type: 'application/json' });
    const onTextAttachments = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([file1, file2, file3], onTextAttachments);
    });

    expect(onTextAttachments).toHaveBeenCalledTimes(1);
    const attachments = onTextAttachments.mock.calls[0][0];
    expect(attachments).toHaveLength(3);
    expect(attachments[0].filename).toBe('file1.ts');
    expect(attachments[1].filename).toBe('file2.js');
    expect(attachments[2].filename).toBe('file3.json');
  });

  it('should handle multiple image files', async () => {
    (isTextFile as jest.Mock).mockReturnValue(false);
    const img1 = new File(['a'], 'a.png', { type: 'image/png' });
    const img2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([img1, img2], undefined, onImageDrop);
    });

    expect(onImageDrop).toHaveBeenCalledTimes(1);
    const images = onImageDrop.mock.calls[0][0];
    expect(images).toHaveLength(2);
  });

  it('should assign unique ids to text attachments', async () => {
    (isTextFile as jest.Mock).mockReturnValue(true);
    const file = new File(['data'], 'test.txt', { type: 'text/plain' });
    const onTextAttachments = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([file], onTextAttachments);
    });

    const attachment = onTextAttachments.mock.calls[0][0][0];
    expect(attachment.id).toBeDefined();
    expect(typeof attachment.id).toBe('string');
    expect(attachment.id.startsWith('file-')).toBe(true);
  });

  it('should handle partial failure in mixed files', async () => {
    // First file is text (succeeds), second is image (fails conversion)
    (isTextFile as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);
    (fileToDataUrl as jest.Mock).mockRejectedValueOnce(new Error('Conversion error'));

    const textFile = new File(['text'], 'doc.txt', { type: 'text/plain' });
    const imageFile = new File(['img'], 'broken.png', { type: 'image/png' });
    const onTextAttachments = jest.fn();
    const onImageDrop = jest.fn();

    const { result } = renderHook(() => useFileDragDrop());

    await act(async () => {
      await result.current.handleFileDrop([textFile, imageFile], onTextAttachments, onImageDrop);
    });

    // Text should still succeed
    expect(onTextAttachments).toHaveBeenCalledTimes(1);
    // Image conversion failed, so no images
    expect(onImageDrop).not.toHaveBeenCalled();
  });
});
