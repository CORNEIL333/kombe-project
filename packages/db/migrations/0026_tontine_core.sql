-- KÓMBE — Tontine réelle, socle produit (lots L-01, L-02, L-11, I-05, I-06, I-14).
-- Additive : n'altère aucune donnée existante, élargit seulement des CHECK.
--
--  * groupe : créateur, réglages (transparence, frais Mobile Money,
--    avaliseur…) ; nom affiché et devise : colonnes de 0024 ;
--  * adhésion : nom affiché dans le groupe, admission tracée (qui, par quelle
--    invitation), avaliseur (L-10), représentant pour un membre sans
--    smartphone (L-17) ;
--  * bureau élargi (L-11) : vice-président, trésorier adjoint, censeur,
--    conseiller ; mandat daté ; proposant et approbateur distincts ;
--  * invitation : créateur et CODE court à saisir (« Rejoindre avec un code ») ;
--  * profil d'identité (nom, langue) en RLS self-scope ;
--  * deux fonctions SECURITY DEFINER à sortie minimale : « mes groupes » et
--    la recherche d'une invitation par code (même idiom que 0018/0020/0023).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── Groupe ──────────────────────────────────────────────────────────────────
-- Le nom affiché (display_name) et la devise (currency, XAF) viennent de 0024
-- (amorçage, déjà en production) : on borne seulement la longueur du nom.
ALTER TABLE "group"
  ADD CONSTRAINT group_display_name_len
    CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 120),
  ADD COLUMN created_by_identity_id text REFERENCES identity(identity_id),
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object');

-- ── Adhésion ────────────────────────────────────────────────────────────────
ALTER TABLE membership
  ADD COLUMN display_name text
    CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80),
  ADD COLUMN joined_at timestamptz,
  ADD COLUMN admitted_by_identity_id text,
  ADD COLUMN invitation_id text,
  ADD COLUMN sponsor_membership_id text,
  ADD COLUMN proxy_membership_id text,
  ADD CONSTRAINT membership_sponsor_fk FOREIGN KEY (group_id, sponsor_membership_id)
    REFERENCES membership(group_id, membership_id),
  ADD CONSTRAINT membership_proxy_fk FOREIGN KEY (group_id, proxy_membership_id)
    REFERENCES membership(group_id, membership_id),
  ADD CONSTRAINT membership_sponsor_not_self
    CHECK (sponsor_membership_id IS NULL OR sponsor_membership_id <> membership_id),
  ADD CONSTRAINT membership_proxy_not_self
    CHECK (proxy_membership_id IS NULL OR proxy_membership_id <> membership_id),
  -- L'admission (pending → active) est faite par une AUTRE personne.
  ADD CONSTRAINT membership_admitted_by_other
    CHECK (admitted_by_identity_id IS NULL OR admitted_by_identity_id <> identity_id);

-- Une seule demande d'adhésion en attente par (groupe, identité).
CREATE UNIQUE INDEX membership_one_pending
  ON membership (group_id, identity_id) WHERE state = 'pending';

-- ── Bureau (L-11) ───────────────────────────────────────────────────────────
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_role_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_role_check
  CHECK (role IN ('animator','vice_president','secretary','treasurer','treasurer_deputy',
                  'auditor','censor','advisor','member'));
ALTER TABLE role_assignment
  ADD COLUMN proposed_by_identity_id text,
  ADD COLUMN approved_by_identity_id text,
  ADD COLUMN mandate_start date,
  ADD COLUMN mandate_end date,
  ADD COLUMN ended_at timestamptz,
  ADD CONSTRAINT role_assignment_mandate
    CHECK (mandate_end IS NULL OR mandate_start IS NULL OR mandate_end > mandate_start),
  ADD CONSTRAINT role_assignment_approver_distinct
    CHECK (approved_by_identity_id IS NULL OR proposed_by_identity_id IS NULL
           OR approved_by_identity_id <> proposed_by_identity_id);

-- Unicité d'une fonction active par adhésion : contrôlée par le serveur
-- (les données historiques contiennent des lignes « member » multiples,
-- ex. la désignation du suppléant du trésorier ; un index unique casserait
-- la migration sur une base existante).

ALTER TABLE journal DROP CONSTRAINT journal_actor_role_check;
ALTER TABLE journal ADD CONSTRAINT journal_actor_role_check
  CHECK (actor_role IS NULL OR actor_role IN
    ('founder','animator','vice_president','secretary','treasurer','treasurer_deputy',
     'auditor','censor','advisor','member'));

-- ── Invitations ─────────────────────────────────────────────────────────────
ALTER TABLE invitation
  ADD COLUMN created_by_identity_id text,
  ADD COLUMN code text CHECK (code IS NULL OR code ~ '^[A-HJ-NP-Z2-9]{8}$');
CREATE UNIQUE INDEX invitation_code_unique ON invitation (code) WHERE code IS NOT NULL;

-- ── Profil d'identité (self-scope) ─────────────────────────────────────────
CREATE TABLE identity_profile (
  identity_id  text PRIMARY KEY REFERENCES identity(identity_id),
  display_name text CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80),
  language     text NOT NULL DEFAULT 'fr' CHECK (language IN ('fr','en','pcm')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE identity_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_scope ON identity_profile
  USING (identity_id = current_setting('kombe.identity_id', true))
  WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT, INSERT, UPDATE ON identity_profile TO kombe_app;

-- ── « Mes groupes » : sortie minimale, identité de la transaction seulement ─
CREATE FUNCTION kombe_my_memberships()
RETURNS TABLE(
  group_id text,
  membership_id text,
  membership_state text,
  group_name text,
  group_state text,
  roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.group_id, m.membership_id, m.state, g.display_name, g.state,
         COALESCE(
           (SELECT array_agg(r.role ORDER BY r.role)
              FROM public.role_assignment r
             WHERE r.group_id = m.group_id AND r.membership_id = m.membership_id
               AND r.accepted_at IS NOT NULL AND r.ended_at IS NULL),
           ARRAY[]::text[])
  FROM public.membership m
  JOIN public."group" g ON g.group_id = m.group_id
  WHERE current_setting('kombe.identity_id', true) IS NOT NULL
    AND m.identity_id = current_setting('kombe.identity_id', true)
    AND m.state IN ('pending','active')
$$;
REVOKE ALL ON FUNCTION kombe_my_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_my_memberships() TO kombe_app;

-- ── Invitation par code : réservé à une session authentifiée ───────────────
CREATE FUNCTION kombe_invitation_by_code(code_in text)
RETURNS TABLE(
  invitation_id text,
  group_id text,
  group_name text,
  usable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.invitation_id, i.group_id, g.display_name,
         (i.revoked_at IS NULL AND i.expires_at > now() AND i.used_count < i.max_uses)
  FROM public.invitation i
  JOIN public."group" g ON g.group_id = i.group_id
  WHERE current_setting('kombe.identity_id', true) IS NOT NULL
    AND code_in ~ '^[A-HJ-NP-Z2-9]{8}$'
    AND i.code = code_in
$$;
REVOKE ALL ON FUNCTION kombe_invitation_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_invitation_by_code(text) TO kombe_app;

COMMIT;
