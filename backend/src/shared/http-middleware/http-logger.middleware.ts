import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { AppLogger } from "@backend/shared/logging";
import crypto from "crypto";

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

export type HttpLoggerHandler = ReturnType<typeof httpLoggerMiddleware>;
