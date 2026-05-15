export class UnexpectedRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedRepositoryError";
    Object.setPrototypeOf(this, UnexpectedRepositoryError.prototype);
  }
}

export class RepositoryBulkUpdateError extends UnexpectedRepositoryError {
  constructor(message: string, options?: ErrorOptions) {
    super(`Repository bulk update failed: ${message}`, options);
    this.name = "RepositoryBulkUpdateError";
    Object.setPrototypeOf(this, RepositoryBulkUpdateError.prototype);
  }
}
