// KÓMBE — point d'entrée serverless Vercel (§25).
// Zero-config Vercel : tout fichier sous api/ à la racine du projet devient une
// Serverless Function. Ce relais n'expose que le handler compilé de
// @kombe/api — aucune logique ici (build : pnpm --filter @kombe/api run build).
// Module ES : @kombe/api est publié en ESM (`"type": "module"`) ; un require()
// échoue au chargement sur le runtime Vercel (ERR_REQUIRE_ESM).
import handler from "../packages/api/dist/serverless.js";

export default handler;
