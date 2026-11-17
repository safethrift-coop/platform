-- Synthetic test provenance only. Existing KYC records remain unchanged.
CREATE UNIQUE INDEX "kyc_verification_kyc_id_member_id_key"
  ON "kyc_verification"("kyc_id", "member_id");

CREATE TABLE "kyc_synthetic_attempts" (
  "id" TEXT NOT NULL,
  "verification_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "initiation_state" TEXT NOT NULL DEFAULT 'pending' CHECK ("initiation_state" IN ('pending', 'started', 'permanent_failure')),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_synthetic_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kyc_synthetic_attempts_verification_member_fkey" FOREIGN KEY ("verification_id", "member_id")
    REFERENCES "kyc_verification"("kyc_id", "member_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "kyc_synthetic_attempts_verification_id_key" ON "kyc_synthetic_attempts"("verification_id");
CREATE UNIQUE INDEX "kyc_synthetic_attempts_verification_id_member_id_key" ON "kyc_synthetic_attempts"("verification_id", "member_id");
CREATE UNIQUE INDEX "kyc_synthetic_attempts_correlation_id_key" ON "kyc_synthetic_attempts"("correlation_id");
CREATE UNIQUE INDEX "kyc_synthetic_attempts_member_id_idempotency_key_key" ON "kyc_synthetic_attempts"("member_id", "idempotency_key");
CREATE UNIQUE INDEX "kyc_synthetic_attempts_member_id_sequence_key" ON "kyc_synthetic_attempts"("member_id", "sequence");
CREATE UNIQUE INDEX "kyc_synthetic_attempts_one_current" ON "kyc_synthetic_attempts"("member_id") WHERE "is_current";

CREATE TABLE "kyc_synthetic_events" (
  "id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL REFERENCES "kyc_synthetic_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "event_id" TEXT NOT NULL,
  "event_hash" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
  "transition" TEXT NOT NULL CHECK ("transition" IN ('in_progress', 'verified', 'rejected', 'expired')),
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('pending', 'applied', 'rejected')),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_synthetic_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kyc_synthetic_events_event_id_key" ON "kyc_synthetic_events"("event_id");
CREATE UNIQUE INDEX "kyc_synthetic_events_attempt_id_sequence_key" ON "kyc_synthetic_events"("attempt_id", "sequence");
