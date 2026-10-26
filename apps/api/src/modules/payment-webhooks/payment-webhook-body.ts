import type { INestApplication, RawBodyRequest } from '@nestjs/common';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { MAX_WEBHOOK_BYTES } from './payment-webhook.config';
export function configurePaymentWebhookBody(app: INestApplication): void {
  const parser = json({
    limit: MAX_WEBHOOK_BYTES,
    inflate: false,
    verify: (req, _res, body) => {
      (req as RawBodyRequest<Request>).rawBody = Buffer.from(body);
    },
  });
  app.use(
    ['/api/v1/webhooks/stripe', '/api/v1/webhooks/gocardless'],
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.is('application/json')) {
        res.status(415).json({ error: 'Invalid webhook content type' });
        return;
      }
      parser(req, res, (error?: unknown) => {
        if (!error) {
          next();
          return;
        }
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? error.status
            : 400;
        // Parser errors may contain body excerpts. Never forward them to global logging.
        res
          .status(status === 413 ? 413 : status === 415 ? 415 : 400)
          .json({ error: 'Invalid webhook body' });
      });
    },
  );
}
