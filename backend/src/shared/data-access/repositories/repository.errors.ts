/**
 * Thrown when a repository hits an invariant violation — query returned
 * an unexpected row count, schema constraint surfaced as an error, etc.
 *
 * Internal failure, not a user-facing rule violation. Services typically
 * let these bubble up so the feature error handler can map them to 500.
 */
export class UnexpectedRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedRepositoryError";
    Object.setPrototypeOf(this, UnexpectedRepositoryError.prototype);
  }
}

/**
 * Specialization for bulk-update failures — the message is prefixed so
 * the source operation is identifiable in logs even when only the type
 * name survives.
 */
export class RepositoryBulkUpdateError extends UnexpectedRepositoryError {
  constructor(message: string, options?: ErrorOptions) {
    super(`Repository bulk update failed: ${message}`, options);
    this.name = "RepositoryBulkUpdateError";
    Object.setPrototypeOf(this, RepositoryBulkUpdateError.prototype);
  }
}
