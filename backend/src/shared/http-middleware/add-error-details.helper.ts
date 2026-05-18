import { Request } from "express";

/** Tag for one of the optional fields a feature error response may include. */
export type ErrorDetailField = "error" | "cause" | "reqBody" | "stack";

/** Maximal feature-error detail shape; individual responses include a subset. */
export type AdditionalErrorDetails = {
  error: string;
  cause: unknown;
  reqBody: unknown;
  stack: Record<string, string>;
};

/**
 * Builds the `details` object attached to feature error responses.
 *
 * The stack is split per-frame into a numbered map so dev-mode JSON
 * responses render readably without escaping newlines. Pass `exclude` to
 * omit specific fields (e.g. don't echo `reqBody` for endpoints that
 * accept secrets).
 */
export const generateAdditionalErrorInfo = (
  err: Error,
  req: Request,
  exclude: ErrorDetailField[] = [],
): Partial<AdditionalErrorDetails> => {
  const result: Partial<AdditionalErrorDetails> = {};

  if (!exclude.includes("error")) {
    result.error = err.message;
  }

  if (!exclude.includes("cause")) {
    result.cause = err.cause;
  }

  if (!exclude.includes("reqBody")) {
    result.reqBody = req.body;
  }

  if (!exclude.includes("stack") && err.stack) {
    result.stack = Object.fromEntries(
      err.stack.split("\n").map((value, index) => {
        return [index.toString(), value];
      }),
    );
  }

  return result;
};
