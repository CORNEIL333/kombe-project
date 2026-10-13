#!/usr/bin/env bash
# KÓMBE — exécute TOUTES les preuves base réelle sur une PostgreSQL 16 locale.
#
# Pour chaque preuve : base `kombe_proof` recréée, rôles provisionnés comme en CI
# (h00-trusted.yml), schéma appliqué par le VRAI runner (`migrate.mjs migrate`),
# puis la preuve. Aucun succès simulé : le code de sortie de chaque preuve est
# affiché tel quel et le script sort en 1 si une seule échoue.
#
# Prérequis : `pnpm -r run build` ; un serveur PostgreSQL 16 joignable avec un
# super-utilisateur (KOMBE_PG_SUPERUSER_URL, défaut postgresql://postgres@localhost:5432).
# Usage : scripts/proofs-local.sh [motif]   (ex. « tontine » pour une seule preuve)
set -uo pipefail
cd "$(dirname "$0")/.."

SU="${KOMBE_PG_SUPERUSER_URL:-postgresql://postgres@localhost:5432}"
DB=kombe_proof
HOSTPART="${SU#*@}"; HOSTPART="${HOSTPART%%/*}"
U="postgresql://kombe_migrateur:kombe@${HOSTPART}/${DB}"
OUT="${KOMBE_PROOF_LOGS:-/tmp/kombe-proofs}"; mkdir -p "$OUT"

provision() {
  psql "$SU/postgres" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null 2>&1 || return 1
  psql "$SU/$DB" -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL' || return 1
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kombe_migrateur') THEN CREATE ROLE kombe_migrateur LOGIN PASSWORD 'kombe'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kombe_app') THEN CREATE ROLE kombe_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kombe_worker') THEN CREATE ROLE kombe_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF;
END $$;
GRANT kombe_app TO kombe_migrateur;
GRANT kombe_worker TO kombe_migrateur;
SQL
  psql "$SU/$DB" -v ON_ERROR_STOP=1 -q \
    -c "ALTER DATABASE $DB OWNER TO kombe_migrateur" \
    -c "ALTER SCHEMA public OWNER TO kombe_migrateur" \
    -c "GRANT USAGE ON SCHEMA public TO kombe_app" \
    -c "ALTER DEFAULT PRIVILEGES FOR ROLE kombe_migrateur IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kombe_app" >/dev/null
}

if ! psql "$SU/postgres" -tAc "select 1" >/dev/null 2>&1; then
  echo "BLOCKED : aucune PostgreSQL joignable via KOMBE_PG_SUPERUSER_URL=$SU"; exit 2
fi

fail=0
for f in packages/db/tests/*.pg.mjs packages/api/test/*.proof.mjs; do
  [ -f "$f" ] || continue
  if [ "${1:-}" != "" ] && [[ "$f" != *"$1"* ]]; then continue; fi
  n=$(basename "$f")
  if ! provision; then echo "$n : provision FAIL"; fail=1; continue; fi
  if ! KOMBE_DATABASE_URL="$U" node packages/db/scripts/migrate.mjs migrate >"$OUT/$n.migrate.log" 2>&1; then
    echo "$n : migrate FAIL (voir $OUT/$n.migrate.log)"; fail=1; continue
  fi
  KOMBE_TEST_DATABASE_URL="$U" KOMBE_API_DATABASE_URL="$U" KOMBE_DATABASE_URL="$U" \
    timeout 900 node "$f" >"$OUT/$n.log" 2>&1
  code=$?
  echo "$n exit=$code"
  [ $code -eq 0 ] || fail=1
done
exit $fail
