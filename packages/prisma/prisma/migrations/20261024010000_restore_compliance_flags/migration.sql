-- Restore only the previously declared ComplianceFlag schema. No data updates.
-- CreateEnum
CREATE TYPE "ComplianceFlagStatus" AS ENUM ('open', 'under_review', 'resolved', 'escalated');

-- CreateEnum
CREATE TYPE "ComplianceFlagType" AS ENUM ('large_single_deposit', 'high_velocity', 'monthly_spike', 'round_amount_pattern', 'manual_flag');

-- CreateTable
CREATE TABLE "compliance_flags" (
    "flag_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "flag_type" "ComplianceFlagType" NOT NULL,
    "status" "ComplianceFlagStatus" NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "trigger_data" TEXT,
    "reviewed_by" TEXT,
    "review_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_flags_pkey" PRIMARY KEY ("flag_id")
);

-- CreateIndex
CREATE INDEX "compliance_flags_member_id_idx" ON "compliance_flags"("member_id");

-- CreateIndex
CREATE INDEX "compliance_flags_status_idx" ON "compliance_flags"("status");

-- CreateIndex
CREATE INDEX "compliance_flags_created_at_idx" ON "compliance_flags"("created_at");

-- AddForeignKey
ALTER TABLE "compliance_flags" ADD CONSTRAINT "compliance_flags_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;
