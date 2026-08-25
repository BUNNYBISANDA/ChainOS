import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response } from "express";
import { RequestWithId } from "../request-id.middleware";
import { AppErrorCode } from "./app-error-code";
import { AppException } from "./app-exception";

export interface ApiErrorBody {
  statusCode: number;
  code: AppErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

/**
 * Every error response (thrown AppException, a bare NestJS HttpException —
 * e.g. from ValidationPipe or a guard — or an unhandled exception) is
 * normalized to one shape. Unhandled exceptions are logged with full
 * detail server-side but never echo their message to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();
    const requestId = req?.id ?? "unknown";

    const body = this.toBody(exception, requestId);
    if (body.statusCode >= 500) {
      this.logger.error(`[${requestId}] ${(exception as Error)?.stack ?? exception}`);
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, requestId: string): ApiErrorBody {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = this.extractMessage(response, exception.message);
      return {
        statusCode: status,
        code: this.codeForStatus(status),
        message,
        details: typeof response === "object" ? (response as Record<string, unknown>) : undefined,
        requestId,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: AppErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
      requestId,
    };
  }

  private extractMessage(response: unknown, fallback: string): string {
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && "message" in response) {
      const m = (response as { message: unknown }).message;
      if (Array.isArray(m)) return m.join("; ");
      if (typeof m === "string") return m;
    }
    return fallback;
  }

  private codeForStatus(status: number): AppErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return AppErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return AppErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return AppErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return AppErrorCode.NOT_FOUND;
      default:
        return AppErrorCode.INTERNAL_ERROR;
    }
  }
}
