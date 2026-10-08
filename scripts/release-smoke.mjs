// KÓMBE — release:smoke (§22) : une seule commande, vérifications RÉELLES
// uniquement (jamais simulées, §9). Cible un environnement DÉPLOYÉ
// (staging/production) — localhost ne compte pas comme déploiement (§33).
//
//   KOMBE_SMOKE_BASE_URL=https://… node scripts/release-smoke.mjs
//
// Contrats vérifiés contre le serveur réel :
//   SMOKE-LIVE      : GET /v1/health/live  → 200 { status: "ok" }
//   SMOKE-READY     : GET /v1/health/ready → 200, mode "réel" (PostgreSQL
//                     réellement interrogé — un mode "fictif" en production
//                     est un échec, pas un avertissement)
//   SMOKE-AUTH-401  : GET /v1/metrics/risks sans Authorization → 401
//                     (le chemin d'auth réel est actif, aucun repli fictif
//                     ne répond à la place)
//   SMOKE-AUTH-BAD  : même route avec un jeton invalide → 401
//
// Verdict : exit 0 (SMOKE_PASS) / exit 1 (SMOKE_FAIL) — jamais de PASS inventé.

const base = (process.env.KOMBE_SMOKE_BASE_URL ?? "").replace(/\/+$/, "");
if (!base || !/^https?:\/\//.test(base)) {
  process.stdout.write(JSON.stringify({
    status: "SMOKE_FAIL",
    reason: "KOMBE_SMOKE_BASE_URL absente ou invalide (http(s)://… requis).",
    exitCode: 1,
  }, null, 2) + "\n");
  process.exit(1);
}

const observations = {};
let failures = 0;

function check(name, cond, detail) {
  observations[name] = detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}

async function get(path, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { accept: "application/json", ...headers },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  let body = null;
  try { body = await response.json(); } catch { /* corps non-JSON conservé null */ }
  return { status: response.status, body };
}

const live = await get("/v1/health/live");
check("SMOKE-LIVE", live.status === 200 && live.body?.status === "ok", {
  status: live.status, body: live.body,
});

const ready = await get("/v1/health/ready");
check("SMOKE-READY", ready.status === 200 && ready.body?.mode === "réel", {
  status: ready.status, body: ready.body,
});

const noAuth = await get("/v1/metrics/risks");
check("SMOKE-AUTH-401", noAuth.status === 401, {
  status: noAuth.status, body: noAuth.body,
});

const badAuth = await get("/v1/metrics/risks", { authorization: "Bearer ses_invalide" });
check("SMOKE-AUTH-BAD", badAuth.status === 401, {
  status: badAuth.status, body: badAuth.body,
});

process.stdout.write(JSON.stringify({
  target: "kombe.release.smoke",
  baseUrl: base,
  status: failures === 0 ? "SMOKE_PASS" : "SMOKE_FAIL",
  observations,
  exitCode: failures === 0 ? 0 : 1,
}, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
