export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation_error"
  | "not_found"
  | "conflict"
  | "internal_error"

export abstract class AppError extends Error {
  abstract readonly status: number
  abstract readonly code: ErrorCode
  readonly expose: boolean = true
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class AuthError extends AppError {
  readonly status = 401
  readonly code = "unauthorized"
  readonly expose = false
  constructor() {
    super("Unauthorized")
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403
  readonly code = "forbidden"
  readonly expose = false
  constructor(
    public readonly permission: string,
    public readonly reason?: string
  ) {
    super("Forbidden")
  }
}

export class ValidationError extends AppError {
  readonly status = 400
  readonly code = "validation_error"
  constructor(message: string) {
    super(message)
  }
}

export class NotFoundError extends AppError {
  readonly status = 404
  readonly code = "not_found"
  constructor(message: string) {
    super(message)
  }
}

export class ConflictError extends AppError {
  readonly status = 409
  readonly code = "conflict"
  constructor(message: string) {
    super(message)
  }
}
