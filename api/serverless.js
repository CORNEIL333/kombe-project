// KÓMBE — point d'entrée serverless Vercel (§25).
// Zero-config Vercel : tout fichier sous api/ à la racine du projet devient une
// Serverless Function. Ce relais n'expose que le handler compilé de
// @kombe/api — aucune logique ici (build : pnpm --filter @kombe/api run build).
const mod = require("../packages/api/dist/serverless.js");
const handler = mod && typeof mod.default === "function" ? mod.default : mod;
module.exports = handler;
module.exports.default = handler;
