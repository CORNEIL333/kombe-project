# Index des prompts de construction

**Révision 2.0 : 32 prompts.** Le maître et les 30 composants sont complétés par [H00](H00_PROMPT.md), à exécuter après C00 minimal et avant les lots métier. Le graphe métier C00–C29 conserve ses identifiants ; H00 est un prérequis transversal de construction.

Commencer par le prompt maître et C00. Les dépendances sont obligatoires ; le numéro seul ne définit pas l’ordre.

| Composant | Porte | Dépendances | Mission |
|---|---|---|---|
| [C00](./C00_PROMPT.md) | G0 | — | Cadrage dépôt architecture et contrats |
| [C01](./C01_PROMPT.md) | G0 | C00 | Données migrations et isolation PostgreSQL |
| [C02](./C02_PROMPT.md) | G0 | C00, C01 | Identité sessions MFA et récupération |
| [C03](./C03_PROMPT.md) | G0 | C01, C02 | Groupes membres et séparation des pouvoirs |
| [C04](./C04_PROMPT.md) | G0 | C01, C03 | Moteur de règles et acceptations |
| [C05](./C05_PROMPT.md) | G0 | C03, C04 | Cycles tours échéances et bénéficiaires |
| [C06](./C06_PROMPT.md) | G0 | C01, C04, C05, C11 | Déclarations montants partiels et idempotence |
| [C07](./C07_PROMPT.md) | G0 | C06, C11 | Validations et corrections de cotisations |
| [C08](./C08_PROMPT.md) | G0 | C07, C10, C11 | Décaissements frais rapprochement et clôture |
| [C09](./C09_PROMPT.md) | G0 | C03, C04, C11 | Propositions votes et décisions |
| [C10](./C10_PROMPT.md) | G0 | C03, C11 | Litiges et recours |
| [C11](./C11_PROMPT.md) | G0 | C00, C01 | Journal événements projections et intégrité |
| [C12](./C12_PROMPT.md) | G0 | C03, C08, C11 | Exports PDF CSV et vérification |
| [C13](./C13_PROMPT.md) | G0 | C01, C11 | Outbox worker et notifications internes |
| [C14](./C14_PROMPT.md) | G0 | C02, C03, C04, C05 | Interface parcours accessibilité et langues |
| [C15](./C15_PROMPT.md) | G0 | C06, C14 | Cache hors connexion et synchronisation |
| [C16](./C16_PROMPT.md) | G0 | C02, C03, C12 | Données personnelles notices et droits |
| [C17](./C17_PROMPT.md) | G0 | C02, C03, C11 | Administration support sécurité opérationnelle |
| [C18](./C18_PROMPT.md) | G0 | C05, C11 | Mesure du pilote et économie unitaire |
| [C19](./C19_PROMPT.md) | G2 | C02, C03, C12, C18 | Abonnements quotas et réversibilité |
| [C20](./C20_PROMPT.md) | G1 | C13, C16, C19 | Canaux WhatsApp SMS email et préférences |
| [C21](./C21_PROMPT.md) | G2 | C03, C08, C12, C19 | Association import papier et mode réunion |
| [C22](./C22_PROMPT.md) | G1 | C04, C05, C06, C16 | Aide déterministe et glossaire |
| [C23](./C23_PROMPT.md) | G1 | C15, C16, C22 | IA locale RAG et benchmark appareils |
| [C24](./C24_PROMPT.md) | G3 | C12, C16, C17 | API partenaires et autorisations déléguées |
| [C25](./C25_PROMPT.md) | G3 | C08, C16, C17, C19, C24 | Connecteur paiement du pot et rapprochement |
| [C26](./C26_PROMPT.md) | V2 | C16, C18, C24 | Scoring et passeport financier conditionnels |
| [C27](./C27_PROMPT.md) | V2 | C16, C24 | Assurance et extensions financières conditionnelles |
| [C28](./C28_PROMPT.md) | G0 | C00, C01 | Harness QA sécurité et chaîne de livraison |
| [C29](./C29_PROMPT.md) | G0 | C13, C16, C17, C28 | Infrastructure déploiement sauvegarde et reprise |
