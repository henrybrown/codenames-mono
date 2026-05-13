/**
 * Represents unexpected errors that occur within the data access layer
 *
 * This error class is used to encapsulate repository errors
 * that are unexpected or indicate system failures rather than invalid
 * user input.
 */
export class UnexpectedRepositoryError extends Error {
  /**
   * Creates a new UnexpectedRepositoryError
   *
   * @param message - Error message describing what went wrong
   * @param options - Standard Error options (cause, etc.)
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedRepositoryError";
    Object.setPrototypeOf(this, UnexpectedRepositoryError.prototype);
  }
}

/**
 * Represents unexpected errors that occur within the data access layer
 *
 * This error class is used to encapsulate repository errors
 * that are unexpected or indicate system failures rather than invalid
 * user input.
 */
export class RepositoryBulkUpdateError extends UnexpectedRepositoryError {
  /**
   * Creates a new RepositoryBulkUpdateError
   *
   * @param message - Error message describing what went wrong
   * @param options - Standard Error options (cause, etc.)
   */
  constructor(message: string, options?: ErrorOptions) {
    super(`Repository bulk update failed: ${message}`, options);
    this.name = "RepositoryBulkUpdateError";
    Object.setPrototypeOf(this, RepositoryBulkUpdateError.prototype);
  }
}
