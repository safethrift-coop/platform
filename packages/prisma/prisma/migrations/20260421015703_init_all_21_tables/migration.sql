-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('pending', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('uk_citizen', 'settled_status', 'pre_settled_status', 'visa_holder', 'refugee', 'asylum_seeker', 'other');

-- CreateEnum
CREATE TYPE "RegistrationChannel" AS ENUM ('web_portal', 'mobile_app', 'field_officer', 'branch');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('passport', 'national_id', 'residence_permit', 'driver_license', 'biometric_residence_permit');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'in_progress', 'verified', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('savings_fsa', 'savings_rsa', 'savings_gsa', 'loan', 'shares', 'emergency_fund');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'frozen', 'closed', 'pending_closure');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('deposit', 'auto_deposit', 'cash_deposit', 'mobile_money', 'bank_transfer');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "IncomeSourceType" AS ENUM ('salary', 'self_employment', 'casual_work', 'remittance', 'benefits', 'pension', 'mixed', 'other');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('savings_nudge', 'repayment_due', 'late_payment', 'general_notice', 'membership_renewal', 'kyc_expiry');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('sms', 'email', 'whatsapp', 'app_notification', 'call');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'bounced');

-- CreateEnum
CREATE TYPE "ReminderResponseType" AS ENUM ('paid_after_reminder', 'saved_after_reminder', 'ignored', 'responded', 'requested_extension');

-- CreateEnum
CREATE TYPE "LoanApplicationStatus" AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('active', 'completed', 'defaulted', 'restructured', 'written_off', 'disbursement_pending');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('due', 'paid', 'partial', 'late', 'missed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('low_risk', 'moderate_risk', 'high_risk', 'unscored');

-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('active', 'transferred', 'cancelled');

-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('savings_circle', 'community_investment_circle', 'household_group', 'enterprise_group');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('forming', 'active', 'dissolved');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('member', 'facilitator', 'treasurer', 'chair');

-- CreateEnum
CREATE TYPE "GroupMembershipStatus" AS ENUM ('active', 'suspended', 'left');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('insert', 'update', 'delete', 'login', 'logout', 'export', 'admin_action');

-- CreateTable
CREATE TABLE "members" (
    "member_id" TEXT NOT NULL,
    "membership_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" "Gender",
    "phone_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "national_id_number" TEXT,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postcode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'GB',
    "occupation" TEXT,
    "household_size" INTEGER,
    "migration_status" "MigrationStatus",
    "joined_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_status" "MembershipStatus" NOT NULL DEFAULT 'pending',
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(3),
    "savings_points_total" INTEGER NOT NULL DEFAULT 0,
    "current_risk_band" "RiskBand" NOT NULL DEFAULT 'unscored',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "member_registration" (
    "registration_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "registration_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registration_channel" "RegistrationChannel" NOT NULL,
    "registered_by" TEXT,
    "initial_deposit_amount" DECIMAL(12,2),
    "membership_fee_paid" BOOLEAN NOT NULL DEFAULT false,
    "membership_fee_amount" DECIMAL(12,2),
    "membership_type" TEXT,
    "household_members_json" TEXT,
    "terms_accepted" BOOLEAN NOT NULL DEFAULT false,
    "terms_accepted_at" TIMESTAMP(3),
    "consent_data_processing" BOOLEAN NOT NULL DEFAULT false,
    "consent_data_processed_at" TIMESTAMP(3),
    "consent_credit_assessment" BOOLEAN NOT NULL DEFAULT false,
    "consent_credit_assessed_at" TIMESTAMP(3),
    "referral_source" TEXT,
    "why_joining" TEXT,
    "preferred_payment_method" TEXT,
    "signature_text" TEXT,
    "registration_notes" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_registration_pkey" PRIMARY KEY ("registration_id")
);

-- CreateTable
CREATE TABLE "kyc_verification" (
    "kyc_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_number" TEXT,
    "document_issue_date" DATE,
    "document_expiry_date" DATE,
    "verification_status" "KycStatus" NOT NULL DEFAULT 'pending',
    "onfido_applicant_id" TEXT,
    "onfido_check_id" TEXT,
    "verified_by" TEXT,
    "verification_date" TIMESTAMP(3),
    "proof_of_address_type" TEXT,
    "proof_of_address_status" "KycStatus",
    "risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "risk_flag_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_verification_pkey" PRIMARY KEY ("kyc_id")
);

-- CreateTable
CREATE TABLE "next_of_kin" (
    "nok_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship_to_member" TEXT NOT NULL,
    "phone_number" TEXT,
    "email" TEXT,
    "address" TEXT,
    "is_beneficiary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "next_of_kin_pkey" PRIMARY KEY ("nok_id")
);

-- CreateTable
CREATE TABLE "member_accounts" (
    "account_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'active',
    "opened_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_date" TIMESTAMP(3),
    "current_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "goal_target" DECIMAL(12,2),
    "goal_deadline" DATE,
    "goal_reached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "savings_transactions" (
    "savings_txn_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_type" "TransactionType" NOT NULL,
    "channel" TEXT,
    "reference_number" TEXT,
    "recorded_by" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT,
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_transactions_pkey" PRIMARY KEY ("savings_txn_id")
);

-- CreateTable
CREATE TABLE "withdrawal_transactions" (
    "withdrawal_txn_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "withdrawal_reason" TEXT,
    "approved_by" TEXT,
    "channel" TEXT,
    "reference_number" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_transactions_pkey" PRIMARY KEY ("withdrawal_txn_id")
);

-- CreateTable
CREATE TABLE "income_records" (
    "income_record_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "record_period_start" DATE NOT NULL,
    "record_period_end" DATE NOT NULL,
    "income_source_type" "IncomeSourceType" NOT NULL,
    "estimated_monthly_income" DECIMAL(12,2) NOT NULL,
    "income_volatility_score" DECIMAL(5,4),
    "income_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_method" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "income_records_pkey" PRIMARY KEY ("income_record_id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "reminder_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "related_loan_id" TEXT,
    "reminder_type" "ReminderType" NOT NULL,
    "reminder_channel" "ReminderChannel" NOT NULL,
    "sent_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "message_template" TEXT,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'queued',
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("reminder_id")
);

-- CreateTable
CREATE TABLE "reminder_responses" (
    "response_id" TEXT NOT NULL,
    "reminder_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "response_type" "ReminderResponseType" NOT NULL,
    "response_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_time_hours" DECIMAL(8,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_responses_pkey" PRIMARY KEY ("response_id")
);

-- CreateTable
CREATE TABLE "loan_applications" (
    "application_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "application_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_amount" DECIMAL(12,2) NOT NULL,
    "loan_purpose" TEXT NOT NULL,
    "requested_term_months" INTEGER NOT NULL,
    "application_status" "LoanApplicationStatus" NOT NULL DEFAULT 'pending',
    "behavioural_score_at_application" DECIMAL(10,6),
    "predicted_repayment_probability" DECIMAL(5,4),
    "risk_band_at_application" "RiskBand",
    "savings_points_at_application" INTEGER,
    "reviewed_by" TEXT,
    "review_date" TIMESTAMP(3),
    "decision_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "loans" (
    "loan_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "loan_account_id" TEXT NOT NULL,
    "approval_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disbursement_date" TIMESTAMP(3),
    "principal_amount" DECIMAL(12,2) NOT NULL,
    "interest_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "term_months" INTEGER NOT NULL,
    "installment_amount" DECIMAL(12,2) NOT NULL,
    "loan_status" "LoanStatus" NOT NULL DEFAULT 'disbursement_pending',
    "maturity_date" DATE NOT NULL,
    "guarantor_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("loan_id")
);

-- CreateTable
CREATE TABLE "repayment_schedule" (
    "schedule_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "principal_due" DECIMAL(12,2) NOT NULL,
    "interest_due" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_due" DECIMAL(12,2) NOT NULL,
    "total_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'due',
    "paid_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repayment_schedule_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateTable
CREATE TABLE "repayment_transactions" (
    "repayment_txn_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "payment_channel" TEXT NOT NULL,
    "reference_number" TEXT,
    "recorded_by" TEXT,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repayment_transactions_pkey" PRIMARY KEY ("repayment_txn_id")
);

-- CreateTable
CREATE TABLE "behavioural_feature_snapshots" (
    "snapshot_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savings_regularity" DECIMAL(5,4) NOT NULL,
    "savings_consistency" DECIMAL(5,4) NOT NULL,
    "withdrawal_discipline" DECIMAL(5,4) NOT NULL,
    "income_stability" DECIMAL(5,4) NOT NULL,
    "response_to_reminders" DECIMAL(5,4) NOT NULL,
    "feature_window_start" DATE NOT NULL,
    "feature_window_end" DATE NOT NULL,
    "computed_by_model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavioural_feature_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateTable
CREATE TABLE "risk_scores" (
    "risk_score_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "beta_0" DECIMAL(10,6) NOT NULL,
    "score_s_i" DECIMAL(10,6) NOT NULL,
    "repayment_probability_p_i" DECIMAL(5,4) NOT NULL,
    "risk_band" "RiskBand" NOT NULL,
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_scores_pkey" PRIMARY KEY ("risk_score_id")
);

-- CreateTable
CREATE TABLE "repayment_outcomes" (
    "outcome_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "observation_period_start" DATE NOT NULL,
    "observation_period_end" DATE NOT NULL,
    "repayment_reliable" BOOLEAN NOT NULL,
    "days_past_due" INTEGER NOT NULL DEFAULT 0,
    "default_flag" BOOLEAN NOT NULL DEFAULT false,
    "generated_from_rule" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repayment_outcomes_pkey" PRIMARY KEY ("outcome_id")
);

-- CreateTable
CREATE TABLE "member_shares" (
    "share_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "share_purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "number_of_shares" INTEGER NOT NULL,
    "share_value" DECIMAL(12,2) NOT NULL,
    "total_share_value" DECIMAL(12,2) NOT NULL,
    "status" "ShareStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_shares_pkey" PRIMARY KEY ("share_id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "group_membership_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "join_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_in_group" "GroupRole" NOT NULL DEFAULT 'member',
    "status" "GroupMembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("group_membership_id")
);

-- CreateTable
CREATE TABLE "groups" (
    "group_id" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "group_type" "GroupType" NOT NULL,
    "formation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GroupStatus" NOT NULL DEFAULT 'forming',
    "facilitator_name" TEXT,
    "description" TEXT,
    "target_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "audit_id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "action_type" "AuditActionType" NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_membership_number_key" ON "members"("membership_number");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_membership_status_idx" ON "members"("membership_status");

-- CreateIndex
CREATE INDEX "members_city_region_idx" ON "members"("city", "region");

-- CreateIndex
CREATE INDEX "members_joined_date_idx" ON "members"("joined_date");

-- CreateIndex
CREATE INDEX "member_registration_member_id_idx" ON "member_registration"("member_id");

-- CreateIndex
CREATE INDEX "member_registration_registration_date_idx" ON "member_registration"("registration_date");

-- CreateIndex
CREATE INDEX "kyc_verification_member_id_idx" ON "kyc_verification"("member_id");

-- CreateIndex
CREATE INDEX "kyc_verification_verification_status_idx" ON "kyc_verification"("verification_status");

-- CreateIndex
CREATE INDEX "kyc_verification_onfido_check_id_idx" ON "kyc_verification"("onfido_check_id");

-- CreateIndex
CREATE INDEX "next_of_kin_member_id_idx" ON "next_of_kin"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_accounts_account_number_key" ON "member_accounts"("account_number");

-- CreateIndex
CREATE INDEX "member_accounts_member_id_idx" ON "member_accounts"("member_id");

-- CreateIndex
CREATE INDEX "member_accounts_account_status_idx" ON "member_accounts"("account_status");

-- CreateIndex
CREATE UNIQUE INDEX "member_accounts_member_id_account_type_key" ON "member_accounts"("member_id", "account_type");

-- CreateIndex
CREATE UNIQUE INDEX "savings_transactions_reference_number_key" ON "savings_transactions"("reference_number");

-- CreateIndex
CREATE UNIQUE INDEX "savings_transactions_idempotency_key_key" ON "savings_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "savings_transactions_member_id_idx" ON "savings_transactions"("member_id");

-- CreateIndex
CREATE INDEX "savings_transactions_account_id_transaction_date_idx" ON "savings_transactions"("account_id", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "savings_transactions_transaction_date_idx" ON "savings_transactions"("transaction_date");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_transactions_reference_number_key" ON "withdrawal_transactions"("reference_number");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_transactions_idempotency_key_key" ON "withdrawal_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "withdrawal_transactions_member_id_idx" ON "withdrawal_transactions"("member_id");

-- CreateIndex
CREATE INDEX "withdrawal_transactions_account_id_transaction_date_idx" ON "withdrawal_transactions"("account_id", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "income_records_member_id_idx" ON "income_records"("member_id");

-- CreateIndex
CREATE INDEX "income_records_record_period_start_idx" ON "income_records"("record_period_start");

-- CreateIndex
CREATE INDEX "reminder_logs_member_id_idx" ON "reminder_logs"("member_id");

-- CreateIndex
CREATE INDEX "reminder_logs_related_loan_id_idx" ON "reminder_logs"("related_loan_id");

-- CreateIndex
CREATE INDEX "reminder_logs_sent_date_idx" ON "reminder_logs"("sent_date");

-- CreateIndex
CREATE INDEX "reminder_responses_reminder_id_idx" ON "reminder_responses"("reminder_id");

-- CreateIndex
CREATE INDEX "reminder_responses_member_id_idx" ON "reminder_responses"("member_id");

-- CreateIndex
CREATE INDEX "loan_applications_member_id_idx" ON "loan_applications"("member_id");

-- CreateIndex
CREATE INDEX "loan_applications_application_status_idx" ON "loan_applications"("application_status");

-- CreateIndex
CREATE INDEX "loan_applications_application_date_idx" ON "loan_applications"("application_date");

-- CreateIndex
CREATE UNIQUE INDEX "loans_application_id_key" ON "loans"("application_id");

-- CreateIndex
CREATE INDEX "loans_member_id_idx" ON "loans"("member_id");

-- CreateIndex
CREATE INDEX "loans_loan_status_idx" ON "loans"("loan_status");

-- CreateIndex
CREATE INDEX "loans_maturity_date_idx" ON "loans"("maturity_date");

-- CreateIndex
CREATE INDEX "repayment_schedule_loan_id_idx" ON "repayment_schedule"("loan_id");

-- CreateIndex
CREATE INDEX "repayment_schedule_due_date_idx" ON "repayment_schedule"("due_date");

-- CreateIndex
CREATE INDEX "repayment_schedule_status_idx" ON "repayment_schedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "repayment_schedule_loan_id_installment_number_key" ON "repayment_schedule"("loan_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "repayment_transactions_reference_number_key" ON "repayment_transactions"("reference_number");

-- CreateIndex
CREATE UNIQUE INDEX "repayment_transactions_idempotency_key_key" ON "repayment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "repayment_transactions_loan_id_payment_date_idx" ON "repayment_transactions"("loan_id", "payment_date" DESC);

-- CreateIndex
CREATE INDEX "repayment_transactions_member_id_idx" ON "repayment_transactions"("member_id");

-- CreateIndex
CREATE INDEX "behavioural_feature_snapshots_member_id_idx" ON "behavioural_feature_snapshots"("member_id");

-- CreateIndex
CREATE INDEX "behavioural_feature_snapshots_snapshot_date_idx" ON "behavioural_feature_snapshots"("snapshot_date");

-- CreateIndex
CREATE INDEX "risk_scores_member_id_scored_at_idx" ON "risk_scores"("member_id", "scored_at" DESC);

-- CreateIndex
CREATE INDEX "risk_scores_risk_band_idx" ON "risk_scores"("risk_band");

-- CreateIndex
CREATE INDEX "repayment_outcomes_member_id_idx" ON "repayment_outcomes"("member_id");

-- CreateIndex
CREATE INDEX "repayment_outcomes_loan_id_idx" ON "repayment_outcomes"("loan_id");

-- CreateIndex
CREATE INDEX "member_shares_member_id_idx" ON "member_shares"("member_id");

-- CreateIndex
CREATE INDEX "group_memberships_member_id_idx" ON "group_memberships"("member_id");

-- CreateIndex
CREATE INDEX "group_memberships_group_id_idx" ON "group_memberships"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_member_id_group_id_key" ON "group_memberships"("member_id", "group_id");

-- CreateIndex
CREATE INDEX "groups_status_idx" ON "groups"("status");

-- CreateIndex
CREATE INDEX "groups_group_type_idx" ON "groups"("group_type");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_idx" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_logs_changed_by_idx" ON "audit_logs"("changed_by");

-- CreateIndex
CREATE INDEX "audit_logs_changed_at_idx" ON "audit_logs"("changed_at");

-- AddForeignKey
ALTER TABLE "member_registration" ADD CONSTRAINT "member_registration_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_verification" ADD CONSTRAINT "kyc_verification_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "next_of_kin" ADD CONSTRAINT "next_of_kin_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_accounts" ADD CONSTRAINT "member_accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "member_accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_transactions" ADD CONSTRAINT "withdrawal_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_transactions" ADD CONSTRAINT "withdrawal_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "member_accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_related_loan_id_fkey" FOREIGN KEY ("related_loan_id") REFERENCES "loans"("loan_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_responses" ADD CONSTRAINT "reminder_responses_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminder_logs"("reminder_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_responses" ADD CONSTRAINT "reminder_responses_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "member_accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_schedule" ADD CONSTRAINT "repayment_schedule_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("loan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_transactions" ADD CONSTRAINT "repayment_transactions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("loan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_transactions" ADD CONSTRAINT "repayment_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_transactions" ADD CONSTRAINT "repayment_transactions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "repayment_schedule"("schedule_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioural_feature_snapshots" ADD CONSTRAINT "behavioural_feature_snapshots_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "behavioural_feature_snapshots"("snapshot_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_outcomes" ADD CONSTRAINT "repayment_outcomes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_outcomes" ADD CONSTRAINT "repayment_outcomes_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("loan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_shares" ADD CONSTRAINT "member_shares_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "members"("member_id") ON DELETE SET NULL ON UPDATE CASCADE;
