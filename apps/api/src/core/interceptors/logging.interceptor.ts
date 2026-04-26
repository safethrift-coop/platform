import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] ?? '';
    const startTime = Date.now();

    const user = request.user;
    const memberId =
      user !== null &&
      typeof user === 'object' &&
      'sub' in user &&
      typeof (user as Record<string, unknown>)['sub'] === 'string'
        ? ((user as Record<string, unknown>)['sub'] as string)
        : undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          const duration = Date.now() - startTime;

          this.logger.info('HTTP request completed', {
            method,
            url,
            statusCode: response.statusCode,
            duration: `${duration}ms`,
            ip,
            userAgent,
            memberId,
          });
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;

          this.logger.warn('HTTP request failed', {
            method,
            url,
            duration: `${duration}ms`,
            ip,
            userAgent,
            memberId,
            error: error.message,
          });
        },
      }),
    );
  }
}
