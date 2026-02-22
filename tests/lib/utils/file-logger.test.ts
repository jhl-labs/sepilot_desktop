describe('file-logger', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  function loadWithMocks(options?: {
    appValue?: any;
    existingPaths?: Record<string, boolean>;
    fileSize?: number;
  }) {
    const existingPaths = options?.existingPaths ?? {};
    const fileSize = options?.fileSize ?? 0;

    const writeMock = jest.fn();
    const endMock = jest.fn();
    const onMock = jest.fn();

    const fsMock = {
      existsSync: jest.fn((p: string) => !!existingPaths[p]),
      mkdirSync: jest.fn(),
      statSync: jest.fn(() => ({ size: fileSize })),
      renameSync: jest.fn(),
      createWriteStream: jest.fn(() => ({
        write: writeMock,
        end: endMock,
        on: onMock,
      })),
    };

    const appValue =
      options?.appValue === undefined
        ? {
            getPath: jest.fn(() => '/mock-user-data'),
          }
        : options.appValue;

    jest.doMock('fs', () => ({
      __esModule: true,
      default: fsMock,
      ...fsMock,
    }));

    jest.doMock('electron', () => ({
      app: appValue,
    }));

    const mod = require('@/lib/utils/file-logger');
    return { ...mod, fsMock, writeMock, endMock, onMock, appValue };
  }

  it('should skip init when electron app is unavailable', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { initFileLogger, fileLogger } = loadWithMocks({ appValue: null });

    initFileLogger();

    expect(warnSpy).toHaveBeenCalledWith(
      '[FileLogger] Not in Electron environment, skipping file logger init'
    );
    expect(fileLogger.getLogPath()).toBeNull();
  });

  it('should initialize logger and create logs directory when missing', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { initFileLogger, fileLogger, fsMock, appValue, onMock, writeMock } = loadWithMocks({
      existingPaths: {
        '/mock-user-data/logs': false,
        '/mock-user-data/logs/extension-loading.log': false,
      },
    });

    initFileLogger();

    expect(appValue.getPath).toHaveBeenCalledWith('userData');
    expect(fsMock.mkdirSync).toHaveBeenCalledWith('/mock-user-data/logs', { recursive: true });
    expect(fsMock.createWriteStream).toHaveBeenCalledWith('/mock-user-data/logs/extension-loading.log', {
      flags: 'a',
    });
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
    expect(fileLogger.getLogPath()).toBe('/mock-user-data/logs/extension-loading.log');
    expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('Extension Loading Log Session Started'));
    expect(logSpy).toHaveBeenCalledWith(
      '[FileLogger] Initialized. Log file: /mock-user-data/logs/extension-loading.log'
    );
  });

  it('should rotate existing log file when size exceeds max threshold', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(12345);

    const { initFileLogger, fsMock } = loadWithMocks({
      existingPaths: {
        '/mock-user-data/logs': true,
        '/mock-user-data/logs/extension-loading.log': true,
      },
      fileSize: 11 * 1024 * 1024,
    });

    initFileLogger();

    expect(fsMock.statSync).toHaveBeenCalledWith('/mock-user-data/logs/extension-loading.log');
    expect(fsMock.renameSync).toHaveBeenCalledWith(
      '/mock-user-data/logs/extension-loading.log',
      '/mock-user-data/logs/extension-loading.log.12345.bak'
    );

    nowSpy.mockRestore();
  });

  it('should write logs through fileLogger methods and close stream', () => {
    process.env.NODE_ENV = 'development';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { initFileLogger, closeFileLogger, fileLogger, writeMock, endMock } = loadWithMocks();

    initFileLogger();
    writeMock.mockClear();

    fileLogger.debug('Ctx', 'debug-msg', { a: 1 });
    fileLogger.info('Ctx', 'info-msg');
    fileLogger.warn('Ctx', 'warn-msg', 'extra');
    fileLogger.error('Ctx', 'error-msg', new Error('boom'));

    expect(writeMock).toHaveBeenCalledTimes(4);
    expect(writeMock.mock.calls[0][0]).toContain('[DEBUG]');
    expect(writeMock.mock.calls[1][0]).toContain('[INFO ]');
    expect(writeMock.mock.calls[2][0]).toContain('[WARN ]');
    expect(writeMock.mock.calls[3][0]).toContain('Error: boom');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO ] [Ctx] info-msg'));

    closeFileLogger();
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it('should not write debug logs outside development', () => {
    process.env.NODE_ENV = 'production';
    const { initFileLogger, fileLogger, writeMock } = loadWithMocks();

    initFileLogger();
    writeMock.mockClear();

    fileLogger.debug('Ctx', 'debug-msg');

    expect(writeMock).not.toHaveBeenCalled();
  });
});
