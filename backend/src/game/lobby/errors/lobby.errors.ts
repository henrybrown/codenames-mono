export class UnexpectedLobbyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedLobbyError";
    Object.setPrototypeOf(this, UnexpectedLobbyError.prototype);
  }
}
