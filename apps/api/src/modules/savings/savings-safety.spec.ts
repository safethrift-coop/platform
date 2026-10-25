import { validate } from '../../core/config/env.validation';
const validateSavingsEnvironment = (config: Record<string, unknown>) =>
  validate({
    DATABASE_URL: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PASSWORD: '',
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: 'x'.repeat(64),
    ...config,
  }).SAVINGS_SIMULATION_ENABLED;
import {
  requireSavingsSimulation,
  retrySavingsTransaction,
  validateMutation,
} from './savings-safety';

describe('savings safety boundaries', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  it('requires an explicit development/test opt-in', () => {
    for (const mode of ['production', 'staging', '', 'development', 'test']) {
      process.env.NODE_ENV = mode;
      process.env.SAVINGS_SIMULATION_ENABLED = 'false';
      expect(requireSavingsSimulation).toThrow();
      process.env.SAVINGS_SIMULATION_ENABLED = 'true';
      if (['development', 'test'].includes(mode))
        expect(requireSavingsSimulation).not.toThrow();
      else expect(requireSavingsSimulation).toThrow();
    }
  });
  it('rejects malformed money and keys and normalizes exact amounts', () => {
    for (const amount of [
      '0',
      '-1',
      '1.001',
      '10000.01',
      '1e2',
      'NaN',
      'Infinity',
      ' 1',
      '01',
      1,
    ]) {
      expect(() => validateMutation(amount as string, 'key')).toThrow();
    }
    for (const key of [undefined, '', ' ', 'bad key', 'x'.repeat(129)])
      expect(() => validateMutation('1', key as string)).toThrow();
    expect(validateMutation('0.1', 'valid-key')).toBe('0.10');
    expect(validateMutation('10000.00', 'valid-key')).toBe('10000.00');
  });
  it('retries only serialization conflicts, at most four attempts', async () => {
    const fail = jest.fn().mockRejectedValue({ code: 'P2034' });
    await expect(retrySavingsTransaction(fail)).rejects.toThrow(
      'retry with the same',
    );
    expect(fail).toHaveBeenCalledTimes(4);
    const recover = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValue('ok');
    await expect(retrySavingsTransaction(recover)).resolves.toBe('ok');
    const other = jest.fn().mockRejectedValue({ code: 'P2002' });
    await expect(retrySavingsTransaction(other)).rejects.toEqual({
      code: 'P2002',
    });
    expect(other).toHaveBeenCalledTimes(1);
  });
  it('environment flag defaults false and accepts only literal true/false', () => {
    expect(validateSavingsEnvironment({})).toBe('false');
    expect(
      validateSavingsEnvironment({ SAVINGS_SIMULATION_ENABLED: 'true' }),
    ).toBe('true');
    expect(() =>
      validateSavingsEnvironment({ SAVINGS_SIMULATION_ENABLED: 'yes' }),
    ).toThrow();
  });
});
