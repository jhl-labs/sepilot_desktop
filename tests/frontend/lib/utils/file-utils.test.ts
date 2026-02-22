import { extractBase64FromDataUrl, fileToBase64, fileToDataUrl } from '@/lib/utils/file-utils';

describe('file-utils', () => {
  const originalFileReader = global.FileReader;

  afterEach(() => {
    global.FileReader = originalFileReader;
    jest.restoreAllMocks();
  });

  function mockFileReader(result: unknown, triggerError = false) {
    class MockFileReader {
      onload: ((event: { target: { result: unknown } }) => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(_file: File) {
        if (triggerError) {
          this.onerror?.();
          return;
        }
        this.onload?.({ target: { result } });
      }
    }

    global.FileReader = MockFileReader as unknown as typeof FileReader;
  }

  it('fileToDataUrl should resolve with data url when reader returns string', async () => {
    mockFileReader('data:text/plain;base64,SGVsbG8=');

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await expect(fileToDataUrl(file)).resolves.toBe('data:text/plain;base64,SGVsbG8=');
  });

  it('fileToDataUrl should reject when reader result is not string', async () => {
    mockFileReader(new ArrayBuffer(8));

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await expect(fileToDataUrl(file)).rejects.toThrow('Failed to read file as data URL');
  });

  it('fileToDataUrl should reject on FileReader error', async () => {
    mockFileReader(null, true);

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await expect(fileToDataUrl(file)).rejects.toThrow('Failed to read file');
  });

  it('fileToBase64 should extract payload after comma', async () => {
    mockFileReader('data:image/png;base64,YWJjZA==');

    const file = new File(['abcd'], 'sample.png', { type: 'image/png' });
    await expect(fileToBase64(file)).resolves.toBe('YWJjZA==');
  });

  it('fileToBase64 should return empty string when data url has no comma', async () => {
    mockFileReader('invalid-data-url-without-comma');

    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    await expect(fileToBase64(file)).resolves.toBe('');
  });

  it('extractBase64FromDataUrl should return base64 or original value', () => {
    expect(extractBase64FromDataUrl('data:text/plain;base64,SGVsbG8=')).toBe('SGVsbG8=');
    expect(extractBase64FromDataUrl('raw-base64')).toBe('raw-base64');
  });
});
