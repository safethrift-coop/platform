export type LoanCapability = {
  allowed: false;
  mode: "disabled";
  message: string;
};
export type Eligibility = {
  savingsPointsTotal: number;
  currentRiskBand: string;
  membershipStatus: string;
  emailVerified: boolean;
  maximumAmount: null;
  applicationCapability: LoanCapability;
  reviewer: boolean;
};
export type LoanApplication = {
  id: string;
  applicationDate: string;
  requestedAmount: string;
  loanPurpose: string;
  requestedTermMonths: number;
  applicationStatus: string;
  savingsPointsAtApplication: number | null;
  riskBandAtApplication: string | null;
  loanId?: string | null;
};
export type Loan = {
  id: string;
  principalAmount: string;
  termMonths: number;
  loanStatus: string;
  approvalDate: string;
  maturityDate: string;
  repaymentCapability?: LoanCapability;
};
export type Installment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalDue: string;
  interestDue: string;
  totalDue: string;
  totalPaid: string;
  status: string;
};
export type Repayment = {
  id: string;
  amountPaid: string;
  paymentDate: string;
  paymentStatus: string;
  provenance: "historical_unknown";
  settlementStatus: "unverified";
};
export type Review = LoanApplication & {
  behaviouralScoreAtApplication: string | null;
  predictedRepaymentProbability: string | null;
  snapshotContext: string;
};
export type LoanPage<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
};
