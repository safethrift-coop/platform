// This file defines the event payloads that travel
// between the SavingsModule and the PointsModule.
// When a deposit happens, SavingsService fires a
// 'savings.deposited' event with this payload.
// PointsService listens for it and recalculates points.

export const SAVINGS_DEPOSITED_EVENT = 'savings.deposited';

export interface SavingsDepositedPayload {
  memberId: string;
  accountId: string;
  accountType: string;
  amount: number;
  newBalance: number;
  goalTarget: number | null;
  goalReached: boolean;
}
