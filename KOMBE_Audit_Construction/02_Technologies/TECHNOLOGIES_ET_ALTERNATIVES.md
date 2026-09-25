# Technologies et services avec alternatives

## Statut et périmètre

**Aucune stack installée n'est attestée par l'archive.** Cet inventaire distingue les technologies citées, les moyens de paiement évoqués dans l'étude de marché, les composants futurs et la stack proposée. Il ne remplace pas une SBOM extraite du dépôt. Les noms de concurrents Djangui et la fonction tontine Orange décrivent le marché, pas des dépendances applicatives. Les organismes BEAC/COBAC et les référentiels ne sont pas des prestataires logiciels.

Chaque ligne comporte trois alternatives pour le même besoin. Certaines sont des implémentations du même protocole ; d'autres nécessitent une migration. Elles ne sont pas présentées comme interchangeables sans travail. Les alternatives IA sont viables comme **candidates de benchmark**, pas certifiées utilisables en français sur 2 Go RAM. Les options de paiement sont conditionnelles au pays, au contrat et à la qualification du montage.

Les versions déployées, licences exactes, pays, offre souscrite et coûts réels sont inconnus. C00 doit les inscrire depuis les manifests, lockfiles et contrats. Ne jamais installer « latest » sans gel vérifié. Les liens de cette matrice sont des points d'entrée officiels ; seules les vérifications décrites dans SOURCES_WEB.md sont revendiquées comme réalisées.

## Matrice des choix

### TEC01 — Vercel

**Rôle :** Hébergement web. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Audit PDF original p.1, URL kombe-mvp.vercel.app.

Conserver seulement si dépôt adapté et offre commerciale ; vérifier plan réel. [Documentation de référence](https://vercel.com/docs/plans/hobby).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Render](https://render.com/docs) | Application et worker ; production payante |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) | Adapter runtime et connexions PostgreSQL |
| [Netlify](https://docs.netlify.com/) | Vérifier limites fonctions, coûts et migrations |

### TEC02 — PWA

**Rôle :** Client installable web. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Référence §10 ; Backlog 12.2.

Premier choix neuf à valider sur appareils ; le cache ne fait pas autorité. [Documentation de référence](https://web.dev/learn/pwa/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Flutter](https://docs.flutter.dev/) | Natif ; coût de diffusion et maintenance |
| [React Native](https://reactnative.dev/docs/getting-started) | Natif JS ; adapter stockage sécurisé |
| [Kotlin Android](https://developer.android.com/kotlin) | Android seul ; pas client web partagé |

### TEC03 — Flutter

**Rôle :** Client mobile multiplateforme. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Source note IA §§1–5.

Conserver si code existant et utile ; ne pas imposer réécriture PWA. [Documentation de référence](https://docs.flutter.dev/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [React Native](https://reactnative.dev/) | Compétence JS native nécessaire |
| [Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform.html) | Partage logique ; UI à organiser |
| [Capacitor](https://capacitorjs.com/docs) | Réutilise web ; plugins natifs à auditer |

### TEC04 — PostgreSQL

**Rôle :** Base canonique et transactions. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Référence §10.

À privilégier ; préserver contraintes, verrouillage et capacité de replay. [Documentation de référence](https://www.postgresql.org/docs/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [MySQL InnoDB](https://dev.mysql.com/doc/refman/8.4/en/innodb-introduction.html) | Viable avec adaptation SQL et isolation applicative ; RLS à remplacer |
| [MariaDB InnoDB](https://mariadb.com/docs/server/storage-engines/innodb) | Même besoin de revalider concurrence et droits |
| [SQL Server](https://learn.microsoft.com/en-us/sql/relational-databases/security/row-level-security) | RLS disponible ; exploitation/licence à chiffrer |

### TEC05 — SQLite

**Rôle :** Cache local natif. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Source note IA §§1–5.

Cache seulement, chiffrer si données sensibles retenues. [Documentation de référence](https://www.sqlite.org/docs.html).

| Alternative | Condition de viabilité / différence |
|---|---|
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | Client web ; purge et quotas navigateur |
| [ObjectBox](https://docs.objectbox.io/) | Natif ; vérifier SDK et licence |
| [Couchbase Lite](https://docs.couchbase.com/couchbase-lite/current/index.html) | Natif ; licence, taille et sync à évaluer |

### TEC06 — WhatsApp

**Rôle :** Messagerie externe. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Backlog 11.2.

Partage manuel pilote ; automatisation après G1 et consentement. [Documentation de référence](https://business.whatsapp.com/products/business-platform).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Meta Cloud API directe](https://developers.facebook.com/docs/whatsapp/cloud-api/) | Même canal ; compte éligible et modèles approuvés |
| [Twilio WhatsApp](https://www.twilio.com/en-us/messaging/channels/whatsapp) | Intermédiaire ; frais prestataire et Meta |
| [Infobip WhatsApp](https://www.infobip.com/whatsapp) | Intermédiaire ; contrat et prix Cameroun à obtenir |

### TEC07 — SMS

**Rôle :** Rappels et éventuellement vérification. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Backlog 11.3 / 1.1.

Pas de SMS illimité ; évaluer délivrabilité et fraude OTP au Cameroun. [Documentation de référence](https://www.twilio.com/en-us/sms/pricing/cm).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Twilio Messaging](https://www.twilio.com/docs/messaging) | Tester destination Cameroun et sender ID |
| [Infobip SMS](https://www.infobip.com/sms) | Tester routes locales et accusés |
| [Vonage SMS](https://developer.vonage.com/en/messaging/sms/overview) | Vérifier couverture, réglementation et coût |

### TEC08 — Push et notifications internes

**Rôle :** Alertes. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Backlog 11.4.

Interne persistante P0 ; push externe sans détails sensibles. [Documentation de référence](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Web Push avec VAPID](https://web.dev/articles/push-notifications-overview) | Web ; permission et compatibilité à tester |
| [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging) | Android/web ; dépendance plateforme |
| [OneSignal](https://documentation.onesignal.com/) | Gestion multicanal ; données et coût à examiner |

### TEC09 — Email transactionnel

**Rôle :** Vérification et récupération. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Backlog 1.1 / 1.4.

Canal à retenir seulement si adapté aux membres ; domaine authentifié. [Documentation de référence](https://resend.com/docs).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Resend](https://resend.com/docs) | API/SMTP ; quotas et région |
| [Brevo](https://developers.brevo.com/) | API transactionnelle ; réputation expéditeur |
| [Amazon SES](https://docs.aws.amazon.com/ses/) | Sortie sandbox et délivrabilité à préparer |

### TEC10 — Passkeys WebAuthn

**Rôle :** Authentification résistante au phishing. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Audit PDF p.10 ; Backlog 1.3.

Option membres ; vérifier récupération ; priorité opérateurs. [Documentation de référence](https://www.w3.org/TR/webauthn-2/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [SimpleWebAuthn](https://simplewebauthn.dev/docs) | Implémentation web ; sécurité RP/origine à configurer |
| [Keycloak WebAuthn](https://www.keycloak.org/documentation) | Service identité autohébergé ; Ops |
| [Auth0 passkeys](https://auth0.com/docs/authenticate/database-connections/passkeys) | Managé ; coûts et export identité |

### TEC11 — TOTP

**Rôle :** Second facteur. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Backlog 1.3.

Alternative MFA sans SMS ; codes de récupération protégés. [Documentation de référence](https://www.rfc-editor.org/rfc/rfc6238).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa) | Service géré ; intégration serveur |
| [Keycloak OTP](https://www.keycloak.org/documentation) | Auto-hébergement à exploiter |
| [Auth0 MFA](https://auth0.com/docs/secure/multi-factor-authentication) | Managé ; offre applicable à vérifier |

### TEC12 — Stockage objet privé

**Rôle :** Exports et pièces futures. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Référence §14 ; Contrats §7.

Exports privés seulement au pilote ; sauvegarde séparée. [Documentation de référence](https://supabase.com/docs/guides/storage).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Supabase Storage](https://supabase.com/docs/guides/storage) | Intégration DB/Auth ; ne pas exposer bucket |
| [Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html) | IAM et rétention à configurer |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) | API compatible S3 ; contraintes région/contrat |

### TEC13 — GitHub

**Rôle :** Dépôt et collaboration. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Audit PDF original p.17.

Organisation, protections de branches et propriétaires nommés. [Documentation de référence](https://docs.github.com/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [GitLab](https://docs.gitlab.com/) | Cloud ou auto-hébergement ; CI intégrée |
| [Bitbucket](https://support.atlassian.com/bitbucket-cloud/) | Permissions et CI selon offre |
| [Forgejo](https://forgejo.org/docs/latest/) | Auto-hébergement ; charge Ops |

### TEC14 — Figma

**Rôle :** Conception et prototypes. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Audit PDF original p.17.

Outil de travail cité, aucun fichier design fourni. [Documentation de référence](https://help.figma.com/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Penpot](https://help.penpot.app/) | Design ouvert ; auto-hébergement possible |
| [Sketch](https://www.sketch.com/docs/) | Édition Mac ; collaboration à chiffrer |
| [Lunacy](https://icons8.com/lunacy) | Desktop ; vérifier échanges et licence équipe |

### TEC15 — Gemma 3n E2B

**Rôle :** LLM local. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

La promesse 100 Mo est rejetée ; benchmark après G1. [Documentation de référence](https://ai.google.dev/gemma/docs/gemma-3n).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | Plus petit ; FR et RAM à mesurer |
| [Llama 3.2 1B Instruct](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct) | Licence spécifique ; mobile à tester |
| [SmolLM2 135M Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) | Petit ; anglais privilégié, FR non garanti |

### TEC16 — SmolLM2 135M Instruct

**Rôle :** Petit LLM cité. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Usage libre en français non démontré ; option de benchmark seulement. [Documentation de référence](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | Plus de mémoire |
| [Llama 3.2 1B Instruct](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct) | Plus de mémoire et licence à vérifier |
| [Gemma 3n E2B](https://ai.google.dev/gemma/docs/gemma-3n) | Bien plus lourd ; mêmes critères matériels |

### TEC17 — Qwen2.5 0.5B

**Rôle :** LLM cité. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Révision Instruct proposée pour essai ; aucun poids installé. [Documentation de référence](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct).

| Alternative | Condition de viabilité / différence |
|---|---|
| [SmolLM2 135M Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) | Budget inférieur, qualité FR à tester |
| [Llama 3.2 1B Instruct](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct) | Licence et mémoire différentes |
| [Gemma 3n E2B](https://ai.google.dev/gemma/docs/gemma-3n) | Plus lourd, runtime à valider |

### TEC18 — Llama 3.2 1B

**Rôle :** LLM cité. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Révision et licence précises avant téléchargement. [Documentation de référence](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | Petit modèle alternatif |
| [SmolLM3 3B](https://huggingface.co/HuggingFaceTB/SmolLM3-3B) | Plus gros ; appareil mieux doté |
| [Gemma 3n E2B](https://ai.google.dev/gemma/docs/gemma-3n) | Budget RAM à comparer |

### TEC19 — SmolLM3 3B

**Rôle :** LLM cité. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Hors budget petit téléphone sans mesure contraire. [Documentation de référence](https://huggingface.co/HuggingFaceTB/SmolLM3-3B).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | Allègement avec changement qualité |
| [Llama 3.2 1B Instruct](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct) | Allègement ; licence spécifique |
| [Gemma 3n E2B](https://ai.google.dev/gemma/docs/gemma-3n) | Architecture différente, mesurer mémoire réelle |

### TEC20 — MediaPipe LLM Inference

**Rôle :** Runtime mobile IA. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Prototype uniquement ; vérifier modèles et runtime actuel. [Documentation de référence](https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference).

| Alternative | Condition de viabilité / différence |
|---|---|
| [MNN](https://github.com/alibaba/MNN) | Conversion et kernels à valider |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | GGUF et intégration native |
| [ONNX Runtime Mobile](https://onnxruntime.ai/docs/tutorials/mobile/) | Export de modèle et opérateurs à valider |

### TEC21 — MNN

**Rôle :** Runtime IA embarqué. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Option benchmark, aucune compatibilité automatique. [Documentation de référence](https://github.com/alibaba/MNN).

| Alternative | Condition de viabilité / différence |
|---|---|
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | GGUF/natif |
| [LiteRT](https://ai.google.dev/edge/litert) | Conversion et accélération à tester |
| [ONNX Runtime Mobile](https://onnxruntime.ai/docs/tutorials/mobile/) | Modèle exportable requis |

### TEC22 — llama.cpp

**Rôle :** Runtime LLM C/C++. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Épingler commit et modèle ; bench CPU/RAM. [Documentation de référence](https://github.com/ggml-org/llama.cpp).

| Alternative | Condition de viabilité / différence |
|---|---|
| [MNN](https://github.com/alibaba/MNN) | Mobile, conversion requise |
| [LiteRT](https://ai.google.dev/edge/litert) | Appareils et opérateurs ciblés |
| [ExecuTorch](https://docs.pytorch.org/executorch/) | Export et backend matériel à valider |

### TEC23 — Core ML

**Rôle :** Runtime Apple. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

iOS futur ; ne résout pas la cible Android du pilote. [Documentation de référence](https://developer.apple.com/documentation/coreml).

| Alternative | Condition de viabilité / différence |
|---|---|
| [ONNX Runtime Mobile](https://onnxruntime.ai/docs/tutorials/mobile/) | iOS possible ; export requis |
| [ExecuTorch](https://docs.pytorch.org/executorch/) | Déploiement embarqué et backend Apple |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | LLM compatible ; intégration iOS |

### TEC24 — AI Edge Gallery et MatFormer

**Rôle :** Prototype et configuration Gemma. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Outil/technique d’expérimentation, pas composant financier ni garantie de taille. [Documentation de référence](https://github.com/google-ai-edge/gallery).

| Alternative | Condition de viabilité / différence |
|---|---|
| [llama.cpp bench](https://github.com/ggml-org/llama.cpp) | Comparer modèles compatibles sans MatFormer |
| [MNN benchmark](https://github.com/alibaba/MNN) | Mesurer modèle converti |
| [ExecuTorch](https://docs.pytorch.org/executorch/) | Autre chaîne export/exécution ; pas remplacement identique de MatFormer |

### TEC25 — all-MiniLM-L6

**Rôle :** Embeddings cités sans révision exacte. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

La variante v2 est une candidate, pas un fait du dépôt ; vérifier FR/EN. [Documentation de référence](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2).

| Alternative | Condition de viabilité / différence |
|---|---|
| [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) | Multilingue ; mémoire et préfixes à respecter |
| [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) | Plus lourd ; bench appareil |
| [bge-m3](https://huggingface.co/BAAI/bge-m3) | Candidat serveur, pas téléphone 2 Go |

### TEC26 — sqlite-vec

**Rôle :** Recherche vectorielle locale. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Pas nécessaire à V1 ; filtre d’accès avant recherche. [Documentation de référence](https://github.com/asg017/sqlite-vec).

| Alternative | Condition de viabilité / différence |
|---|---|
| [FAISS](https://github.com/facebookresearch/faiss) | Index local ; persistance et ACL à écrire |
| [pgvector](https://github.com/pgvector/pgvector) | Serveur PostgreSQL ; ne donne pas offline |
| [Qdrant](https://qdrant.tech/documentation/) | Service dédié ; complexité injustifiée au pilote |

### TEC27 — BM25

**Rôle :** Recherche lexicale. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Complément éventuel ; ne calcule pas les montants. [Documentation de référence](https://www.sqlite.org/fts5.html).

| Alternative | Condition de viabilité / différence |
|---|---|
| [SQLite FTS5](https://www.sqlite.org/fts5.html) | Local ; fournit notamment classement BM25 |
| [PostgreSQL full text search](https://www.postgresql.org/docs/current/textsearch.html) | Serveur ; classement différent à revalider |
| [Tantivy](https://github.com/quickwit-oss/tantivy) | Moteur local ; intégration Rust |

### TEC28 — Classifieur et LoRA

**Rôle :** Intentions IA. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Commencer par règles déterministes ; dataset consenti, modèle non identifié. [Documentation de référence](https://huggingface.co/docs/peft/index).

| Alternative | Condition de viabilité / différence |
|---|---|
| [fastText](https://fasttext.cc/docs/en/supervised-tutorial.html) | Classification légère ; pas un LLM |
| [scikit-learn TF-IDF + linéaire](https://scikit-learn.org/stable/tutorial/text_analytics/working_with_text_data.html) | Baseline serveur/entraînement ; export à prévoir |
| [SetFit](https://huggingface.co/docs/setfit/index) | Few-shot ; taille et qualité à mesurer |

### TEC29 — JNI

**Rôle :** Pont natif cité. **Statut :** Futur ; non installé. **Trace :** Source note IA §§1–5.

Concerne Android ; préférer interface maintenue et étroite. [Documentation de référence](https://developer.android.com/training/articles/perf-jni).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Dart FFI](https://dart.dev/interop/c-interop) | Si client Flutter et librairie C |
| [Flutter platform channels](https://docs.flutter.dev/platform-integration/platform-channels) | Pont Kotlin/Swift avec sérialisation |
| [React Native Turbo Native Modules](https://reactnative.dev/docs/turbo-native-modules-introduction) | Si client React Native ; réécriture du pont |

### TEC30 — React et TypeScript

**Rôle :** Client web proposé. **Statut :** Proposition ; non installé. **Trace :** Choix neuf proposé dans cet audit.

Conserver autre frontend sain ; ne pas réécrire pour préférence. [Documentation de référence](https://react.dev/learn).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Vue + TypeScript](https://vuejs.org/guide/typescript/overview.html) | Écosystème différent, API identique |
| [Svelte + TypeScript](https://svelte.dev/docs) | Moins de code UI ; compétences à confirmer |
| [Angular](https://angular.dev/) | Cadre complet ; poids/complexité à mesurer |

### TEC31 — Vite

**Rôle :** Build web proposé. **Statut :** Proposition ; non installé. **Trace :** Choix neuf.

Épingler version compatible Node/plugins dans lockfile. [Documentation de référence](https://vite.dev/guide/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Rspack](https://rspack.dev/guide/start/introduction) | Configurer plugins et PWA |
| [webpack](https://webpack.js.org/concepts/) | Mature, configuration plus lourde |
| [Parcel](https://parceljs.org/docs/) | Vérifier contrôle bundle/cache |

### TEC32 — Node.js et Fastify

**Rôle :** API monolithe proposée. **Statut :** Proposition ; non installé. **Trace :** Choix neuf.

Runtime LTS soutenu lors du gel ; JSON Schema et transactions SQL. [Documentation de référence](https://fastify.dev/docs/latest/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [NestJS](https://docs.nestjs.com/) | Même écosystème JS ; structure plus prescriptive |
| [Django](https://docs.djangoproject.com/) | Python ; identité/admin et API à intégrer |
| [ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/) | C# ; équipe et plateforme à confirmer |

### TEC33 — node-postgres pg

**Rôle :** Accès SQL proposé. **Statut :** Proposition ; non installé. **Trace :** Choix neuf.

Transactions explicites sur une même connexion. [Documentation de référence](https://node-postgres.com/features/transactions).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Kysely](https://kysely.dev/docs/intro) | SQL typé ; migrations à organiser |
| [Drizzle ORM](https://orm.drizzle.team/docs/overview) | Revoir SQL généré et verrous |
| [Prisma](https://www.prisma.io/docs/orm) | Évaluer requêtes brutes, transactions et RLS |

### TEC34 — Supabase DB

**Rôle :** PostgreSQL géré proposé. **Statut :** Proposition ; non installé. **Trace :** Choix neuf.

Production payante et sauvegarde indépendante ; région à décider. [Documentation de référence](https://supabase.com/pricing).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Neon](https://neon.com/docs/introduction/plans) | Postgres ; pooling, arrêt et restauration à vérifier |
| [Render Postgres](https://render.com/docs/postgresql) | Plan payant durable |
| [Amazon RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html) | Plus de paramètres et coûts à gérer |

### TEC35 — Supabase Auth

**Rôle :** Identité gérée proposée. **Statut :** Proposition ; non installé. **Trace :** Choix neuf.

Ne remplace pas les permissions métier ; BFF/session sécurisée. [Documentation de référence](https://supabase.com/docs/guides/auth).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Keycloak](https://www.keycloak.org/documentation) | Souveraineté au prix Ops |
| [Auth0](https://auth0.com/docs) | SaaS ; coût MAU et sortie à vérifier |
| [ZITADEL](https://zitadel.com/docs) | Géré ou auto-hébergé ; licence et options |

### TEC36 — Render web et worker

**Rôle :** Compute proposé. **Statut :** Proposition ; non installé. **Trace :** Choix neuf.

Instances payantes ; même image, processus séparés. [Documentation de référence](https://render.com/docs).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Railway](https://docs.railway.com/) | Vérifier coûts usages et DB |
| [Fly.io](https://fly.io/docs/) | Machines et réseau à opérer |
| [Cloud Run](https://cloud.google.com/run/docs) | Worker et jobs à adapter au cycle de vie serverless |

### TEC37 — Outbox PostgreSQL

**Rôle :** File transactionnelle proposée. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Contrats §4 ; Backlog 18.6.

À garder même en changeant le moteur de livraison. [Documentation de référence](https://www.postgresql.org/docs/current/sql-select.html).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Graphile Worker](https://worker.graphile.org/) | Jobs PostgreSQL ; couplage transaction à vérifier |
| [pg-boss](https://github.com/timgit/pg-boss) | Jobs Node/Postgres ; intégration métier à tester |
| [BullMQ + Valkey](https://docs.bullmq.io/) | Broker supplémentaire ; relais outbox conservé, compatibilité vérifiée |

### TEC38 — IndexedDB

**Rôle :** Cache PWA proposé. **Statut :** Proposition ; non installé. **Trace :** Choix client web.

Données minimales, TTL, purge de compte. [Documentation de référence](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Dexie](https://dexie.org/docs/) | Couche IndexedDB, pas autre sécurité |
| [SQLite WASM](https://sqlite.org/wasm/doc/trunk/index.md) | Compatibilité OPFS et coût de bundle |
| [localForage](https://localforage.github.io/localForage/) | Abstraction stockage ; transactions limitées, petits brouillons seulement |

### TEC39 — Workbox

**Rôle :** Service worker proposé. **Statut :** Proposition ; non installé. **Trace :** Client PWA.

Cache assets ; exclure routes auth et privées par défaut. [Documentation de référence](https://developer.chrome.com/docs/workbox/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Service Worker natif](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) | Plus de code et tests lifecycle |
| [Serwist](https://serwist.pages.dev/) | Vérifier intégration et maintenance |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | Intégration s’appuyant souvent sur Workbox, pas remplacement complet du moteur |

### TEC40 — Resend

**Rôle :** Email proposé. **Statut :** Proposition ; non installé. **Trace :** Cible identité.

Prévoir dépassement quotas de récupération ; pas de tracking superflu. [Documentation de référence](https://resend.com/pricing).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Brevo](https://developers.brevo.com/) | Délivrabilité et DPA à comparer |
| [Amazon SES](https://docs.aws.amazon.com/ses/) | Sandbox et réputation à préparer |
| [Postmark](https://postmarkapp.com/developer) | Transactionnel ; prix par volume |

### TEC41 — Sentry

**Rôle :** Erreurs applicatives proposé. **Statut :** Proposition ; non installé. **Trace :** Observabilité.

Désactiver PII et replay métier ; alertes sous quotas. [Documentation de référence](https://sentry.io/pricing/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [GlitchTip](https://glitchtip.com/documentation) | Compatible SDK ; ops si self-host |
| [Rollbar](https://docs.rollbar.com/) | SaaS ; limites et données |
| [Bugsnag](https://docs.bugsnag.com/) | SaaS ; coûts et conservation |

### TEC42 — OpenTelemetry

**Rôle :** Instrumentation proposée. **Statut :** Proposition ; non installé. **Trace :** Observabilité.

Éviter identifiants individuels dans métriques ; exporter données expurgées. [Documentation de référence](https://opentelemetry.io/docs/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Grafana Cloud OTLP](https://grafana.com/docs/grafana-cloud/) | Backend compatible ; quotas |
| [Elastic Observability](https://www.elastic.co/guide/en/observability/current/index.html) | Backend ; coûts et exploitation |
| [Datadog OTLP](https://docs.datadoghq.com/opentelemetry/) | Backend ; coûts à contrôler |

### TEC43 — Backblaze B2

**Rôle :** Sauvegarde objet séparée proposée. **Statut :** Proposition ; non installé. **Trace :** Continuité.

Compte/droits séparés, chiffrement et restauration. [Documentation de référence](https://www.backblaze.com/cloud-storage/pricing).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html) | Rétention et classe stockage adaptées |
| [Wasabi](https://docs.wasabi.com/) | Durée et volume minimum facturés à vérifier |
| [OVHcloud Object Storage](https://www.ovhcloud.com/en/public-cloud/object-storage/) | Région, immutabilité et egress à vérifier |

### TEC44 — GitHub Actions

**Rôle :** CI proposée. **Statut :** Proposition ; non installé. **Trace :** Chaîne de livraison.

Actions épinglées, environnements protégés, permissions minimales. [Documentation de référence](https://docs.github.com/en/actions).

| Alternative | Condition de viabilité / différence |
|---|---|
| [GitLab CI](https://docs.gitlab.com/ci/) | Pipeline intégrée au dépôt GitLab |
| [CircleCI](https://circleci.com/docs/) | SaaS ; minutes et secrets |
| [Buildkite](https://buildkite.com/docs) | Agents contrôlés ; ops et coût |

### TEC45 — Docker et images OCI

**Rôle :** Packaging proposé. **Statut :** Proposition ; non installé. **Trace :** Déploiement.

Runtime non-root, images digest, dépendances minimales. [Documentation de référence](https://docs.docker.com/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Podman](https://docs.podman.io/) | Runtime conteneurs ; compatibilité à vérifier |
| [Buildah](https://buildah.io/) | Construction OCI ; runtime séparé |
| [Cloud Native Buildpacks](https://buildpacks.io/docs/) | Construction sans Dockerfile ; builder à épingler |

### TEC46 — OpenTofu

**Rôle :** Infrastructure as code proposée. **Statut :** Proposition ; non installé. **Trace :** Déploiement.

À adopter si providers nécessaires disponibles ; state sensible protégé. [Documentation de référence](https://opentofu.org/docs/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Terraform](https://developer.hashicorp.com/terraform/docs) | Licence/version à examiner |
| [Pulumi](https://www.pulumi.com/docs/) | Langage généraliste ; state et secrets |
| [Ansible](https://docs.ansible.com/) | Configuration déclarative ; drift/state différents |

### TEC47 — Vitest

**Rôle :** Tests unitaires proposés. **Statut :** Proposition ; non installé. **Trace :** Harness.

Règles déterministes et cas négatifs. [Documentation de référence](https://vitest.dev/guide/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Jest](https://jestjs.io/docs/getting-started) | Écosystème JS |
| [Node test runner](https://nodejs.org/api/test.html) | Natif ; moins de dépendances |
| [Mocha](https://mochajs.org/) | Ajouter assertions et couverture adaptées |

### TEC48 — Playwright

**Rôle :** E2E proposé. **Statut :** Proposition ; non installé. **Trace :** Harness.

Multi-acteurs, réseau, navigateur et export. [Documentation de référence](https://playwright.dev/docs/intro).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Cypress](https://docs.cypress.io/) | Tester contraintes multi-session |
| [WebdriverIO](https://webdriver.io/docs/gettingstarted) | Web/mobile ; configuration |
| [Selenium](https://www.selenium.dev/documentation/) | Grille et orchestration à gérer |

### TEC49 — k6

**Rôle :** Charge proposée. **Statut :** Proposition ; non installé. **Trace :** Harness.

Scénarios fictifs sur staging autorisé. [Documentation de référence](https://grafana.com/docs/k6/latest/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Locust](https://docs.locust.io/) | Python ; modèle d’utilisateurs |
| [Artillery](https://www.artillery.io/docs) | JS/YAML ; runner |
| [JMeter](https://jmeter.apache.org/usermanual/) | Java ; scénarios et infrastructure |

### TEC50 — OWASP ZAP

**Rôle :** DAST proposé. **Statut :** Proposition ; non installé. **Trace :** Harness.

Scanner staging avec authentification ; revue humaine requise. [Documentation de référence](https://www.zaproxy.org/docs/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Burp Suite](https://portswigger.net/burp/documentation) | Manuel/automatique selon licence |
| [Nuclei](https://docs.projectdiscovery.io/tools/nuclei/overview) | Templates ciblés ; couverture différente |
| [Invicti](https://www.invicti.com/support/) | Commercial ; couverture/API à comparer |

### TEC51 — Semgrep

**Rôle :** SAST proposé. **Statut :** Proposition ; non installé. **Trace :** Harness.

Règles adaptées TypeScript ; faux positifs justifiés. [Documentation de référence](https://semgrep.dev/docs/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [CodeQL](https://codeql.github.com/docs/) | Langages et licence privée à vérifier |
| [SonarQube](https://docs.sonarsource.com/sonarqube-server/) | Éditions/couverture à comparer |
| [Snyk Code](https://docs.snyk.io/scan-with-snyk/snyk-code) | SaaS ; données source et coûts |

### TEC52 — Trivy

**Rôle :** Dépendances et image proposées. **Statut :** Proposition ; non installé. **Trace :** Harness.

Versionner DB vulnérabilités et rapport ; pas de label de conformité. [Documentation de référence](https://trivy.dev/latest/docs/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Grype](https://github.com/anchore/grype) | Scan artefacts et SBOM |
| [OSV-Scanner](https://google.github.io/osv-scanner/) | Dépendances ; périmètre images différent |
| [Snyk Open Source](https://docs.snyk.io/scan-with-snyk/snyk-open-source) | SaaS ; licence et quotas |

### TEC53 — Gitleaks

**Rôle :** Détection de secrets proposée. **Statut :** Proposition ; non installé. **Trace :** Harness.

Scanner changements et historique autorisé ; rotation si fuite. [Documentation de référence](https://github.com/gitleaks/gitleaks).

| Alternative | Condition de viabilité / différence |
|---|---|
| [TruffleHog](https://github.com/trufflesecurity/trufflehog) | Attention validation externe des secrets |
| [detect-secrets](https://github.com/Yelp/detect-secrets) | Baseline revue, ne pas ignorer tout |
| [GitGuardian](https://docs.gitguardian.com/) | SaaS ; politiques dépôt et coûts |

### TEC54 — axe-core

**Rôle :** Audit accessibilité proposé. **Statut :** Proposition ; non installé. **Trace :** Harness.

Compléter avec clavier et lecteurs écran. [Documentation de référence](https://github.com/dequelabs/axe-core).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Pa11y](https://pa11y.org/) | Automatisation d’accessibilité |
| [Lighthouse](https://developer.chrome.com/docs/lighthouse/) | Audit partiel ; ne prouve pas WCAG |
| [Accessibility Insights](https://accessibilityinsights.io/docs/) | Guidage des vérifications manuelles |

### TEC55 — PDF et CSV

**Rôle :** Exports de référence. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Backlog 10 ; Contrats §7.

Conserver les deux formats, empreinte finale externe. [Documentation de référence](https://pdf-lib.js.org/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [pdf-lib + sérialiseur CSV](https://pdf-lib.js.org/) | Node ; mise en page à écrire et CSV à neutraliser |
| [PDFKit + sérialiseur CSV](https://pdfkit.org/) | Node ; texte, pages et fontes à tester |
| [WeasyPrint + csv Python](https://doc.courtbouillon.org/weasyprint/stable/) | Python ; HTML contrôlé et accès réseau interdit |

### TEC56 — SHA-256 et canonicalisation

**Rôle :** Intégrité. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Contrats §6–7.

Conserver les invariants cryptographiques ; alternatives d’implémentation, pas hashes affaiblis. [Documentation de référence](https://www.rfc-editor.org/rfc/rfc8785).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Node crypto + bibliothèque JCS validée](https://nodejs.org/api/crypto.html) | Même profil et golden vectors |
| [Web Crypto + bibliothèque JCS validée](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) | Vérificateur client ; source de hash fiable requise |
| [Python hashlib + bibliothèque JCS validée](https://docs.python.org/3/library/hashlib.html) | Vérificateur indépendant ; ne pas confondre json.dumps et JCS |

### TEC57 — API HTTP JSON

**Rôle :** Contrats transport. **Statut :** Cité historiquement ; usage actuel non vérifié. **Trace :** Contrats §1–3.

REST de commandes et schémas retenu ; pas de CRUD arbitraire. [Documentation de référence](https://spec.openapis.org/oas/v3.1.1.html).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Fastify JSON Schema](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) | Validation serveur choisie |
| [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction) | Autre implémentation mêmes contrats |
| [FastAPI OpenAPI](https://fastapi.tiangolo.com/) | Python ; mêmes sémantiques transactionnelles |

### TEC58 — MTN MoMo

**Rôle :** Moyen externe cité dans étude, connecteur futur. **Statut :** Futur ; non installé. **Trace :** Étude DOCX ; Backlog 17.1.

Pas un prestataire attesté de KÓMBE ; contrat/pays/flux après G3. [Documentation de référence](https://momodeveloper.mtn.com/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Orange Money](https://developer.orange.com/apis/om-webpay) | Réseau différent ; accès marchand local |
| [CamPay](https://www.campay.net/) | Agrégation ; vérifier statut, frais et règlement |
| [CinetPay](https://docs.cinetpay.com/) | Vérifier offre actuelle Cameroun et montage légal |

### TEC59 — Orange Money

**Rôle :** Moyen externe cité dans étude. **Statut :** Futur ; non installé. **Trace :** Étude DOCX ; Backlog 17.1.

Orange liste Cameroun ; admissibilité contractuelle du projet non acquise. [Documentation de référence](https://developer.orange.com/apis/om-webpay).

| Alternative | Condition de viabilité / différence |
|---|---|
| [MTN MoMo](https://momodeveloper.mtn.com/) | Contrat et API pays à vérifier |
| [CamPay](https://www.campay.net/) | Agrégateur ; diligence légale requise |
| [CinetPay](https://docs.cinetpay.com/) | Couverture/flux et coûts à vérifier |

### TEC60 — Wave

**Rôle :** Moyen mentionné par un concurrent dans étude. **Statut :** Futur ; non installé. **Trace :** Étude DOCX, exemple Djangui.

Aucun choix KÓMBE ; aucune disponibilité Cameroun présumée. [Documentation de référence](https://www.wave.com/).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Orange Money](https://developer.orange.com/apis/om-webpay) | Usage local à contractualiser |
| [MTN MoMo](https://momodeveloper.mtn.com/) | Usage local à contractualiser |
| [CamPay](https://www.campay.net/) | Agrégation conditionnelle, pas autorisation implicite |

### TEC61 — Hugging Face Hub

**Rôle :** Distribution modèles, proposition. **Statut :** Proposition ; non installé. **Trace :** Liens modèles de la note IA ; candidat de travail.

Fixer révision, licence et empreinte ; aucun dataset réel public. [Documentation de référence](https://huggingface.co/docs/hub/index).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Stockage objet privé versionné](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html) | Héberger les poids légalement redistribuables |
| [GitLab Package Registry](https://docs.gitlab.com/user/packages/generic_packages/) | Artefacts génériques ; quotas fichiers |
| [Artifactory](https://jfrog.com/help/r/jfrog-artifactory-documentation) | Registry privé ; ops/coûts |

### TEC62 — Python standard library

**Rôle :** Harness livré dans ce dossier. **Statut :** Proposition ; non installé. **Trace :** 04_Harness.

Exécutable sans dépendances externes ; ne constitue pas backend KÓMBE. [Documentation de référence](https://docs.python.org/3/library/unittest.html).

| Alternative | Condition de viabilité / différence |
|---|---|
| [Node test runner](https://nodejs.org/api/test.html) | Porter oracles et protocoles JSON |
| [pytest](https://docs.pytest.org/) | Même Python, dépendance supplémentaire |
| [JUnit](https://docs.junit.org/) | Portage JVM et fixtures identiques |

## Protocoles et règles à conserver

HTTPS/TLS, encodage UTF-8, instants UTC/ISO 8601, fuseau Africa/Douala, XAF entier, SQL transactionnel, RBAC/autorisation objet, JSON Schema, idempotence, snapshots, hash chaîné et RLS sont des exigences ou mécanismes. Les changer pour satisfaire artificiellement un nombre d'alternatives affaiblirait le projet. Les choix d'implémentation comparés dans les lignes Base, API, Identité et Intégrité offrent plusieurs solutions tout en préservant ces invariants. Les options de calcul int4/int8 et LoRA sont des techniques à benchmarker, pas des services achetés.

## Choix recommandé à ce stade

Réutiliser le code auditable. Sinon : React/TypeScript/Vite + Fastify/Node + pg + PostgreSQL ; API et worker Render payants ; Supabase DB/Auth/Storage payant ; outbox PostgreSQL ; email Resend selon canal choisi ; GitHub Actions ; Vitest/Playwright ; scans et observabilité minimisée. Garder Figma ou l'outil de design déjà maîtrisé. Pas de moteur LLM, broker Redis, Kubernetes ou paiement du pot au pilote.

La liste des alternatives n'est pas une liste de services à souscrire. Une seule solution par besoin, choisie par ADR, suffit.


## Complément de la révision 2.0 — construction par agents

Le registre complet compte désormais 71 entrées et 213 positions d’alternatives. Les alternatives de langage différent demandent une adaptation ou une autre stack ; elles ne remplacent pas directement un paquet TypeScript. Les entrées de méthodes peuvent avoir des solutions internes comme alternatives. Liens primaires de découverte : aucune compatibilité intégrée ou licence à une révision précise n’est certifiée.

### TEC63 — Spec Kit

Usage : Méthode de spécification. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Socle principal recommandé ; un seul pilote de workflow. [Dépôt ou documentation](https://github.com/github/spec-kit).

| Alternative | Conditions de viabilité |
|---|---|
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Spécifications par changement ; remplacer la méthode principale |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) | Méthode produit/architecture plus large ; éviter double orchestration |
| [BDD avec Cucumber](https://github.com/cucumber/cucumber-js) | Exigences exécutables ; gouvernance et plan à construire séparément |

### TEC64 — ECC

Usage : Bibliothèque de skills et règles. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Sélectionner les composants ; compatibilité hôte à tester. [Dépôt ou documentation](https://github.com/affaan-m/ECC).

| Alternative | Conditions de viabilité |
|---|---|
| [Superpowers](https://github.com/obra/superpowers) | Discipline de réalisation prescriptive ; adoption sélective |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) | Workflow global à substituer si besoin |
| [Instructions et scripts internes](https://agents.md/) | Moins de dépendances ; maintenance et évaluation à assurer |

### TEC65 — Trail of Bits Skills

Usage : Skills de revue et sécurité. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Sélectionner propriété, mutation, conformité spec/code et validation après patch. [Dépôt ou documentation](https://github.com/trailofbits/skills).

| Alternative | Conditions de viabilité |
|---|---|
| [ECC security-review](https://github.com/affaan-m/ECC) | Checklist générale ; compléter avec tests et expertise |
| [Revue ASVS structurée](https://owasp.org/www-project-application-security-verification-standard/) | Méthode manuelle et automatisée ; demande un relecteur compétent |
| [Skills internes de revue](https://agentskills.io/) | Construire et évaluer un pack adapté au domaine ; aucune équivalence immédiate |

### TEC66 — Superpowers

Usage : Workflow et skills de développement. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Alternative à l’exécution ECC ; éviter consignes globales concurrentes. [Dépôt ou documentation](https://github.com/obra/superpowers).

| Alternative | Conditions de viabilité |
|---|---|
| [ECC](https://github.com/affaan-m/ECC) | Composer les capacités utiles |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) | Couverture plus large du cycle produit |
| [TDD et revue internes](https://agents.md/) | Règles et scripts maintenus dans le projet |

### TEC67 — OpenSpec

Usage : Gestion des spécifications et changements. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Alternative à Spec Kit ; pas deuxième source de vérité. [Dépôt ou documentation](https://github.com/Fission-AI/OpenSpec).

| Alternative | Conditions de viabilité |
|---|---|
| [Spec Kit](https://github.com/github/spec-kit) | Workflow principal structuré |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) | Conception et développement guidés |
| [BDD avec Cucumber](https://github.com/cucumber/cucumber-js) | Scénarios exécutables ; traçabilité complémentaire à concevoir |

### TEC68 — BMAD Method

Usage : Méthode produit architecture et réalisation. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Alternative pour accompagnement élargi ; non nécessaire au socle proposé. [Dépôt ou documentation](https://github.com/bmad-code-org/BMAD-METHOD).

| Alternative | Conditions de viabilité |
|---|---|
| [Spec Kit](https://github.com/github/spec-kit) | Centré sur spécifications et réalisation |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Changements documentés ; rôles à organiser |
| [Superpowers](https://github.com/obra/superpowers) | Conception et exécution ; compléter arbitrages produit |

### TEC69 — fast-check

Usage : Tests génératifs de propriétés. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Recommandé pour les invariants TypeScript ; graines reproductibles. [Dépôt ou documentation](https://github.com/dubzzz/fast-check).

| Alternative | Conditions de viabilité |
|---|---|
| [Hypothesis](https://github.com/HypothesisWorks/hypothesis) | Python ; utile pour oracle indépendant ou autre backend |
| [jqwik](https://github.com/jqwik-team/jqwik) | JVM ; changement de langage ou harness interprocessus |
| [Générateur métier interne](https://nodejs.org/api/test.html) | Même stack JS ; écrire réduction des cas et gestion des graines |

### TEC70 — StrykerJS

Usage : Tests de mutation. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : Cibler le domaine critique ; examiner chaque mutant survivant. [Dépôt ou documentation](https://github.com/stryker-mutator/stryker-js).

| Alternative | Conditions de viabilité |
|---|---|
| [mutmut](https://github.com/boxed/mutmut) | Python uniquement ; autre backend ou oracle Python |
| [PIT](https://github.com/hcoles/pitest) | Java/JVM ; non interchangeable avec le produit TypeScript |
| [Mutations ciblées internes](https://git-scm.com/docs/git-apply) | Patches de défauts connus sur checkout éphémère ; couverture plus étroite |

### TEC71 — Testcontainers Node

Usage : Services réels temporaires pour tests. Statut : Proposé pour la construction neuve ; non installé.

Recommandation : PostgreSQL isolé ; empêcher accès des agents au daemon privilégié de l’hôte. [Dépôt ou documentation](https://github.com/testcontainers/testcontainers-node).

| Alternative | Conditions de viabilité |
|---|---|
| [Docker Compose](https://docs.docker.com/compose/) | Piloter explicitement isolation, readiness et nettoyage |
| [Services CI PostgreSQL](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers) | Dépend du runner ; isoler jobs et credentials |
| [PostgreSQL éphémère local](https://www.postgresql.org/docs/current/app-initdb.html) | Provisionner ports, comptes et répertoires ; nettoyage à maintenir |
