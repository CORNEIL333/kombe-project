# ADR-0046 — CRM de la plateforme et console unique

- **Statut :** ACCEPTÉ (demande du porteur, 06/11/2026 : « fusionne direction, ops et engineering et crée un CRM complet aux normes internationales ; la fusion de ces 3 devra se retrouver dans le CRM »).
- **Date :** 2026-11-07
- **Auteur :** harnais `claude-code`
- **Remplace :** les trois consoles séparées de l'ADR-0037 (`/ops/`, `/direction/`, `/engineering/`).
- **Ne change pas :** l'ADR-0043 (opérateurs, fonctions, second facteur), qui s'applique tel quel au CRM.

## Contexte

L'équipe KÓMBE disposait de trois consoles distinctes :
- **Opérations & Support** : santé des groupes, accès JIT, runbooks.
- **Direction & Analytics** : indicateurs, risques, gates.
- **Engineering** : production, intégration.

Aucune ne permettait de **suivre une personne ou un groupe dans la durée**. Une demande d'aide reçue par téléphone ne laissait aucune trace. Aucun délai de réponse n'était mesuré. Le registre des traitements ne couvrait pas le support. Rien ne retraçait qui avait consulté quoi.

## Décision

### 1. Une console unique, `/crm/` (`apps/dashboard-crm`)

La console est organisée en cinq sections :

| Section | Contenu | Fonctions |
|---|---|---|
| **CRM** | Tableau de bord, demandes, comptes, contacts, tâches, segments | support, opérations ; la direction voit le tableau de bord, les comptes et les segments |
| **Opérations** | Vue d'ensemble et alertes, accès JIT, santé, runbooks | support, opérations ; les runbooks sont ouverts à tous les opérateurs |
| **Direction** | Activité, pilote, entonnoir, cohortes, économie, risques, gates | direction |
| **Technique** | Production, intégration ; pages « dépôt » seulement via la passerelle locale | engineering |
| **Gouvernance** | Conformité ; journal d'audit | direction et admin ; admin seul pour le journal |

Règles d'accès :
- La fonction `admin` ouvre tout.
- La navigation n'affiche que les sections des fonctions de l'opérateur.
- **Le serveur revérifie chaque appel** (`assertOperator` avec le second facteur, puis RLS et fonctions SECURITY DEFINER).

Les anciennes adresses `/ops/`, `/direction/` et `/engineering/` redirigent vers la bonne section, sans script (la CSP interdit le JavaScript en ligne).

### 2. Modèle de données (`0041_crm`, additive)

- **`crm_contact`** : identifiant pseudonyme `ct_…` d'une identité. Le CRM ne manipule jamais le numéro ni l'e-mail comme clé.
- **`crm_ticket`** :
  - référence d'accusé de réception (`KMB-000001`) ;
  - sujet, canal, impact, urgence, priorité, état, demandeur, responsable, groupe ;
  - échéances de première réponse et de résolution, satisfaction ;
  - version pour le verrou optimiste.
- **`crm_ticket_message`** : messages publics ou internes. Ils sont immuables ; seule l'anonymisation les réécrit.
- **`crm_note`** : notes internes sur un groupe ou sur un contact, en ajout seul.
- **`crm_task`** : tâches de suivi, avec version.
- **`crm_audit_log`** : journal en ajout seul.

### 3. Normes appliquées

**Protection des données (RGPD, loi camerounaise n° 2024/017)**
- **Minimisation.** L'identifiant de connexion est masqué partout. Pas de liste de personnes : on retrouve un contact seulement par son identifiant exact, depuis une demande ou depuis le bureau d'un groupe.
- **Finalité.** Afficher un identifiant en clair exige un motif écrit d'au moins 10 caractères. Le motif est enregistré au journal dans la **même transaction** (`kombe_crm_reveal`).
- **Droits des personnes.** La catégorie `donnees_personnelles` impose une résolution en 30 jours au plus. Ces demandes sont suivies dans la page Conformité.
- **Conservation limitée.** Une demande close depuis plus de 730 jours est anonymisée par `kombe_crm_anonymize` (minimum 365 jours, fonction admin, acte journalisé).
- **Registre des traitements.** Il contient la ligne `crm-support` (base légale « intérêt légitime », destinataires, hébergement UE, conservation).

**ISO/IEC 27001**
- Contrôle d'accès par fonction, second facteur (A.5.15, A.8.5).
- Journalisation des consultations de fiches et des écritures, en ajout seul : ni l'application ni son rôle ne peuvent modifier ou effacer une ligne (A.8.15).
- Séparation des fonctions : la direction ne lit pas les demandes ; le support ne lit ni le journal ni la conformité.

**ITIL 4**
- **Priorité.** Elle vaut `min(4, impact + urgence − 1)` et est posée par un déclencheur en base, jamais par le client.
- **Délais de service :**

  | Priorité | Première réponse | Résolution |
  |---|---|---|
  | P1 | 1 h | 8 h |
  | P2 | 4 h | 24 h |
  | P3 | 8 h | 72 h |
  | P4 | 24 h | 7 jours |

- **Mesures.** Les dépassements, le taux de première réponse dans les délais (30 jours) et la médiane de première réponse sont calculés en base.

**ISO 10002 (réclamations)**
- Accusé de réception par référence.
- État visible par le membre dans l'application.
- Réponse notifiée (`support_reply`, avec poussée via l'outbox de l'ADR-0044).
- Satisfaction notée de 1 à 5, une seule fois, après résolution.

**WCAG 2.2 AA** : 40 pages (CRM et PWA, bureau et téléphone) ont été analysées automatiquement (axe-core).

### 4. Côté membre

Dans la PWA, l'écran **Aide → Mes demandes au support** permet de :
- ouvrir une demande (cinq ouvertes au plus) ;
- suivre l'échange (les messages publics seulement, et le nom de l'opérateur n'est jamais montré) ;
- répondre (sauf si la demande est close) ;
- noter la réponse.

La notification de réponse ouvre directement la demande.

### 5. Ce que le CRM ne fait pas

- **Aucun montant, aucun acte financier.** Le contenu d'un groupe (noms, montants) reste derrière l'accès JIT à double approbation (ADR-0043).
- **Aucun envoi de masse.** Les segments sont des listes à consulter ; l'opérateur décide de chaque contact.
- **Pas d'anonymisation automatique planifiée.** Elle exige un opérateur `admin` : c'est un acte humain, journalisé.

## Preuves (07/11/2026)

- **`packages/api/test/crm.proof.mjs`** : 43/43 contrôles sur une vraie PostgreSQL, en connexion directe et via PgBouncer (`kombe_api`). Ils couvrent :
  - isolation entre membres et notes internes jamais montrées ;
  - priorité et échéances ;
  - verrou optimiste (409) et en-tête de version obligatoire ;
  - séparation des fonctions (403) ;
  - identifiant masqué, motif obligatoire, journal complet, journal et messages en ajout seul (42501) ;
  - cinq demandes au plus ;
  - anonymisation après 730 jours.
- **Tests unitaires** : 16 tests dans `apps/dashboard-crm`, dont la navigation par fonction, la priorité et les routes appelées.
- **Contrat** : routes au contrat OpenAPI, test contrat ↔ runtime vert.

## Conséquences

- **Déploiement.** Il faut appliquer `0041_crm` avant le build qui l'attend (garde de `/v1/health/ready`). Le retour arrière `0041_crm.down.sql` refuse de s'exécuter dès qu'une demande ou une ligne de journal existe.
- **À faire valider par un juriste :**
  - la base légale « intérêt légitime » du support ;
  - la durée de 730 jours ;
  - le transfert hors du Cameroun.
