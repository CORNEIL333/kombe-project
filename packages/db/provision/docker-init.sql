-- KÓMBE — amorce du conteneur PostgreSQL : crée la base de TEST isolée en plus
-- de la base applicative par défaut. Exécuté une seule fois à l'init du volume
-- (docker-entrypoint-initdb.d). Idempotent via \gexec (pas d'erreur si elle existe).
-- Aucune donnée réelle : kombe_test ne reçoit que les fixtures fictives.
SELECT 'CREATE DATABASE kombe_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kombe_test')\gexec
