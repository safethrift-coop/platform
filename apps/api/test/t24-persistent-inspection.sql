-- Supervisor-only inspection of the harness-owned disposable database.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM kyc_verification k
    JOIN kyc_synthetic_attempts a ON a.verification_id=k.kyc_id
    WHERE k.document_number IS NOT NULL OR k.document_issue_date IS NOT NULL
      OR k.document_expiry_date IS NOT NULL OR k.onfido_applicant_id IS NOT NULL
      OR k.onfido_check_id IS NOT NULL OR k.verified_by IS NOT NULL
      OR k.verification_date IS NOT NULL OR k.proof_of_address_type IS NOT NULL
      OR k.proof_of_address_status IS NOT NULL OR k.risk_flag
      OR k.risk_flag_reason IS NOT NULL OR k.notes IS NOT NULL
  ) THEN RAISE EXCEPTION 'Synthetic KYC persisted forbidden fields'; END IF;

  IF EXISTS (
    SELECT 1 FROM audit_logs l
    JOIN kyc_synthetic_attempts a ON a.verification_id=l.record_id
    WHERE l.table_name <> 'kyc_verification' OR l.changed_by <> a.member_id
      OR l.old_value IS NOT NULL OR l.ip_address IS NOT NULL OR l.user_agent IS NOT NULL
      OR jsonb_typeof(l.new_value::jsonb) <> 'object'
      OR l.new_value::jsonb->>'mode' IS DISTINCT FROM 'synthetic'
      OR l.new_value::jsonb->>'status' NOT IN ('pending','in_progress','verified','rejected','expired')
      OR l.new_value::jsonb - 'mode' - 'status' <> '{}'::jsonb
  ) THEN RAISE EXCEPTION 'Synthetic audit persistence was not minimal'; END IF;

  IF EXISTS (SELECT 1 FROM kyc_synthetic_attempts WHERE verification_id='t24-historical-kyc')
    THEN RAISE EXCEPTION 'Historical synthetic provenance was inferred'; END IF;
  IF EXISTS (SELECT 1 FROM kyc_synthetic_attempts WHERE is_current GROUP BY member_id HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'Ambiguous current attempts persisted'; END IF;
  IF EXISTS (SELECT 1 FROM t24_audit_failure) OR EXISTS (SELECT 1 FROM t24_event_failure)
    THEN RAISE EXCEPTION 'Failure injection remained enabled'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('member_accounts'),('savings_transactions'),('withdrawal_transactions'),
      ('income_records'),('loan_applications'),('loans'),('repayment_schedule'),
      ('repayment_transactions'),('member_shares')) AS t(name)
    WHERE has_table_privilege('t24_test', t.name, 'INSERT,UPDATE,DELETE')
  ) THEN RAISE EXCEPTION 'T24 application role acquired financial write privileges'; END IF;
END $$;

SELECT jsonb_build_object(
  'inspection', 'T24 persisted synthetic data',
  'attempt_rows', (SELECT count(*) FROM kyc_synthetic_attempts),
  'event_rows', (SELECT count(*) FROM kyc_synthetic_events),
  'synthetic_audit_rows', (SELECT count(*) FROM audit_logs WHERE record_id IN (SELECT verification_id FROM kyc_synthetic_attempts)),
  'forbidden_fields', 0,
  'historical_provenance_inferred', 0,
  'financial_write_privileges', false,
  'audit_immutability_claimed', false
) AS acceptance_evidence;
