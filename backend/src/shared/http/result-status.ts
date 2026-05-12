/**
 * Picks an HTTP status code from a service failure variant's flags.
 *
 * Services return { success: false; message; notFound?; conflict? } for
 * expected business failures; this maps those flags to the right HTTP
 * status. Genuine internal failures throw and are caught by error
 * middleware → 500, separately.
 */
export type ResultStatusFlags = {
  readonly notFound?: boolean;
  readonly conflict?: boolean;
};

export const pickStatus = (flags: ResultStatusFlags): number => {
  if (flags.notFound) return 404;
  if (flags.conflict) return 409;
  return 400;
};
