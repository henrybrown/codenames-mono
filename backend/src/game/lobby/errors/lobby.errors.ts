/**
 * Thrown when the lobby layer hits an invariant violation — missing
 * aggregate mid-transaction, repository write returning nothing, etc.
 *
 * Represents a bug or data corruption, not a user-facing rule violation.
 * User-facing failures use HTTP status codes directly.
 */
export class UnexpectedLobbyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedLobbyError";
    Object.setPrototypeOf(this, UnexpectedLobbyError.prototype);
  }
}
