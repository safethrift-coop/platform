import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = exceptionResponse.toUpperCase().replace(/ /g, '_');
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const res = exceptionResponse as Record<string, unknown>;
        const rawMessage = res['message'];

        if (Array.isArray(rawMessage)) {
          message = (rawMessage as string[]).join(', ');
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        } else if (rawMessage !== undefined && rawMessage !== null) {
          message = JSON.stringify(rawMessage);
        }

        code = String(typeof res['error'] === 'string' ? res['error'] : code)
          .toUpperCase()
          .replace(/ /g, '_');
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} — ${String(exception)}`,
      );
    }

    const body: ErrorResponse = {
      error: { code, message },
    };

    response.status(status).json(body);
  }
}
