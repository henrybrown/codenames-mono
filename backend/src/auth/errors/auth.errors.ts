/**
 * Thrown when the auth layer hits an invariant violation — a missing user
 * row when one should exist, a session-storage write that returns nothing,
 * or any other "shouldn't happen" condition.
 *
 * Represents a bug or data corruption, not a user-facing rule violation.
 * User-facing failures use HTTP status codes directly.
 */
export class UnexpectedAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedAuthError";
    Object.setPrototypeOf(this, UnexpectedAuthError.prototype);
  }
}
