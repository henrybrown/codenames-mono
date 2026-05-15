import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import util from "util";

export type LogLevel = "debug" | "info" | "warn" | "error" | "http";

export type AppLoggerConfig = {
  logFilePath: string;
  level: LogLevel;
  consoleLevel: LogLevel | "silent";
  logDir: string;
};

const LOG_SCOPE_KEYS = [
  "app",
  "module",
  "feature",
  "service",
  "controller",
  "api",
  "middleware",
  "server",
] as const;

export type LogScope = {
  [K in (typeof LOG_SCOPE_KEYS)[number]]?: string;
};

export type LogMeta = Record<string, unknown>;

export type LogOptions = {
  meta?: LogMeta;
  fileOnly?: boolean; // When true, log only to file, not console
};

const orderedFormat = winston.format.printf(({ level, message, timestamp, meta, ...rest }) => {
  const ordered: Record<string, unknown> = { timestamp, level };

  const knownKeys = new Set<string>(LOG_SCOPE_KEYS);

  for (const key of LOG_SCOPE_KEYS) {
    if (rest[key] !== undefined) ordered[key] = rest[key];
  }

  ordered.message = message;
  if (meta !== undefined) ordered.meta = meta;

  for (const [key, value] of Object.entries(rest)) {
    if (!knownKeys.has(key) && value !== undefined) {
      ordered[key] = value;
    }
  }

  return JSON.stringify(ordered);
});

export const consoleFormat = winston.format.printf(
  ({ level, message, timestamp, meta, ...rest }) => {
    const scope = LOG_SCOPE_KEYS.filter((key) => rest[key] !== undefined)
      .map((key) => rest[key])
      .join(":");

    const prefix = scope ? `[${scope}] ` : "";

    const metaStr = meta
      ? `\n  ↳ ${util.inspect(meta, { colors: true, depth: null }).replace(/\n/g, "\n    ")}`
      : "";

    return `${timestamp} ${level} ${prefix}${message}${metaStr}`;
  },
);

/**
 * Builder for creating scoped AppLogger instances.
 * Accumulates scope other props until create() is called.
 */
export class LoggerBuilder {
  private logData: LogScope & { meta?: LogMeta } = {};
  private consoleOverride?: LogLevel;

  constructor(private readonly logger: winston.Logger) {}

  for(scope: LogScope): this {
    Object.assign(this.logData, scope);
    return this;
  }

  withMeta(meta: LogMeta): this {
    this.logData.meta ??= {};
    Object.assign(this.logData.meta, meta);
    return this;
  }

  toConsole(level: LogLevel = "info"): this {
    this.consoleOverride = level;
    return this;
  }

  create(): AppLogger {
    const childLogger = this.logger.child(this.logData);
    return new AppLogger(childLogger);
  }
}

/**
 * Application logger wrapping winston with structured scope support
 */
export class AppLogger {
  constructor(private readonly logger: winston.Logger) {}

  private logWithOptions(level: LogLevel, message: string, options?: LogMeta | LogOptions) {
    // Support both old API (meta object) and new API (options with meta and fileOnly)
    if (options && "fileOnly" in options) {
      const { meta, fileOnly } = options;
      this.logger[level](message, { meta, fileOnly });
    } else {
      this.logger[level](message, options ? { meta: options } : undefined);
    }
  }

  info(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("info", message, options);
  }

  warn(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("warn", message, options);
  }

  error(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("error", message, options);
  }

  debug(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("debug", message, options);
  }

  http(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("http", message, options);
  }

  for(scope: LogScope): LoggerBuilder {
    return new LoggerBuilder(this.logger).for(scope);
  }
}

export const createAppLogger = (config: AppLoggerConfig): AppLogger => {
  const transports: winston.transport[] = [
    new DailyRotateFile({
      filename: "codenames-backend-%DATE%.log.jsonl",
      dirname: config.logDir,
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "2d",
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        orderedFormat,
      ),
    }),
  ];

  if (config.consoleLevel !== "silent") {
    transports.push(
      new winston.transports.Console({
        level: config.consoleLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          // Filter out http level logs and fileOnly logs from console
          winston.format((info) => {
            if (info.level === "http") return false;
            if (info.fileOnly) return false;
            return info;
          })(),
          consoleFormat,
        ),
      }),
    );
  }

  const rootLogger = winston.createLogger({
    level: config.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
    ),
    transports,
  });

  return new AppLogger(rootLogger);
};
