import type { INestApplication } from '@nestjs/common';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
export function configureRegistrationBody(app: INestApplication): void {
  const parser = json({ limit: 32 * 1024, inflate: false });
  app.use(
    [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/verify-email',
      '/api/v1/auth/refresh',
      '/api/v1/membership/apply',
    ],
    (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({
          error: {
            code: 'INVALID_REGISTRATION_BODY',
            message: 'JSON request required',
          },
        });
        return;
      }
      parser(req, res, (error?: unknown) => {
        if (!error) {
          next();
          return;
        }
        const status =
          error && typeof error === 'object' && 'status' in error
            ? error.status
            : 400;
        // Syntax errors can contain password/PII excerpts. Do not forward these
        // parser errors to either the interceptor or the global exception logger.
        res.status(status === 413 ? 413 : status === 415 ? 415 : 400).json({
          error: {
            code: 'INVALID_REGISTRATION_BODY',
            message: 'Invalid registration request',
          },
        });
      });
    },
  );
}
