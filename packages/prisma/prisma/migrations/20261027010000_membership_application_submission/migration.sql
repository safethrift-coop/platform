-- CreateTable
CREATE TABLE "membership_application_submissions" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" TIMESTAMPTZ(3) NOT NULL,
    "signed_date" DATE NOT NULL,
    "content_version" TEXT NOT NULL,
    "declaration_responses" JSONB NOT NULL,
    "personal_details" JSONB NOT NULL,
    "is_development_fixture" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "membership_application_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_application_submissions_member_id_key" ON "membership_application_submissions"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_application_submissions_registration_id_key" ON "membership_application_submissions"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_application_submissions_member_id_idempotency_ke_key" ON "membership_application_submissions"("member_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "membership_application_submissions" ADD CONSTRAINT "membership_application_submissions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application_submissions" ADD CONSTRAINT "membership_application_submissions_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "member_registration"("registration_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- This foundation cannot represent an approved real application.
ALTER TABLE membership_application_submissions
 ADD CONSTRAINT t40_fixture_only CHECK (is_development_fixture = true),
 ADD CONSTRAINT t40_development_content CHECK (content_version = 't40-development-placeholder-v1'),
 ADD CONSTRAINT t40_request_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT t40_idempotency_key CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
 ADD CONSTRAINT t40_declarations CHECK (jsonb_typeof(declaration_responses) = 'array' AND jsonb_array_length(declaration_responses) = 4),
 ADD CONSTRAINT t40_personal_details CHECK (jsonb_typeof(personal_details) = 'object'),
 ADD CONSTRAINT t40_signed_date CHECK (signed_date <= (signed_at AT TIME ZONE 'UTC')::date);
