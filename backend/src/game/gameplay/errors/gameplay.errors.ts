/**
 * Domain-specific error for gameplay operations.
 *
 * Indicates genuine internal failures: invariant violations, missing
 * data mid-transaction, unreachable code paths. Maps to 500 via the
 * gameplay error middleware. Should never be thrown for client-
 * correctable problems — services return Result types for those.
 */
export class UnexpectedGameplayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedGameplayError";
    Object.setPrototypeOf(this, UnexpectedGameplayError.prototype);
  }
}
