import { HttpException, HttpStatus } from "@nestjs/common";
import { AppErrorCode } from "./app-error-code";

/**
 * Base for every domain error that should reach the client with a stable
 * `code` (see AppErrorCode) instead of just an HTTP status + free-text
 * message. Thrown from services; formatted by AllExceptionsFilter.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
  }
}

export class NotFoundAppException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(HttpStatus.NOT_FOUND, AppErrorCode.NOT_FOUND, message, details);
  }
}

export class BadRequestAppException extends AppException {
  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(HttpStatus.BAD_REQUEST, code, message, details);
  }
}

export class ForbiddenAppException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(HttpStatus.FORBIDDEN, AppErrorCode.FORBIDDEN, message, details);
  }
}

export class UnauthenticatedAppException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(HttpStatus.UNAUTHORIZED, AppErrorCode.UNAUTHENTICATED, message, details);
  }
}

export class DuplicateValueAppException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(HttpStatus.CONFLICT, AppErrorCode.DUPLICATE_VALUE, message, details);
  }
}
