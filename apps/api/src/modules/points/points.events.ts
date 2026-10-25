export const SAVINGS_DEPOSITED_EVENT = 'savings.deposited';

// All amounts are exact decimal strings; no assertion of external settlement.
export interface SavingsDepositedPayload {
  transactionId: string;
  memberId: string;
  accountId: string;
  accountType: string;
  amount: string;
  newBalance: string;
  goalTarget: string | null;
  goalReached: boolean;
  simulation: true;
}
