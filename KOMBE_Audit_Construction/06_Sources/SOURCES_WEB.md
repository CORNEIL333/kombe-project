# Sources externes et journal de vérification

Recherche du 15 septembre 2026. Les documentations officielles soutiennent les faits techniques ; les recommandations et seuils du dossier sont nos propositions. Pas de copie intégrale des pages. Les alternatives non listées ci-dessous ont des liens officiels de consultation, mais leurs conditions commerciales et leur compatibilité ne sont pas revendiquées vérifiées.

| Source | Vérification et limite |
|---|---|
| [Free for Developers](https://free-for.dev/) | Page JavaScript ; lien vers dépôt public |
| [Répertoire Free for Developers](https://github.com/ripienaar/free-for-dev) | Répertoire consulté ; découverte seulement, conditions recoupées chez fournisseur |
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Page indique stable 5.0.0 ; cible L2 proposée, pas résultat |
| [NIST authentificateurs](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/) | Politique de mot de passe et mécanismes de récupération/authentification |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Référentiel accessibilité ; AA cible de projet |
| [NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final) | Baseline finale v1.1 explicitement choisie |
| [SLSA v1.1](https://slsa.dev/spec/v1.1/) | Baseline de provenance choisie, pas attestation du projet |
| [ISO/IEC 27001](https://www.iso.org/standard/27001) | Périmètre management de sécurité ; texte complet normatif non audité |
| [OWASP mobile](https://owasp.org/www-project-mobile-app-security/) | Référence MASVS/MASTG pour client natif futur |
| [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) | Version de contrat proposée |
| [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) | Canonicalisation JSON ; impose implémentation correcte |
| [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Politiques de ligne ; attention rôles privilégiés |
| [PostgreSQL verrous](https://www.postgresql.org/docs/current/explicit-locking.html) | Concurrence transactionnelle |
| [node-postgres transactions](https://node-postgres.com/features/transactions) | Transaction sur même client SQL |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Restriction non-commerciale vérifiée |
| [Supabase tarifs](https://supabase.com/pricing) | Limites Free et sauvegardes vérifiées |
| [Supabase Auth](https://supabase.com/docs/guides/auth) | Service identité proposé |
| [Neon plans](https://neon.com/docs/introduction/plans) | Extrait officiel recherché ; offre Free, quotas à confirmer |
| [Render Free](https://render.com/docs/free) | Expiration de DB gratuite vérifiée |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/) | Structure de facturation et quotas |
| [Resend prix](https://resend.com/pricing) | Limite quotidienne Free relevée |
| [Sentry prix](https://sentry.io/pricing/) | Offre Free et plans ; aucun forfait présumé souscrit |
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | Conditions générales du stockage proposé |
| [Fastify](https://fastify.dev/docs/latest/) | Framework API proposé, version à figer |
| [React](https://react.dev/learn) | Frontend proposé |
| [Vite](https://vite.dev/guide/) | Build frontend proposé |
| [Playwright](https://playwright.dev/docs/intro) | Tests E2E proposés |
| [Vitest](https://vitest.dev/guide/) | Tests unitaires proposés |
| [k6](https://grafana.com/docs/k6/latest/) | Charge proposée |
| [OpenTelemetry](https://opentelemetry.io/docs/) | Instrumentation proposée |
| [ZAP](https://www.zaproxy.org/docs/) | DAST proposé |
| [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use) | Durcissement de la CI |
| [Gemma 3n](https://ai.google.dev/gemma/docs/gemma-3n) | Architecture/paramètres ; pas de validation du budget 100 Mo |
| [SmolLM2](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) | Model card source ; anglais et licence, aucune mesure KÓMBE |
| [Qwen2.5](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | Modèle candidat |
| [Llama 3.2](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct) | Modèle candidat et licence spécifique |
| [SmolLM3](https://huggingface.co/HuggingFaceTB/SmolLM3-3B) | Modèle candidat |
| [MiniLM v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) | Variante candidate de l’embedding cité de façon imprécise |
| [MiniLM multilingue](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) | Alternative multilingue, taille à mesurer |
| [BGE M3](https://huggingface.co/BAAI/bge-m3) | Alternative serveur |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | Runtime alternatif |
| [MNN](https://github.com/alibaba/MNN) | Runtime alternatif |
| [MediaPipe LLM](https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference) | Page redirigée vers Google Developers, runtime à vérifier |
| [Core ML](https://developer.apple.com/documentation/coreml) | Point d’entrée officiel peu de contenu accessible |
| [sqlite-vec](https://github.com/asg017/sqlite-vec) | Extension locale, aucune instance existante attestée |
| [pgvector](https://github.com/pgvector/pgvector) | Extension PostgreSQL alternative |
| [pg-boss](https://github.com/timgit/pg-boss) | Queue sur PostgreSQL |
| [BullMQ compatibilité](https://docs.bullmq.io/guide/redis-tm-compatibility/) | Compatibilité à tester avant alternative broker |
| [Twilio WhatsApp](https://www.twilio.com/en-us/messaging/channels/whatsapp) | Canal Business ; coûts et contrat à examiner |
| [Orange Money](https://developer.orange.com/apis/om-webpay) | Page officielle via recherche : Cameroun listé ; admission du projet non démontrée |
| [MTN développeurs](https://momodeveloper.mtn.com/) | Portail test disponible ; accès production/pays/flux à contractualiser |
| [CamPay](https://www.campay.net/) | Offre présentée par fournisseur ; agrément et adéquation montage non attestés |
| [Loi Cameroun index officiel](https://www.prc.cm/fr/actualites/actes/lois?start=24) | Existence/titre retrouvés par recherche officielle ; corps non analysé |
| [BEAC règlement 04/18](https://www.beac.int/wp-content/uploads/2019/07/REGLEMENT-N-04-18-CEMAC-UMAC-COBAC-du-21-d%C3%A9cembre-2018.pdf) | PDF officiel accessible 29 pages ; aucune qualification individuelle déduite |

## Accès incomplets ou non aboutis

- URL publique kombe-mvp.vercel.app : ouverture non aboutie ; aucun nouvel audit visuel ni test actif.
- Page PRC du document de loi et ancien lien long de la source : erreur d'ouverture ; index officiel retrouvé. Les obligations détaillées et les évolutions réglementaires restent à confirmer localement.
- Meta Cloud API/pricing : ouverture non aboutie ; frais actuels non reproduits, revue fournisseur exigée.
- Neon pricing : ouverture directe non aboutie ; recherche officielle plans/pricing disponible ; pas de quotas précis affirmés.
- CinetPay et sa documentation : accès non abouti ; candidat conditionnel seulement, aucune admissibilité pays/contrat attestée.
- Graphile Worker et multilingual-e5-small : ouvertures non abouties ; candidats documentés par liens, à vérifier avant choix.
- CISA Secure by Design : ouverture non aboutie ; aucune affirmation normative détaillée n'en dépend.

Les articles économiques et statistiques cités dans l'étude originale ne sont pas revalidés exhaustivement ici ; aucune taille de marché ni chiffre national nouveau n'est dérivé de ces références.


## Complément de recherche du 16 septembre 2026

Dépôts officiels consultés pour la révision 2.0 ; aucune installation ou certification du code. Le tableau ne prétend pas à une compatibilité intégrée des versions. Les alternatives ajoutées sont des pistes sourcées à valider à la révision retenue.

- [Spec Kit](https://github.com/github/spec-kit) — rôle et capacités générales consultés.
- [ECC](https://github.com/affaan-m/ECC) — rôle et capacités générales consultés.
- [Trail of Bits Skills](https://github.com/trailofbits/skills) — rôle et capacités générales consultés.
- [Superpowers](https://github.com/obra/superpowers) — rôle et capacités générales consultés.
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — rôle et capacités générales consultés.
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) — rôle et capacités générales consultés.
- [fast-check](https://github.com/dubzzz/fast-check) — rôle et capacités générales consultés.
- [StrykerJS](https://github.com/stryker-mutator/stryker-js) — rôle et capacités générales consultés.
- [Testcontainers Node](https://github.com/testcontainers/testcontainers-node) — rôle et capacités générales consultés.
- [Playwright](https://github.com/microsoft/playwright) — rôle et capacités générales consultés.
- [Gitleaks](https://github.com/gitleaks/gitleaks) — rôle et capacités générales consultés.
- [Trivy](https://github.com/aquasecurity/trivy) — rôle et capacités générales consultés.
- [OWASP agents](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html) — rôle et capacités générales consultés.
- [GitHub sécurité CI](https://docs.github.com/en/actions/reference/security/secure-use) — rôle et capacités générales consultés.
- [NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final) — rôle et capacités générales consultés.

Les pages de certains sous-répertoires ECC et Trail of Bits ont présenté des erreurs d’ouverture ; les noms cités ont été vérifiés dans les catalogues README du dépôt principal. L’installation doit confirmer leurs chemins à la version choisie.
