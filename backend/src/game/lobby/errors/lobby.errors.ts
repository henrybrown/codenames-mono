/**
 * Represents unexpected errors that occur within the lobby feature
 *
 * This error class is used to encapsulate lobby-related errors
 * that are unexpected or indicate system failures rather than invalid
 * user input.
 */
export class UnexpectedLobbyError extends Error {
  /**
   * Creates a new UnexpectedLobbyError
   *
   * @param message - Error message describing what went wrong
   * @param options - Standard Error options (cause, etc.)
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedLobbyError";
    Object.setPrototypeOf(this, UnexpectedLobbyError.prototype);
  }
}
