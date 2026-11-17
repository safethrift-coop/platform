import { SyntheticKycProvider, syntheticEligibility } from './fixtures/t24-synthetic-provider';

describe('T24 isolated synthetic provider', () => {
  it('uses deterministic outcomes and retains an accepted correlation on retry', async () => {
    const provider = new SyntheticKycProvider();
    provider.setOutcome('retry', 'retryable_failure');
    provider.setOutcome('permanent', 'permanent_failure');
    expect(await provider.initiate('retry')).toBe('retryable_failure');
    expect(await provider.initiate('permanent')).toBe('permanent_failure');
    provider.setOutcome('retry', 'started');
    expect(await provider.initiate('retry')).toBe('started');
    provider.setOutcome('retry', 'permanent_failure');
    expect(await provider.initiate('retry')).toBe('started');
  });

  it('never treats a synthetic KYC outcome as authority for a real loan', () => {
    for (const status of [undefined, 'pending', 'verified', 'rejected', 'expired']) {
      expect(syntheticEligibility(status).realLoanAuthorized).toBe(false);
    }
    expect(syntheticEligibility('verified').synthetic).toBe('synthetic_verified');
  });
});
