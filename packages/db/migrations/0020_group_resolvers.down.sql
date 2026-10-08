-- KÓMBE — DÉMONTAGE de la migration 0020_group_resolvers.sql (ordre inverse).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

ALTER TABLE rights_request DROP CONSTRAINT IF EXISTS rights_version_positive;
ALTER TABLE rights_request DROP COLUMN IF EXISTS version;

DROP FUNCTION IF EXISTS kombe_privacy_revoked_identities();
DROP FUNCTION IF EXISTS kombe_privacy_active_identities();
DROP FUNCTION IF EXISTS kombe_privacy_is_active_member(text);
DROP FUNCTION IF EXISTS kombe_privacy_subject_group(text);
DROP FUNCTION IF EXISTS kombe_privacy_rights_group(text);
DROP FUNCTION IF EXISTS kombe_support_request_group(text);
DROP FUNCTION IF EXISTS kombe_export_manifest_group(text);
DROP FUNCTION IF EXISTS kombe_vote_group(text);
DROP FUNCTION IF EXISTS kombe_invitation_group(text);

COMMIT;
