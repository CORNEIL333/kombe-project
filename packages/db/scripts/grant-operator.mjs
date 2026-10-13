// KÓMBE @kombe/db — accorde (ou retire) la fonction d'OPÉRATEUR de la plateforme.
//
// Les tableaux de bord Opérations, Direction et Engineering n'affichent leurs
// agrégats qu'à une identité opérateur (0029_ops_console : kombe_is_operator).
// Aucune route HTTP ne permet de devenir opérateur : c'est un acte
// d'administration de la base, tracé ici par la sortie JSON.
//
// La personne doit s'être connectée au moins une fois (le compte existe et son
// canal est vérifié). Usage :
//   KOMBE_DATABASE_URL=postgres://<propriétaire>@…/kombe_prod \
//     node packages/db/scripts/grant-operator.mjs +237677123456
//   … grant-operator.mjs awa@exemple.cm --revoke
// Sortie : 0 = fait, 1 = échec (compte introuvable…), 2 = BLOCKED (pas de base).

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const raw = args.find((a) => !a.startsWith("--"));

function emit(o, code) {
  process.stdout.write(JSON.stringify({ target: "kombe.db.grant-operator", ...o, exitCode: code }, null, 2) + "\n");
  process.exit(code);
}

/** Même forme canonique que l'API (`+237XXXXXXXXX` ou e-mail en minuscules). */
export function canonicalLogin(input) {
  const s = String(input ?? "").trim();
  if (s.includes("@")) return s.toLowerCase();
  let d = s.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (/^237\d{9}$/.test(d)) d = `+${d}`;
  if (/^\d{9}$/.test(d)) d = `+237${d}`;
  return d;
}

if (!raw) emit({ status: "FAIL", reason: "Usage : grant-operator.mjs <téléphone|e-mail> [--revoke]" }, 1);
const url = process.env.KOMBE_DATABASE_URL;
if (!url) emit({ status: "BLOCKED", reason: "KOMBE_DATABASE_URL absente" }, 2);

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  emit({ status: "BLOCKED", reason: "pilote pg absent (pnpm install)" }, 2);
}

const login = canonicalLogin(raw);
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const r = await client.query(
    `UPDATE identity_access SET is_operator = $2, updated_at = now()
      WHERE identity_id = $1 AND state = 'active' AND channel_verified
      RETURNING identity_id, is_operator`,
    [login, !revoke],
  );
  if (r.rowCount !== 1) {
    emit({ status: "FAIL", login, reason: "Compte introuvable ou jamais connecté : se connecter une fois à la PWA puis relancer." }, 1);
  }
  emit({ status: "OK", login, isOperator: r.rows[0].is_operator }, 0);
} catch (e) {
  emit({ status: "FAIL", login, reason: e instanceof Error ? e.message : String(e) }, 1);
} finally {
  await client.end().catch(() => undefined);
}
