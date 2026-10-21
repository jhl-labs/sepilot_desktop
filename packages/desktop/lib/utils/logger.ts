export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

interface LogRecord {
  level: LogLevel
  name: string
  message: string
  detail?: Record<string, unknown>
  timestamp: string
}

export interface LoggerOptions {
  name: string
  level?: LogLevel
  sink?: (record: LogRecord) => void
}

const defaultSink = (record: LogRecord): void => {
  const fn =
    record.level === 'error'
      ? console.error
      : record.level === 'warn'
        ? console.warn
        : console.log
  fn(
    `[${record.timestamp}] ${record.level.toUpperCase()} ${record.name}: ${record.message}`,
    record.detail ?? '',
  )
}

export function createLogger(opts: LoggerOptions) {
  const threshold = ORDER[opts.level ?? 'info']
  const sink = opts.sink ?? defaultSink
  const emit = (
    level: LogLevel,
    message: string,
    detail?: Record<string, unknown>,
  ): void => {
    if (ORDER[level] < threshold) return
    sink({
      level,
      name: opts.name,
      message,
      detail,
      timestamp: new Date().toISOString(),
    })
  }
  return {
    debug: (message: string, detail?: Record<string, unknown>) =>
      emit('debug', message, detail),
    info: (message: string, detail?: Record<string, unknown>) =>
      emit('info', message, detail),
    warn: (message: string, detail?: Record<string, unknown>) =>
      emit('warn', message, detail),
    error: (message: string, detail?: Record<string, unknown>) =>
      emit('error', message, detail),
  }
}
