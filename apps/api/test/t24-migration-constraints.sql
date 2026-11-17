-- Run only against the dedicated safethrift_kyc_preservation_test database.
BEGIN;
INSERT INTO members (member_id, membership_number, first_name, last_name, date_of_birth, phone_number, email, address_line_1, city, postcode, password_hash, updated_at)
VALUES ('t24-constraint-member', 't24-constraint-member', 'Synthetic', 'Fixture', '1990-01-01', 'test', 't24-constraint@example.invalid', 'test', 'test', 'test', 'test', CURRENT_TIMESTAMP);
INSERT INTO kyc_verification (kyc_id, member_id, document_type, updated_at)
VALUES ('t24-constraint-kyc', 't24-constraint-member', 'passport', CURRENT_TIMESTAMP);
INSERT INTO kyc_synthetic_attempts (id, verification_id, member_id, idempotency_key, request_hash, correlation_id, sequence)
VALUES ('t24-attempt', 't24-constraint-kyc', 't24-constraint-member', 'key', 'test-hash', 't24-correlation', 1);
INSERT INTO kyc_synthetic_events (id, attempt_id, event_id, event_hash, sequence, transition, outcome)
VALUES ('t24-event', 't24-attempt', 't24-event-id', 'test-hash', 1, 'verified', 'pending');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kyc_verification WHERE kyc_id = 't24-historical-kyc' AND member_id = 't24-historical-member' AND verification_status = 'verified') THEN
    RAISE EXCEPTION 'historical KYC changed';
  END IF;
  BEGIN
    INSERT INTO kyc_synthetic_attempts (id, verification_id, member_id, idempotency_key, request_hash, correlation_id, sequence, is_current)
    VALUES ('t24-cross-member', 't24-historical-kyc', 't24-constraint-member', 'other', 'hash', 'other-correlation', 2, false);
    RAISE EXCEPTION 'cross-member reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO kyc_synthetic_events (id, attempt_id, event_id, event_hash, sequence, transition, outcome)
    VALUES ('t24-duplicate-event', 't24-attempt', 't24-event-id', 'hash', 2, 'rejected', 'pending');
    RAISE EXCEPTION 'duplicate event was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO kyc_verification (kyc_id, member_id, document_type, updated_at)
  VALUES ('t24-second-kyc', 't24-constraint-member', 'passport', CURRENT_TIMESTAMP);
  BEGIN
    INSERT INTO kyc_synthetic_attempts (id, verification_id, member_id, idempotency_key, request_hash, correlation_id, sequence)
    VALUES ('t24-second-current', 't24-second-kyc', 't24-constraint-member', 'second', 'hash', 'second', 2);
    RAISE EXCEPTION 'second current attempt was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO kyc_synthetic_attempts (id, verification_id, member_id, idempotency_key, request_hash, correlation_id, sequence, is_current)
    VALUES ('t24-duplicate-key', 't24-second-kyc', 't24-constraint-member', 'key', 'hash', 'third', 2, false);
    RAISE EXCEPTION 'duplicate member idempotency key was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO kyc_synthetic_events (id, attempt_id, event_id, event_hash, sequence, transition, outcome)
    VALUES ('t24-duplicate-sequence', 't24-attempt', 'other-event', 'hash', 1, 'rejected', 'pending');
    RAISE EXCEPTION 'duplicate attempt sequence was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
ROLLBACK;
