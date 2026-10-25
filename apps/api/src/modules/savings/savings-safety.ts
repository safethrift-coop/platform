import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Decimal from 'decimal.js';

export function requireSavingsSimulation(): void {
  if (
    !['development', 'test'].includes(process.env.NODE_ENV ?? '') ||
    process.env.SAVINGS_SIMULATION_ENABLED !== 'true'
  ) {
    throw new ForbiddenException(
      'Savings simulation is disabled. No external funds can be moved by this API.',
    );
  }
}

export function validateMutation(amount: string, key: string): string {
  if (
    typeof key !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)
  ) {
    throw new BadRequestException(
      'A client Idempotency-Key of 1–128 safe ASCII characters is required',
    );
  }
  if (
    typeof amount !== 'string' ||
    !/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(amount)
  ) {
    throw new BadRequestException(
      'Amount must be an exact decimal string with at most two decimal places',
    );
  }
  const decimal = new Decimal(amount);
  if (!decimal.gt(0) || decimal.gt('10000'))
    throw new BadRequestException(
      'Amount must be greater than zero and at most 10000.00',
    );
  return decimal.toFixed(2);
}

export function databaseCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

// Retry whole transactions only. No external effects belong inside the callback.
export async function retrySavingsTransaction<T>(
  run: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (databaseCode(error) !== 'P2034') throw error;
      if (attempt === 3)
        throw new ServiceUnavailableException(
          'Concurrent savings operation; retry with the same Idempotency-Key',
        );
    }
  }
  throw new Error('Unreachable');
}
