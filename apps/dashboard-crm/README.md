# KÓMBE CRM — console unique de la plateforme

Fusion des consoles Opérations & Support, Direction & Analytics et Engineering (ADR-0046), servie sous `/crm/`.

- **CRM** : tableau de bord, demandes (délais de service ITIL, réponse publique ou note interne), comptes (groupes), contacts pseudonymes (identifiant masqué, affichage en clair avec motif journalisé), tâches, segments.
- **Opérations** : vue d’ensemble et alertes, accès support JIT à double approbation, santé de l’API, runbooks.
- **Direction** : activité, pilote, entonnoir, cohortes, économie unitaire, risques, gates.
- **Technique** : production, intégration ; pages « dépôt » via la passerelle locale lecture seule (`pnpm --filter @kombe/dashboard-crm gateway`, puis `engineeringGatewayBaseUrl` dans la configuration locale).
- **Gouvernance** : conformité (registre des traitements, droits des personnes, conservation) et journal d’audit.

La navigation ne montre que les sections des fonctions de l’opérateur ; le serveur revérifie chaque appel. Aucune donnée n’est simulée.
