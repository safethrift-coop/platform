-- CreateTable
CREATE TABLE "payment_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "accountScope" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "eventIds" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "accountScope" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceType" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "reason" TEXT,
    "jobId" TEXT,
    "recoveries" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_observations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "accountScope" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "amountMinor" DECIMAL(20,0),
    "currency" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payment_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandate_observations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "accountScope" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "replacementId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mandate_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_webhook_deliveries_provider_environment_accountScop_idx" ON "payment_webhook_deliveries"("provider", "environment", "accountScope", "receivedAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_status_acceptedAt_idx" ON "payment_webhook_events"("status", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_environment_accountScope_pr_key" ON "payment_webhook_events"("provider", "environment", "accountScope", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_id_provider_environment_accountScope_key" ON "payment_webhook_events"("id", "provider", "environment", "accountScope");

-- CreateIndex
CREATE UNIQUE INDEX "payment_observations_eventId_key" ON "payment_observations"("eventId");

-- CreateIndex
CREATE INDEX "payment_observations_provider_environment_accountScope_reso_idx" ON "payment_observations"("provider", "environment", "accountScope", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_observations_eventId_provider_environment_accountSc_key" ON "payment_observations"("eventId", "provider", "environment", "accountScope");

-- CreateIndex
CREATE UNIQUE INDEX "mandate_observations_eventId_key" ON "mandate_observations"("eventId");

-- CreateIndex
CREATE INDEX "mandate_observations_provider_environment_accountScope_reso_idx" ON "mandate_observations"("provider", "environment", "accountScope", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "mandate_observations_eventId_provider_environment_accountSc_key" ON "mandate_observations"("eventId", "provider", "environment", "accountScope");

-- AddForeignKey
ALTER TABLE "payment_observations" ADD CONSTRAINT "payment_observations_eventId_provider_environment_accountS_fkey" FOREIGN KEY ("eventId", "provider", "environment", "accountScope") REFERENCES "payment_webhook_events"("id", "provider", "environment", "accountScope") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandate_observations" ADD CONSTRAINT "mandate_observations_eventId_provider_environment_accountS_fkey" FOREIGN KEY ("eventId", "provider", "environment", "accountScope") REFERENCES "payment_webhook_events"("id", "provider", "environment", "accountScope") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrict evidence storage independently of application validation.
ALTER TABLE payment_webhook_deliveries
 ADD CONSTRAINT t38_delivery_provider CHECK (provider IN ('stripe','gocardless')),
 ADD CONSTRAINT t38_delivery_environment CHECK (environment IN ('test','live')),
 ADD CONSTRAINT t38_delivery_outcome CHECK (outcome IN ('accepted','rejected','review')),
 ADD CONSTRAINT t38_delivery_hash CHECK ("bodyHash" ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT t38_delivery_events CHECK (jsonb_typeof("eventIds") = 'array');
ALTER TABLE payment_webhook_events
 ADD CONSTRAINT t38_event_provider CHECK (provider IN ('stripe','gocardless')),
 ADD CONSTRAINT t38_event_environment CHECK (environment IN ('test','live')),
 ADD CONSTRAINT t38_event_status CHECK (status IN ('queued','ignored','quarantined','review')),
 ADD CONSTRAINT t38_event_recoveries CHECK (recoveries BETWEEN 0 AND 3),
 ADD CONSTRAINT t38_event_hash CHECK ("eventHash" ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT t38_event_evidence CHECK (jsonb_typeof(evidence) = 'object');
ALTER TABLE payment_observations
 ADD CONSTRAINT t38_payment_amount CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0),
 ADD CONSTRAINT t38_payment_currency CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 ADD CONSTRAINT t38_payment_amount_currency CHECK (("amountMinor" IS NULL) = (currency IS NULL)),
 ADD CONSTRAINT t38_payment_review CHECK ("reviewRequired" = true);
ALTER TABLE mandate_observations
 ADD CONSTRAINT t38_mandate_provider CHECK (provider = 'gocardless'),
 ADD CONSTRAINT t38_mandate_review CHECK ("reviewRequired" = true);
