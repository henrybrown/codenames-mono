import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import util from "util";

/** Supported log severities — `http` is reserved for request/response traces. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "http";

/** Configuration for the root application logger. */
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

/**
 * Structured scope tags attached to every log entry — surfaces in both
 * the JSON file output and the console prefix so events can be filtered
 * by `app`/`module`/`feature`/etc. without parsing the message.
 */
export type LogScope = {
  [K in (typeof LOG_SCOPE_KEYS)[number]]?: string;
};

/** Free-form structured metadata serialised alongside a log entry. */
export type LogMeta = Record<string, unknown>;

/** Options accepted by every log method on `AppLogger`. */
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

/** Console output formatter — emits a single-line `timestamp level [scope] message` line. */
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
 * Fluent builder that accumulates scope tags and metadata before
 * materialising a child `AppLogger`.
 *
 * Each chained call mutates the in-progress descriptor; `create()`
 * forks a winston child logger so subsequent log calls automatically
 * carry the accumulated scope.
 */
export class LoggerBuilder {
  private logData: LogScope & { meta?: LogMeta } = {};
  private consoleOverride?: LogLevel;

  constructor(private readonly logger: winston.Logger) {}

  /** Merge additional scope tags into the in-progress descriptor. */
  for(scope: LogScope): this {
    Object.assign(this.logData, scope);
    return this;
  }

  /** Merge additional structured metadata onto every log entry. */
  withMeta(meta: LogMeta): this {
    this.logData.meta ??= {};
    Object.assign(this.logData.meta, meta);
    return this;
  }

  /** Force this scope to be visible on the console at the given level. */
  toConsole(level: LogLevel = "info"): this {
    this.consoleOverride = level;
    return this;
  }

  /** Materialise the configured child logger. */
  create(): AppLogger {
    const childLogger = this.logger.child(this.logData);
    return new AppLogger(childLogger);
  }
}

/**
 * Structured application logger.
 *
 * Wraps a winston logger to provide level-specific methods that accept
 * either a plain meta object (legacy form) or an options object with
 * `meta` and a `fileOnly` flag that suppresses console output for that
 * specific entry.
 *
 * Use `.for({ scope })` to begin building a child logger with
 * accumulated scope tags.
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

  /** Log an `info` event. */
  info(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("info", message, options);
  }

  /** Log a `warn` event. */
  warn(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("warn", message, options);
  }

  /** Log an `error` event. */
  error(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("error", message, options);
  }

  /** Log a `debug` event. */
  debug(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("debug", message, options);
  }

  /** Log an `http` event — filtered from console output by default. */
  http(message: string, options?: LogMeta | LogOptions) {
    this.logWithOptions("http", message, options);
  }

  /** Begin a fluent builder seeded with the given scope tags. */
  for(scope: LogScope): LoggerBuilder {
    return new LoggerBuilder(this.logger).for(scope);
  }
}

/**
 * Build the root `AppLogger`.
 *
 * Always attaches a rotating JSON-lines file transport (daily rotation,
 * 20MB max, 2-day retention). When `consoleLevel` is not `"silent"`,
 * also attaches a colourised console transport that filters out `http`
 * level events and any entry tagged `fileOnly: true`.
 */
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
