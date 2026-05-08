// The number of months of history to look at when computing features.
// 6 months gives enough data to see patterns without penalising new members too harshly.
export const FEATURE_WINDOW_MONTHS = 6;

// Model coefficients — these are the weights for each feature.
// These are starter values based on cooperative finance research.
// They will be updated when enough loan outcomes are collected (target: 200 completed loans).
// β0 is the intercept — the baseline score before any features are applied.
export const MODEL_COEFFICIENTS = {
  beta0: -1.5,
  savingsRegularity: 2.0,
  savingsConsistency: 1.5,
  withdrawalDiscipline: 1.8,
  incomeStability: 1.2,
  responseToReminders: 1.0,
};

// Risk band thresholds based on repayment probability
export const RISK_THRESHOLDS = {
  LOW_RISK: 0.75, // pi >= 0.75 = low risk
  MODERATE_RISK: 0.5, // 0.50 <= pi < 0.75 = moderate risk
  // pi < 0.50 = high risk
};

// The model version. Increment this every time coefficients change.
// This is stored on every risk_score row so you can trace which model produced a decision.
export const MODEL_VERSION = '1.0.0';
export const MODEL_NAME = 'safethrift-logistic-v1';
