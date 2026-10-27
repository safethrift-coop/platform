export type Capability = {
  deposit: boolean;
  withdrawal: boolean;
  simulationOnly: true;
  message: string;
};
export type Account = {
  id: string;
  accountType: string;
  accountNumber: string;
  accountStatus: string;
  currentBalance: string;
  goalTarget: string | null;
  goalDeadline: string | null;
  goalReached: boolean;
  balanceNotice: string;
  settlement: "unverified";
  capability: Capability;
};
export type Activity = {
  id: string;
  source: "deposit" | "withdrawal";
  accountId: string;
  accountType: string;
  accountStatus: string;
  amount: string;
  transactionDate: string;
  status: string;
  provenance: "simulation" | "historical_unknown" | "unverified";
  settlement: "not_settled" | "unverified";
};
export type ActivityPage = {
  items: Activity[];
  nextCursor: string | null;
  hasMore: boolean;
};
export type Overview = {
  savingsPointsTotal: number;
  riskBand: string;
  membershipStatus: string;
  accounts: Account[];
  recentActivity: ActivityPage;
  capability: Capability;
};
