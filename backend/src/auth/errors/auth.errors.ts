export class UnexpectedAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedAuthError";
    Object.setPrototypeOf(this, UnexpectedAuthError.prototype);
  }
}
