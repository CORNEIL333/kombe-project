/**
 * Tâche planifiée « rappels » : à lancer une à deux fois par jour (cron,
 * Cloudflare Cron Trigger, systemd timer…). Lit KOMBE_API_DATABASE_URL.
 *   node dist/tontine/remindersCli.js
 */
import { createApiPool } from "../db/pgPool.js";
import { runReminders } from "./insights.js";

const url = process.env.KOMBE_API_DATABASE_URL;
if (!url) {
  process.stderr.write("KOMBE_API_DATABASE_URL absente\n");
  process.exit(2);
}
const pool = createApiPool({ connectionString: url, max: 2 });
try {
  const out = await runReminders(pool, Date.now());
  process.stdout.write(`${JSON.stringify({ target: "kombe.reminders", status: "OK", ...out })}\n`);
} finally {
  await pool.end();
}
