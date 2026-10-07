-- Retour arrière de 0019_token_security.sql — purement additif, symétrique.
BEGIN;
ALTER TABLE verification_token DROP CONSTRAINT verification_token_purpose_check;
ALTER TABLE verification_token
  ADD CONSTRAINT verification_token_purpose_check
  CHECK (purpose IN ('registration','recovery'));
ALTER TABLE verification_token DROP COLUMN failed_attempts;
COMMIT;
