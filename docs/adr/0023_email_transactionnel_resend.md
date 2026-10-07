# ADR-0023 — Email transactionnel : Resend

- **Statut :** ADOPTÉ — décision humaine du 2026-10-07.
- **Décision remplacée :** `OPEN-D04` de `STACK.md`.
- **Portée :** canal de vérification de compte et de récupération (C02,
  `ADR-0012`), notices légales (C16). **Devient le canal unique** depuis que
  `OPEN-D05` (SMS/OTP) a été écarté pour ce premier déploiement — aucune
  dépendance SMS n'est introduite par cette décision.
- **Contexte / origine :** `01_Audit/02_Technologies/TECHNOLOGIES_ET_ALTERNATIVES.md`
  TEC09 (Resend · Brevo · Amazon SES documentés) ; `ADR-0012` (jetons de
  vérification/récupération, anti-énumération) ; `ADR-0022` (le trio
  d'hébergement n'impose aucun fournisseur AWS — SES aurait introduit un
  quatrième compte cloud hors du cloisonnement déjà posé).

## Décision

KÓMBE adopte **Resend** comme fournisseur d'email transactionnel.

Retenu plutôt que Brevo (second choix raisonnable, écarté seulement par
préférence de mise en route) et Amazon SES (écarté : démarre en sandbox
avec revue de sortie, et ajoute un compte AWS/IAM distinct alors que
`ADR-0022` vise délibérément à limiter le nombre de comptes cloud séparés
à Vercel + Cloudflare + Neon).

## Conséquences

- `RESEND_API_KEY` est un secret : jamais commité, jamais en clair dans un
  fichier versionné. Local : `.env` (gitignored). Production : gestionnaire
  de secrets Vercel au moment du déploiement réel (`ADR-0022`).
- Domaine expéditeur à authentifier (SPF/DKIM/DMARC) avant tout envoi réel
  — pas encore fait, à faire au moment de l'intégration.
- Aucun envoi réel n'a lieu avant la porte G0 (`ADR-0010`, `STACK.md` §4,
  règle « pas de message réel au pilote ») : l'intégration applicative
  (choix de ce fournisseur) est distincte de l'autorisation d'envoyer.
- Le contrat anti-énumération de `ADR-0012` (réponse identique compte
  connu/inconnu) reste un invariant **serveur**, indépendant du fournisseur
  email : Resend ne doit jamais influencer cette décision (ex. ne pas
  déduire l'existence d'un compte d'une erreur de remise Resend exposée au
  client).
- Pas de verrou fournisseur dur : l'intégration passera par un petit
  adaptateur (`EmailSender` côté domaine/api), remplaçable sans changer la
  logique métier si Resend devait être reconsidéré.

## Alternatives rejetées

- **Brevo** — viable, écarté pour préférence de simplicité d'intégration
  (API orientée transactionnel pur vs plateforme marketing+transactionnel).
- **Amazon SES** — écarté : sandbox de sortie à lever (délai de revue AWS),
  et introduit un compte cloud supplémentaire hors du trio `ADR-0022`.
