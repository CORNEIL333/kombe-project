-- KÓMBE — Console d'exploitation (lots X-08, X-11, X-12, X-13).
--
-- Les tableaux de bord Opérations, Direction et Engineering ont besoin
-- d'agrégats TRANSVERSES aux groupes, alors que kombe_app vit sous RLS
-- (un groupe à la fois). Même idiome que 0018/0020/0023 : des fonctions
-- SECURITY DEFINER à sortie minimale, search_path figé, exécutables par
-- kombe_app, qui REFUSENT tout appelant non opérateur.
--
-- Garanties :
--  * opérateur = identité de la transaction (kombe.identity_id posée par la
--    résolution de session) avec identity_access.is_operator ET état actif ;
--  * aucune donnée individuelle : ni nom de membre, ni téléphone, ni montant
--    par personne. Les montants sont des TOTAUX déclarés/confirmés, jamais
--    une somme détenue par KÓMBE (le trésorier tient l'argent) ;
--  * lecture seule : aucune fonction n'écrit.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION kombe_is_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT a.is_operator AND a.state = 'active'
      FROM public.identity_access a
     WHERE a.identity_id = current_setting('kombe.identity_id', true)
  ), false)
$$;
REVOKE ALL ON FUNCTION kombe_is_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_is_operator() TO kombe_app;

-- Vue d'ensemble : files d'attente et volumes du moment.
CREATE FUNCTION kombe_ops_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  out jsonb;
BEGIN
  IF NOT kombe_is_operator() THEN
    RAISE EXCEPTION 'operator required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'groupsByState', COALESCE((SELECT jsonb_object_agg(state, n) FROM (SELECT state, count(*) AS n FROM public."group" GROUP BY state) s), '{}'::jsonb),
    'identities', (SELECT count(*) FROM public.identity),
    'identitiesLast7d', (SELECT count(*) FROM public.identity WHERE created_at > now() - interval '7 days'),
    'membershipsActive', (SELECT count(*) FROM public.membership WHERE state = 'active'),
    'membershipsPending', (SELECT count(*) FROM public.membership WHERE state = 'pending'),
    'sessionsActive24h', (SELECT count(DISTINCT identity_id) FROM public.access_session WHERE issued_at > now() - interval '24 hours' AND revoked_at IS NULL AND expires_at > now()),
    'meetingsOpen', (SELECT count(*) FROM public.meeting WHERE state = 'open'),
    'meetingsNext7d', (SELECT count(*) FROM public.meeting WHERE state = 'planned' AND scheduled_date BETWEEN current_date AND current_date + 7),
    'meetingsClosedNoMinutesApproval', (SELECT count(*) FROM public.meeting WHERE state = 'closed' AND minutes_approved_at IS NULL),
    'movementsDeclared', (SELECT count(*) FROM public.fund_movement WHERE state = 'declared'),
    'movementsDeclaredOver72h', (SELECT count(*) FROM public.fund_movement WHERE state = 'declared' AND declared_at < now() - interval '72 hours'),
    'oldestDeclaredAt', (SELECT min(declared_at) FROM public.fund_movement WHERE state = 'declared'),
    'payoutsAwaitingReceipt', (SELECT count(*) FROM public.fund_movement WHERE kind = 'payout' AND state IN ('declared','confirmed','validated') AND beneficiary_confirmed_at IS NULL),
    'finesContested', (SELECT count(*) FROM public.fine WHERE state = 'contested'),
    'aidsRequested', (SELECT count(*) FROM public.aid_request WHERE state = 'requested'),
    'debtsOpen', (SELECT count(*) FROM public.member_debt WHERE state = 'open'),
    'outboxPending', (SELECT count(*) FROM public.outbox WHERE state IN ('pending','retry','leased')),
    'outboxDead', (SELECT count(*) FROM public.outbox WHERE state IN ('dead','ambiguous')),
    'outboxOldestPendingAt', (SELECT min(created_at) FROM public.outbox WHERE state IN ('pending','retry')),
    'inboxLast24h', (SELECT count(*) FROM public.inbox_notification WHERE created_at > now() - interval '24 hours'),
    'supportRequestsPending', (SELECT count(*) FROM public.support_access_request WHERE status = 'pending_approval'),
    'securityEventsLast7d', (SELECT count(*) FROM public.security_log WHERE occurred_at > now() - interval '7 days'),
    'serverNow', now()
  ) INTO out;
  RETURN out;
END
$$;
REVOKE ALL ON FUNCTION kombe_ops_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_ops_overview() TO kombe_app;

-- Indicateurs hebdomadaires (Direction) : adoption et tenue du registre.
CREATE FUNCTION kombe_ops_kpis(weeks_in integer)
RETURNS TABLE(
  week_start date,
  groups_created bigint,
  identities_created bigint,
  members_admitted bigint,
  movements_declared bigint,
  movements_confirmed bigint,
  amount_declared numeric,
  amount_confirmed numeric,
  payouts_received bigint,
  meetings_closed bigint,
  median_confirm_hours numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT kombe_is_operator() THEN
    RAISE EXCEPTION 'operator required' USING ERRCODE = '42501';
  END IF;
  IF weeks_in IS NULL OR weeks_in < 1 OR weeks_in > 104 THEN
    RAISE EXCEPTION 'weeks out of range' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH w AS (
    SELECT generate_series(date_trunc('week', now())::date - (weeks_in - 1) * 7, date_trunc('week', now())::date, interval '7 days')::date AS ws
  )
  SELECT
    w.ws,
    (SELECT count(*) FROM public."group" g WHERE g.created_at >= w.ws AND g.created_at < w.ws + 7),
    (SELECT count(*) FROM public.identity i WHERE i.created_at >= w.ws AND i.created_at < w.ws + 7),
    (SELECT count(*) FROM public.membership m WHERE m.state = 'active' AND m.joined_at >= w.ws AND m.joined_at < w.ws + 7),
    (SELECT count(*) FROM public.fund_movement f WHERE f.declared_at >= w.ws AND f.declared_at < w.ws + 7 AND f.kind = 'contribution'),
    (SELECT count(*) FROM public.fund_movement f WHERE f.confirmed_at >= w.ws AND f.confirmed_at < w.ws + 7 AND f.kind = 'contribution'),
    (SELECT COALESCE(sum(f.amount), 0)::numeric FROM public.fund_movement f WHERE f.declared_at >= w.ws AND f.declared_at < w.ws + 7 AND f.kind = 'contribution' AND f.state <> 'rejected'),
    (SELECT COALESCE(sum(f.amount), 0)::numeric FROM public.fund_movement f WHERE f.confirmed_at >= w.ws AND f.confirmed_at < w.ws + 7 AND f.kind = 'contribution' AND f.state IN ('confirmed','validated')),
    (SELECT count(*) FROM public.fund_movement f WHERE f.kind = 'payout' AND f.beneficiary_confirmed_at >= w.ws AND f.beneficiary_confirmed_at < w.ws + 7),
    (SELECT count(*) FROM public.meeting mt WHERE mt.closed_at >= w.ws AND mt.closed_at < w.ws + 7),
    (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM f.confirmed_at - f.declared_at) / 3600))::numeric, 1)
       FROM public.fund_movement f WHERE f.confirmed_at >= w.ws AND f.confirmed_at < w.ws + 7)
  FROM w
  ORDER BY w.ws;
END
$$;
REVOKE ALL ON FUNCTION kombe_ops_kpis(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_ops_kpis(integer) TO kombe_app;

-- Liste des groupes (Opérations) : santé de chaque groupe, sans personne nommée.
CREATE FUNCTION kombe_ops_groups(limit_in integer)
RETURNS TABLE(
  group_id text,
  display_name text,
  state text,
  created_at timestamptz,
  members_active bigint,
  members_pending bigint,
  meetings_total bigint,
  meetings_closed bigint,
  movements_declared_pending bigint,
  oldest_pending_at timestamptz,
  open_debts bigint,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT kombe_is_operator() THEN
    RAISE EXCEPTION 'operator required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT g.group_id, g.display_name, g.state, g.created_at,
         (SELECT count(*) FROM public.membership m WHERE m.group_id = g.group_id AND m.state = 'active'),
         (SELECT count(*) FROM public.membership m WHERE m.group_id = g.group_id AND m.state = 'pending'),
         (SELECT count(*) FROM public.meeting mt WHERE mt.group_id = g.group_id),
         (SELECT count(*) FROM public.meeting mt WHERE mt.group_id = g.group_id AND mt.state = 'closed'),
         (SELECT count(*) FROM public.fund_movement f WHERE f.group_id = g.group_id AND f.state = 'declared'),
         (SELECT min(f.declared_at) FROM public.fund_movement f WHERE f.group_id = g.group_id AND f.state = 'declared'),
         (SELECT count(*) FROM public.member_debt d WHERE d.group_id = g.group_id AND d.state = 'open'),
         GREATEST(g.created_at,
                  (SELECT max(j.recorded_at) FROM public.journal j WHERE j.group_id = g.group_id))
    FROM public."group" g
   ORDER BY 12 DESC NULLS LAST
   LIMIT LEAST(GREATEST(COALESCE(limit_in, 100), 1), 500);
END
$$;
REVOKE ALL ON FUNCTION kombe_ops_groups(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_ops_groups(integer) TO kombe_app;

-- Engineering : schéma réellement appliqué et état de la base.
CREATE FUNCTION kombe_ops_engineering()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  out jsonb;
  has_ledger boolean;
BEGIN
  IF NOT kombe_is_operator() THEN
    RAISE EXCEPTION 'operator required' USING ERRCODE = '42501';
  END IF;
  SELECT to_regclass('public.kombe_migration') IS NOT NULL INTO has_ledger;
  SELECT jsonb_build_object(
    'postgresVersion', current_setting('server_version'),
    'databaseSizeBytes', pg_database_size(current_database()),
    'migrations', CASE WHEN has_ledger THEN
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'appliedAt', applied_at) ORDER BY name), '[]'::jsonb) FROM public.kombe_migration)
      ELSE '[]'::jsonb END,
    'journalEntries', (SELECT count(*) FROM public.journal),
    'idempotencyKeys', (SELECT count(*) FROM public.api_idempotency),
    'serverNow', now()
  ) INTO out;
  RETURN out;
END
$$;
REVOKE ALL ON FUNCTION kombe_ops_engineering() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_ops_engineering() TO kombe_app;

COMMIT;
