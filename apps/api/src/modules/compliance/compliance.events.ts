// This event is fired after every deposit.
// The ComplianceService listens for it and runs AML checks.
// We reuse the same event from the PointsModule
// because all three listeners (Points, Compliance, future Notifications)
// respond to the same deposit event.
export { SAVINGS_DEPOSITED_EVENT } from '../points/points.events';
export type { SavingsDepositedPayload } from '../points/points.events';
