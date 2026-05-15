export class UnexpectedSetupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedSetupError";
    Object.setPrototypeOf(this, UnexpectedSetupError.prototype);
  }
}
