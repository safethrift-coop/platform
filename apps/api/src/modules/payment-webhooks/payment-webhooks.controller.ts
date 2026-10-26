import {
  Controller,
  Post,
  Req,
  HttpCode,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentWebhooksService } from './payment-webhooks.service';
@Controller('webhooks')
export class PaymentWebhooksController {
  constructor(private readonly service: PaymentWebhooksService) {}
  private async receive(
    ...args: Parameters<PaymentWebhooksService['receive']>
  ) {
    try {
      return await this.service.receive(...args);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Payment webhook persistence unavailable',
      );
    }
  }
  @Post('stripe')
  @HttpCode(200)
  stripe(@Req() req: RawBodyRequest<Request>) {
    return this.receive(
      'stripe',
      req.rawBody,
      typeof req.headers['stripe-signature'] === 'string'
        ? req.headers['stripe-signature']
        : '',
    );
  }
  @Post('gocardless')
  @HttpCode(200)
  gocardless(@Req() req: RawBodyRequest<Request>) {
    return this.receive(
      'gocardless',
      req.rawBody,
      typeof req.headers['webhook-signature'] === 'string'
        ? req.headers['webhook-signature']
        : '',
    );
  }
}
