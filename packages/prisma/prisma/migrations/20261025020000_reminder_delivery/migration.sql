-- Preserve historical rows and existing enum values. No inferred delivery history.
ALTER TYPE "DeliveryStatus" ADD VALUE 'attempted';
ALTER TYPE "DeliveryStatus" ADD VALUE 'provider_accepted';
ALTER TYPE "DeliveryStatus" ADD VALUE 'uncertain';
ALTER TYPE "DeliveryStatus" ADD VALUE 'skipped';
ALTER TYPE "DeliveryStatus" ADD VALUE 'simulated';
ALTER TABLE "reminder_logs"
  ALTER COLUMN "sent_date" DROP NOT NULL,
  ALTER COLUMN "sent_date" DROP DEFAULT,
  ADD COLUMN "repayment_schedule_id" TEXT,
  ADD COLUMN "scan_date" DATE,
  ADD COLUMN "queued_at" TIMESTAMP(3),
  ADD COLUMN "first_attempt_at" TIMESTAMP(3),
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "job_id" TEXT,
  ADD COLUMN "provider_key" TEXT,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "attempt_token" TEXT,
  ADD COLUMN "transport" TEXT,
  ADD COLUMN "provider_event_at" TIMESTAMP(3),
  ADD COLUMN "provider_event_type" TEXT;
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_repayment_schedule_id_fkey" FOREIGN KEY ("repayment_schedule_id") REFERENCES "repayment_schedule"("schedule_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "reminder_initial_installment_email_key" ON "reminder_logs"("repayment_schedule_id", "reminder_type", "reminder_channel");
CREATE UNIQUE INDEX "reminder_logs_job_id_key" ON "reminder_logs"("job_id");
CREATE UNIQUE INDEX "reminder_logs_provider_key_key" ON "reminder_logs"("provider_key");
CREATE INDEX "reminder_logs_delivery_status_queued_at_idx" ON "reminder_logs"("delivery_status", "queued_at");
CREATE INDEX "reminder_logs_external_id_idx" ON "reminder_logs"("external_id");
CREATE TABLE "reminder_attempts" (
 "id" TEXT NOT NULL PRIMARY KEY, "reminder_id" TEXT NOT NULL,
 "job_id" TEXT NOT NULL, "retry_count" INTEGER NOT NULL,
 "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finished_at" TIMESTAMP(3), "outcome" "DeliveryStatus" NOT NULL DEFAULT 'queued',
 "external_id" TEXT, "error_code" TEXT,
 CONSTRAINT "reminder_attempts_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminder_logs"("reminder_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reminder_attempts_job_id_retry_count_key" ON "reminder_attempts"("job_id", "retry_count");
CREATE INDEX "reminder_attempts_reminder_id_idx" ON "reminder_attempts"("reminder_id");
CREATE TABLE "reminder_provider_events" (
 "id" TEXT NOT NULL PRIMARY KEY, "external_id" TEXT NOT NULL,
 "event_type" TEXT NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL,
 "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processed_at" TIMESTAMP(3)
);
CREATE INDEX "reminder_provider_events_external_id_processed_at_idx" ON "reminder_provider_events"("external_id", "processed_at");
