# syntax=docker/dockerfile:1
# KÓMBE — image du socle déployable (API Fastify + worker outbox + scripts de
# déploiement db).
#
# HONNÊTETÉ : cette image démarre l'API en mode RÉEL dès que
# `KOMBE_API_DATABASE_URL` est fournie (stores Pg* persistants, sessions
# Bearer, RLS kombe_app par transaction — preuves d'intégration Neon PASS).
# SANS cette variable, l'API tombe explicitement sur ses stores FICTIFS en
# mémoire : état de repli du squelette, PAS un backend de production. Le
# worker (`node packages/worker/dist/main.js`, service `worker` de
# docker-compose.yml) exige `KOMBE_WORKER_DATABASE_URL` et sort en erreur
# sinon (fail-loud, jamais de boucle fictive). Elle embarque AUSSI les scripts
# réels de packages/db (migrate.mjs, isolation.pg.mjs) pour qu'un hôte disposant
# de Docker puisse appliquer le schéma et exécuter les preuves base réelle sur
# Postgres 16.
#
# Le build ne compile QUE domain+worker+api (tsc pur) : pas de Vite/esbuild du
# client (placeholder), conformément à la politique sémantique de C00 (allowBuilds:false).

# ── Étape 1 : installation des dépendances + build ───────────────────────────
FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
# Copie du dépôt complet puis installation reproductible verrouillée sur le
# lockfile (--frozen-lockfile) : le lockfile est vérifié synchrone avec les
# package.json (pnpm install --frozen-lockfile → exit 0). Toute dérive de
# dépendance casse le build au lieu de s'infiltrer silencieusement dans l'image.
COPY . .
RUN pnpm install --frozen-lockfile
# domain + api (socle applicatif) ET worker : packages/db/tests/isolation.pg.mjs
# importe packages/worker/dist/pgWorker.js et packages/worker/test/postgres.mjs
# (recettes C13 en base réelle). Sans le build du worker, `dbtest` échouerait en
# ERR_MODULE_NOT_FOUND. L'ordre domain→worker respecte la dépendance de types.
RUN pnpm --filter @kombe/domain build \
 && pnpm --filter @kombe/worker build \
 && pnpm --filter @kombe/api build

# ── Étape 2 : runtime non-root, minimal et reproductible ─────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
# On conserve l'arborescence du workspace (symlinks pnpm @kombe/*) telle quelle :
# c'est ce qui garantit que `require('@kombe/domain')` résout sans étape de prune
# casseuse. La taille est volontairement celle du build, pas un défaut.
COPY --from=build /app /app
RUN addgroup -S kombe && adduser -S kombe -G kombe \
    && chown -R kombe:kombe /app
USER kombe
EXPOSE 3000
# Santé : GET /v1/health/ready (readiness réelle : vérifie PostgreSQL en mode
# réel ; node 22 a fetch natif, pas de curl dans l'image).
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/api/dist/main.js"]
