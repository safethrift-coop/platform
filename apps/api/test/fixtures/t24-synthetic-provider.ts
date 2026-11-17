/** Test-only protocol. It is not the Onfido API or webhook contract. */
export type SyntheticInitiationOutcome =
  | 'started'
  | 'retryable_failure'
  | 'permanent_failure';

export class SyntheticKycProvider {
  private readonly outcomes = new Map<string, SyntheticInitiationOutcome>();
  private readonly accepted = new Set<string>();

  setOutcome(correlationId: string, outcome: SyntheticInitiationOutcome): void {
    this.outcomes.set(correlationId, outcome);
  }

  async initiate(correlationId: string): Promise<SyntheticInitiationOutcome> {
    if (this.accepted.has(correlationId)) return 'started';
    const outcome = this.outcomes.get(correlationId) ?? 'started';
    if (outcome === 'started') this.accepted.add(correlationId);
    return outcome;
  }
}

/** Synthetic observations are never authority for a real loan. */
export function syntheticEligibility(status: string | undefined): {
  synthetic: 'synthetic_verified' | 'synthetic_not_verified' | 'synthetic_unavailable';
  realLoanAuthorized: false;
} {
  return {
    synthetic:
      status === undefined
        ? 'synthetic_unavailable'
        : status === 'verified'
          ? 'synthetic_verified'
          : 'synthetic_not_verified',
    realLoanAuthorized: false,
  };
}
