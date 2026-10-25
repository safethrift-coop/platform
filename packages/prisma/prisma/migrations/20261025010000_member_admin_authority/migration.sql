-- Existing and newly registered members remain non-administrators.
-- Administrative promotion requires a separately authorized database operation.
ALTER TABLE "members" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;
