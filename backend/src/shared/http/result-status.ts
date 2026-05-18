/**
 * Status hint flags carried on service failure results.
 *
 * `notFound` and `conflict` are mutually advisory — `notFound` maps to
 * 404, `conflict` to 409, and absence of both to 400.
 */
export type ResultStatusFlags = {
  readonly notFound?: boolean;
  readonly conflict?: boolean;
};

/**
 * Maps a failure variant's flags to an HTTP status code.
 *
 * Precedence: `notFound` (404) → `conflict` (409) → generic 400.
 */
export const pickStatus = (flags: ResultStatusFlags): number => {
  if (flags.notFound) return 404;
  if (flags.conflict) return 409;
  return 400;
};
