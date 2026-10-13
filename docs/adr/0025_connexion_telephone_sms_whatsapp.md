# ADR-0025 — Connexion par téléphone (SMS, WhatsApp), e-mail en seconde voie

- **Statut :** **PROPOSÉ, appliqué par défaut** — remplace partiellement ADR-0024 (le code reste sans mot de passe ; le canal principal devient le téléphone).
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Au Cameroun, beaucoup de membres n'ont pas d'adresse e-mail qu'ils consultent ; tous ont un numéro Orange, MTN, Camtel ou Nexttel. ADR-0024 faisait de l'e-mail le canal unique (OPEN-D05 avait écarté le SMS).

## Décision

- Identifiant = numéro E.164 `+237XXXXXXXXX` (formes `6XXXXXXXX`, `00237…`, espaces acceptées et normalisées) **ou** e-mail en minuscules.
- Code à 6 chiffres (`crypto.randomInt`), empreinte seule en base, 10 min de validité, essais limités, aucune révélation d'existence du compte ; le premier code vérifié crée le compte.
- Fournisseur derrière l'interface `CodeSender` : `simulator` (développement, code rendu au développeur, interdit en production), `africastalking` (SMS), `webhook` (SMS + WhatsApp via passerelle). Le code n'est jamais journalisé.
- **Production sans fournisseur SMS : l'API démarre**, la voie SMS est fermée avec un refus explicite, l'e-mail reste ouvert ; `GET /v1/auth/channels` dit à la PWA quelles voies proposer.
- Un envoi échoué retire le code émis (la personne peut redemander tout de suite).

## Conséquences

Positives : connexion naturelle pour les membres ; déploiement possible avant d'avoir un compte SMS. Négatives : coût SMS par connexion ; dépendance à un agrégateur (Africa's Talking) — action du porteur : ouvrir le compte et poser 3 variables.
