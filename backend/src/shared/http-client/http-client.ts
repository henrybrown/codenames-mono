/**
 * HttpClient — thin typed wrapper around native fetch
 *
 * An infra primitive sitting alongside db and logging. Constructed once
 * at the application root and injected into features that need to call
 * external HTTP services.
 *
 * Responsibilities:
 *   - HTTP method, JSON headers, body serialization
 *   - Status check + uniform error reporting (HttpError)
 *   - Response JSON parsing into a caller-supplied type
 *   - Per-call or default timeout via AbortSignal.timeout
 *
 * Non-responsibilities:
 *   - Retries, circuit breakers, request signing → callers
 *   - URL construction → callers (they know their own routes)
 *   - Auth header values → callers (they know their own auth scheme)
 */

import type { AppLogger } from "@backend/shared/logging";

/** Plain header bag — string values only, case-insensitive by HTTP convention. */
export type HttpHeaders = Record<string, string>;

export interface HttpRequestOptions {
  /** Additional headers merged on top of `Content-Type: application/json`. */
  headers?: HttpHeaders;
  /**
   * Timeout in ms for this call. Falls back to client default if omitted.
   * Use 0 to disable the timeout (not recommended).
   */
  timeoutMs?: number;
  /**
   * Label used in error messages, e.g. "Anthropic" or "Ollama". Improves
   * log/exception readability when several upstream services share a client.
   */
  source?: string;
}

export interface HttpClient {
  /** POST a JSON body, parse a JSON response into `T`. */
  postJson: <T>(url: string, body: unknown, options?: HttpRequestOptions) => Promise<T>;
  /** GET a JSON response, parse into `T`. */
  getJson: <T>(url: string, options?: HttpRequestOptions) => Promise<T>;
}

export interface HttpClientConfig {
  /** Default timeout in ms applied when a request omits one. Default 60_000. */
  defaultTimeoutMs?: number;
}

/**
 * Thrown for any non-2xx response or transport-level failure.
 * Caller code can `instanceof HttpError` to distinguish from parse errors.
 *
 * `status === 0` indicates a transport-level failure (DNS, connection refused,
 * timeout). Any other value is the upstream HTTP status.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly source: string;
  readonly responseBody: string;

  constructor(args: {
    message: string;
    status: number;
    url: string;
    source: string;
    responseBody: string;
  }) {
    super(args.message);
    this.name = "HttpError";
    this.status = args.status;
    this.url = args.url;
    this.source = args.source;
    this.responseBody = args.responseBody;
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;
const JSON_HEADERS: HttpHeaders = { "Content-Type": "application/json" };

/**
 * Builds the shared HTTP client.
 *
 * Wraps native `fetch` with JSON serialization, status-based error
 * raising (`HttpError`), timeout via `AbortSignal.timeout`, and uniform
 * debug logging. Transport failures are normalized into `HttpError` with
 * `status: 0` so callers only need one error branch.
 */
export const createHttpClient = (
  logger: AppLogger,
  config: HttpClientConfig = {},
): HttpClient => {
  const log = logger.for({ module: "http-client" }).create();
  const defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  const buildSignal = (timeoutMs: number | undefined): AbortSignal | undefined => {
    const ms = timeoutMs ?? defaultTimeoutMs;
    if (ms <= 0) return undefined;
    return AbortSignal.timeout(ms);
  };

  const formatError = async (
    response: Response,
    url: string,
    source: string,
  ): Promise<HttpError> => {
    let body = "";
    try {
      body = await response.text();
    } catch {
      /* ignore — body unreadable, we still report status */
    }
    return new HttpError({
      message: `${source} HTTP ${response.status} ${response.statusText} (${url})`,
      status: response.status,
      url,
      source,
      responseBody: body,
    });
  };

  const wrapTransportError = (
    error: unknown,
    url: string,
    source: string,
  ): HttpError => {
    const message = error instanceof Error ? error.message : String(error);
    // AbortSignal.timeout produces a TimeoutError DOMException
    const isTimeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return new HttpError({
      message: isTimeout
        ? `${source} request timed out (${url})`
        : `${source} request failed: ${message} (${url})`,
      status: 0,
      url,
      source,
      responseBody: "",
    });
  };

  const postJson = async <T>(
    url: string,
    body: unknown,
    options: HttpRequestOptions = {},
  ): Promise<T> => {
    const source = options.source ?? "http";
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { ...JSON_HEADERS, ...(options.headers ?? {}) },
        body: JSON.stringify(body),
        signal: buildSignal(options.timeoutMs),
      });
    } catch (error) {
      const wrapped = wrapTransportError(error, url, source);
      log.debug("postJson transport error", {
        source,
        url,
        elapsedMs: Date.now() - startedAt,
        error: wrapped.message,
      });
      throw wrapped;
    }

    if (!response.ok) {
      const httpError = await formatError(response, url, source);
      log.debug("postJson non-ok response", {
        source,
        url,
        status: httpError.status,
        elapsedMs: Date.now() - startedAt,
      });
      throw httpError;
    }

    return (await response.json()) as T;
  };

  const getJson = async <T>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<T> => {
    const source = options.source ?? "http";
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { ...(options.headers ?? {}) },
        signal: buildSignal(options.timeoutMs),
      });
    } catch (error) {
      const wrapped = wrapTransportError(error, url, source);
      log.debug("getJson transport error", {
        source,
        url,
        elapsedMs: Date.now() - startedAt,
        error: wrapped.message,
      });
      throw wrapped;
    }

    if (!response.ok) {
      const httpError = await formatError(response, url, source);
      log.debug("getJson non-ok response", {
        source,
        url,
        status: httpError.status,
        elapsedMs: Date.now() - startedAt,
      });
      throw httpError;
    }

    return (await response.json()) as T;
  };

  return { postJson, getJson };
};
