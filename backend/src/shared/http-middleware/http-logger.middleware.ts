import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { AppLogger } from "@backend/shared/logging";
import crypto from "crypto";

/** `Request` augmented with a per-request correlation id. */
export interface TrackedRequest extends Request {
  id?: string;
}

type HttpLoggerConfig = {
  enabled: boolean;
  verbose: boolean;
  toConsole: boolean;
};

const extractRequestMetaMinimal = (req: Request) => ({
  method: req.method,
  path: req.path,
});

const extractRequestMetaVerbose = (req: Request) => ({
  method: req.method,
  path: req.path,
  url: req.originalUrl,
  params: req.params,
  query: req.query,
  body: req.body,
  ip: req.ip,
  userAgent: req.get("user-agent"),
  contentType: req.get("content-type"),
  contentLength: req.get("content-length"),
});

const extractResponseMetaMinimal = (res: Response) => ({
  statusCode: res.statusCode,
});

const extractResponseMetaVerbose = (res: Response, body?: unknown) => ({
  statusCode: res.statusCode,
  statusMessage: res.statusMessage,
  contentType: res.get("content-type"),
  contentLength: res.get("content-length"),
  body,
});

/**
 * Builds the HTTP request/response logging middleware.
 *
 * When enabled, stamps each request with a correlation id (`req.id`),
 * emits a `request_received` event on entry, and emits
 * `request_completed` on response `finish` with the elapsed duration.
 *
 * Verbose mode captures full request/response payloads (params, query,
 * body, headers, response body) at `http` level; non-verbose mode
 * records method, path and status at `info` level. Response level is
 * upgraded to `warn` for 4xx and `error` for 5xx regardless of mode.
 *
 * When `toConsole` is false the events are written to the file
 * transport only — useful for keeping noisy verbose traffic out of
 * the console while still preserving it on disk.
 */
export const httpLoggerMiddleware = (config: HttpLoggerConfig) => (logger: AppLogger) => {
  const httpLogger = logger.for({ middleware: "http-logger" }).create();

  return (req: TrackedRequest, res: Response, next: NextFunction) => {
    if (!config.enabled) return next();

    const start = Date.now();
    req.id = req.id ?? crypto.randomUUID();
    const reqId = req.id;

    const level = config.verbose ? "http" : "info";
    const fileOnly = !config.toConsole;

    httpLogger[level]("request_received", {
      fileOnly,
      meta: {
        reqId,
        userId: req.auth?.user?.id,
        request: config.verbose ? extractRequestMetaVerbose(req) : extractRequestMetaMinimal(req),
      },
    });

    let responseBody: unknown;
    if (config.verbose) {
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        responseBody = body;
        return originalJson(body);
      };
    }

    res.on("finish", () => {
      const durationMs = Date.now() - start;

      const responseLevel =
        res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : level;

      httpLogger[responseLevel]("request_completed", {
        fileOnly,
        meta: {
          reqId,
          userId: req.auth?.user?.id,
          durationMs,
          request: extractRequestMetaMinimal(req),
          response: config.verbose
            ? extractResponseMetaVerbose(res, responseBody)
            : extractResponseMetaMinimal(res),
        },
      });
    });

    next();
  };
};

/** Configured HTTP logger middleware factory — call with a logger to attach. */
export type HttpLoggerHandler = ReturnType<typeof httpLoggerMiddleware>;
