-- T36 completion is additive. No expiry, verification, permission or reminder
-- evidence is inferred or backfilled for historical members.
ALTER TYPE "DeliveryStatus" ADD VALUE 'dispatch_claimed' AFTER 'queued';

ALTER TABLE "members"
  ADD COLUMN "phone_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "phone_verification_source" TEXT,
  ADD COLUMN "sms_reminder_permission_at" TIMESTAMPTZ(3),
  ADD COLUMN "sms_reminder_permission_source" TEXT,
  ADD COLUMN "sms_reminder_permission_revoked_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "members_phone_verification_complete" CHECK (
    ("phone_verified_at" IS NULL) = ("phone_verification_source" IS NULL)
  ),
  ADD CONSTRAINT "members_sms_permission_complete" CHECK (
    ("sms_reminder_permission_at" IS NULL) = ("sms_reminder_permission_source" IS NULL)
  ),
  ADD CONSTRAINT "members_sms_revocation_order" CHECK (
    "sms_reminder_permission_revoked_at" IS NULL OR
    ("sms_reminder_permission_at" IS NOT NULL AND
     "sms_reminder_permission_revoked_at" >= "sms_reminder_permission_at")
  );

CREATE TABLE "membership_expiry_records" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "expires_on" DATE,
  "source_reference" TEXT NOT NULL,
  "authority_reference" TEXT NOT NULL,
  "recorded_by" TEXT,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replaces_record_id" TEXT,
  CONSTRAINT "membership_expiry_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "membership_expiry_source_nonempty" CHECK (length(btrim("source_reference")) > 0),
  CONSTRAINT "membership_expiry_authority_nonempty" CHECK (length(btrim("authority_reference")) > 0),
  CONSTRAINT "membership_expiry_not_self_replacing" CHECK ("replaces_record_id" IS NULL OR "replaces_record_id" <> "id"),
  CONSTRAINT "membership_expiry_records_id_member_key" UNIQUE ("id", "member_id"),
  CONSTRAINT "membership_expiry_records_replaces_record_id_key" UNIQUE ("replaces_record_id"),
  CONSTRAINT "membership_expiry_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "membership_expiry_records_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Composite reference is the database proof that corrections cannot cross members.
  CONSTRAINT "membership_expiry_same_member_predecessor_fkey" FOREIGN KEY ("replaces_record_id", "member_id") REFERENCES "membership_expiry_records"("id", "member_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- One root plus one successor per predecessor yields one linear chain. The
-- predecessor must already exist and historical rows are immutable, so cycles
-- cannot be introduced by a later insert.
CREATE UNIQUE INDEX "membership_expiry_one_root_per_member"
  ON "membership_expiry_records"("member_id")
  WHERE "replaces_record_id" IS NULL;
CREATE INDEX "membership_expiry_records_member_recorded_idx"
  ON "membership_expiry_records"("member_id", "recorded_at" DESC, "id" DESC);

-- A predecessor must already exist when each row is inserted. This also
-- rejects cyclic references introduced together in a single multi-row INSERT.
CREATE FUNCTION "t36_membership_expiry_validate_predecessor"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."replaces_record_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "membership_expiry_records"
     WHERE "id" = NEW."replaces_record_id" AND "member_id" = NEW."member_id"
  ) THEN
    RAISE EXCEPTION 'membership expiry predecessor must already exist for the same member'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "membership_expiry_validate_predecessor"
  BEFORE INSERT ON "membership_expiry_records"
  FOR EACH ROW EXECUTE FUNCTION "t36_membership_expiry_validate_predecessor"();

CREATE FUNCTION "t36_membership_expiry_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'membership expiry evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "membership_expiry_append_only"
  BEFORE UPDATE OR DELETE ON "membership_expiry_records"
  FOR EACH ROW EXECUTE FUNCTION "t36_membership_expiry_append_only"();

ALTER TABLE "reminder_logs"
  ADD COLUMN "membership_expiry_record_id" TEXT,
  ADD COLUMN "membership_expires_on" DATE,
  ADD COLUMN "renewal_window_days" SMALLINT,
  ADD CONSTRAINT "reminder_logs_membership_expiry_record_id_member_id_fkey" FOREIGN KEY ("membership_expiry_record_id", "member_id") REFERENCES "membership_expiry_records"("id", "member_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_renewal_window" CHECK ("renewal_window_days" IS NULL OR "renewal_window_days" IN (7, 30)),
  ADD CONSTRAINT "reminder_renewal_provenance_complete" CHECK (
    "reminder_type" <> 'membership_renewal' OR
    ("membership_expiry_record_id" IS NOT NULL AND "membership_expires_on" IS NOT NULL AND "renewal_window_days" IS NOT NULL)
  );

CREATE INDEX "reminder_logs_membership_expiry_record_id_idx"
  ON "reminder_logs"("membership_expiry_record_id");
CREATE UNIQUE INDEX "reminder_membership_renewal_channel_key"
  ON "reminder_logs"("member_id", "membership_expires_on", "renewal_window_days", "reminder_channel")
  WHERE "reminder_type" = 'membership_renewal';
