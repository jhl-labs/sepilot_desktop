import { getMimeTypeByExtension, getMimeTypeByFile } from '@/lib/utils/mime-types';

describe('mime-types', () => {
  it('getMimeTypeByExtension should resolve known extensions case-insensitively', () => {
    expect(getMimeTypeByExtension('.jpg')).toBe('image/jpeg');
    expect(getMimeTypeByExtension('.PNG')).toBe('image/png');
  });

  it('getMimeTypeByExtension should fallback for unknown extensions', () => {
    expect(getMimeTypeByExtension('.unknown')).toBe('application/octet-stream');
  });

  it('getMimeTypeByFile should prefer file.type when provided', () => {
    const file = new File(['x'], 'photo.jpg', { type: 'custom/type' });
    expect(getMimeTypeByFile(file)).toBe('custom/type');
  });

  it('getMimeTypeByFile should detect type by filename extension when type is empty', () => {
    const file = new File(['x'], 'image.webp', { type: '' });
    expect(getMimeTypeByFile(file)).toBe('image/webp');
  });

  it('getMimeTypeByFile should fallback when extension is missing or unknown', () => {
    const noExtFile = new File(['x'], 'README', { type: '' });
    const unknownExtFile = new File(['x'], 'archive.xyz', { type: '' });

    expect(getMimeTypeByFile(noExtFile)).toBe('application/octet-stream');
    expect(getMimeTypeByFile(unknownExtFile)).toBe('application/octet-stream');
  });
});
