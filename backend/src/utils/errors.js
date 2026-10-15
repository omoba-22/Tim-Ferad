// An error whose message is safe to show to the visitor.
export class AppError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}