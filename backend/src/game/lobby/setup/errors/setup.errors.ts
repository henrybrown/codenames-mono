/**
 * Thrown when the game-setup flow hits an invariant violation —
 * shortid collision against an existing public id, repository write
 * returning nothing, etc.
 *
 * Represents a bug or transient data race, not a user-facing rule
 * violation. User-facing failures use HTTP status codes directly.
 */
export class UnexpectedSetupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedSetupError";
    Object.setPrototypeOf(this, UnexpectedSetupError.prototype);
  }
}
