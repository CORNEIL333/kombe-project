# 03 — Architecture cible

```
Navigateur / PWA ─┐                         ┌─ PostgreSQL (Neon, Francfort)
App Android ──────┼─ CDN Vercel (statiques) │   • RLS par groupe et par personne
Consoles (4) ─────┘        │                │   • fonctions SECURITY DEFINER bornées
                           ▼                │   • journal à empreintes chaînées
                 Fonction API (Fastify) ────┤   • notification_outbox (bail SKIP LOCKED)
                 • session → kombe.identity │   • compteurs de débit partagés
                 • 1 transaction par écriture (verrou idempotence)
                 • répartiteur de notifications (après validation, waitUntil)
                           │
                 Tâche planifiée (CRON_SECRET) : échéances, relances, filet d'envoi
                           │
                 Fournisseurs : FCM (push) · SMS (Africa's Talking/passerelle) · Resend (e-mail)
```

## Principes

- **KÓMBE ne détient, ne reçoit ni ne transfère aucun fonds.**
  - Le serveur consigne des déclarations et des contrôles indépendants. Il ne valide jamais un paiement à la place d'une personne.
  - Les caisses `loan` et `collector` restent fermées (`FLAGGED_FUND_KINDS`, ADR-0032).
- **Moindre privilège.**
  - Rôle applicatif `kombe_app` sans BYPASSRLS. Les écritures sensibles passent par des fonctions définies et bornées.
  - Les opérateurs ont des fonctions séparées et un second facteur obligatoire.
- **Écritures atomiques et rejouables.**
  - Pour un même couple (route, clé), une seule transaction couvre le verrou, le rejeu, l'effet et la mémorisation.
- **Livraison asynchrone, jamais bloquante.**
  - La boîte de réception est la source. La sortie vers l'extérieur passe par une file transactionnelle (outbox), réclamée par bail.
- **Observabilité sans données personnelles.**
  - Journaux JSON, avec jetons et clés masqués.
  - Identifiant de corrélation sur chaque réponse.
  - Sonde de disponibilité qui vérifie le schéma attendu.

## Environnements

| Environnement | Base | Hébergement | Usage |
|---|---|---|---|
| Local / CI | PostgreSQL 16 (Docker ou service CI), recréée à chaque preuve | `node packages/api/dist/main.js` | Preuves, charge, accessibilité |
| Pré-production jetable | **Branche Neon** de la production (copie à l'écriture), supprimée après usage | API locale ou aperçu Vercel | Répétition de migration, restauration (voir 06) |
| Production | Neon `production` | Vercel `fra1` | Membres réels |

## Évolution à l'échelle (détail : 12)

1. Rôle LOGIN dédié et pooler Neon.
2. Résumés agrégés pour `/v1/me/tontines`.
3. Planificateur externe ou Vercel Pro (tâches par minute).
4. Push Web (VAPID).
5. Réplica en lecture pour les consoles Direction et Engineering.
