# KÓMBE — Références design 2026 (`DESIGN_2026_REFS.md`)

> Synthèse de recherche (octobre 2026) pour la refonte UI/UX de KÓMBE — PWA web (`packages/client`, React + Vite) et mobile Flutter (`packages/mobile`).
> Public : grand public camerounais peu technophile, mobile-first, faible bande passante, culture WhatsApp, montants en FCFA.
> Chaque section donne des règles actionnables (« Règle : … ») suivies des sources URL vérifiées en fin de document.

---

## 1. Apple Human Interface Guidelines 2025–2026 : Liquid Glass et interaction native

Apple a introduit en juin 2025 (iOS 26) le matériau **Liquid Glass**, qui unifie son langage de design : une couche fonctionnelle translucide (contrôles, navigation) flottant au-dessus de la couche de contenu.

### 1.1 Liquid Glass : matériaux et hiérarchie des couches
- **Règle :** Liquid Glass forme une **couche fonctionnelle distincte** (tab bars, sidebars, barres d'outils) qui flotte au-dessus du contenu ; ne jamais l'utiliser *dans* la couche de contenu — cela brouille la hiérarchie visuelle.
- **Règle :** Employer Liquid Glass **avec parcimonie** : le matériau attire l'attention sur le contenu sous-jacent ; l'appliquer à trop de contrôles personnalisés distrait et dégrade l'expérience. Limiter aux éléments fonctionnels les plus importants.
- **Règle :** Deux variantes : `regular` (flou + ajustement de luminosité, pour la lisibilité des textes — alertes, popovers) et `clear` (très translucide, réservée aux médias riches). Sur fond clair lumineux sous `clear`, ajouter une couche d'assombrissement ~35 % d'opacité.
- **Règle :** Le verre « régulier » **s'adapte automatiquement clair/sombre** : il paraît plus sombre sur fond sombre, plus clair sur fond clair — ne pas coder en dur des couleurs de surface.
- **Règle :** Respecter le réglage **Réduire la transparence** / Increase Contrast : prévoir un fallback opaque à contraste garanti.
- **Règle :** Concevoir **edge-to-edge** : le contenu défile sous les barres (safe areas) ; les vues s'étendent sous la navigation et les scroll edge effects (flou progressif en bordure) préservent la lisibilité.

### 1.2 Typographie : hiérarchie et optical sizing
- **Règle :** iOS : taille par défaut 17 pt, minimum 11 pt ; hiérarchie via les **text styles** (Large Title 34 pt, Title 28 pt, Headline 17 pt semibold, Body 17 pt…) plutôt que via des tailles arbitraires.
- **Règle :** Les polices variables du système (SF Pro) offrent **optical sizing dynamique** : le tracé des glyphes s'interpole selon la taille (Text ↔ Display) ; côté web, activer `font-optical-sizing` et faire varier graisse/interlettrage avec la taille (tracking négatif ~−0,4 pt vers 17 pt, positif en tout petit corps).
- **Règle :** **Éviter les graisses légères** (Thin/Light) surtout en petit corps ; préférer Regular/Medium/Semibold.
- **Règle :** **Dynamic Type** : toute mise en page doit survivre aux tailles accessibles (jusqu'à 200 %, tailles AX1–AX5) ; passer en empilement vertical (stack) quand l'espace horizontal manque, limiter la troncature, garder la hiérarchie constante quelle que soit la taille.

### 1.3 Mouvement, gestes, haptique
- **Règle :** Ajouter du mouvement **avec un but** : « don't add motion for the sake of adding motion » — une animation gratuite distrait et peut incommoder. Le feedback ≠ décoration.
- **Règle :** Feedback **bref et précis** : mieux vaut une animation courte et exacte qu'une animation spectaculaire ; éviter d'animer les interactions très fréquentes.
- **Règle :** **Animations à ressort interrompibles** : ne jamais faire attendre la fin d'une animation — l'utilisateur doit pouvoir l'annuler/la détourner à tout instant (physique de ressort, cf. WWDC23 « Animate with springs »).
- **Règle :** Le mouvement doit **suivre le geste** et les attentes physiques (révéler vers le bas ⇒ se ferme vers le bas) ; préférer les gestes natifs (swipe, pull-to-refresh, sheet à tirer) aux gestes exotiques, et toujours offrir un **bouton équivalent au geste**.
- **Règle :** **Réduire les mouvements (Reduce Motion)** : quand actif, resserrer les ressorts (moins de rebond), remplacer les translations par des fondus, ne pas animer les changements de profondeur (z) ni les flous.
- **Règle :** **Haptique en accompagnement, jamais seule** : coupler une vibration légère aux confirmations (cotisation enregistrée) ; doubler tout son et toute animation d'un canal alternatif (haptique, texte).
- **Règle :** **Dark mode first-class** : vérifier les contrastes dans les deux apparences ; utiliser les couleurs système/sémantiques qui s'adaptent automatiquement.

## 2. Material 3 Expressive (Google, 2025–2026) : la contrepartie Android

Material 3 Expressive (annoncé en mai 2025) est l'évolution « expressive » de Material Design 3 : personnalité accrue sans sacrifier la lisibilité.

- **Règle :** **Formes expressives** : bibliothèque de formes étendue (shapes morphing — une forme se transforme lors d'un changement d'état) ; tokens de forme dédiés par composant. Pour KÓMBE : une famille de formes signature (super-ellipses arrondies) cohérente sur web + Flutter (`ShapeTheme`).
- **Règle :** **Mouvement à physique de ressort** : springs basés sur la physique avec durée/amortissement définis en tokens de motion ; correspond à la mécanique des springs iOS — une seule grammaire d'animation à traduire dans les deux stacks.
- **Règle :** **Typographie variable** : Roboto Flex (axes graisse/largeur) ; l'emphase passe par graisse + taille, pas seulement la couleur.
- **Règle :** **Couleur et emphase** : grands aplats de la palette de marque pour les moments clés (bouton « Payer ma cotisation »), le reste en surfaces neutres.
- **Règle :** **Nouveaux composants** : button groups (actions liées), FAB menu, toolbar — adopter les équivalents Material 3 dans Flutter pour rester natif Android.
- **Règle :** La recherche Google (≈18 000 participants) montre que les designs expressifs sont perçus comme **plus utilisables** ; l'expression sert la clarté, elle ne s'y substitue pas.
- **Règle :** Travailler avec **tokens** (couleur, forme, mouvement, typographie) plutôt qu'avec des valeurs codées en dur — un seul langage de tokens partagé PWA/Flutter.

## 3. Fintech mobile-first Afrique francophone : performance, offline, confiance

### 3.1 Faible bande passante
- **Règle :** Budget de performance strict : **< 200 KB par écran** (réseau + images + JS exécuté), shell PWA initial < 150 KB gzip, car une part importante des connexions reste 2G/3G instable et la data est payante au Mo.
- **Règle :** Images en **WebP/AVIF** avec `<picture>` + fallback JPEG, dimensions fixes (pas de layout shift), chargement différé (lazy) hors de l'écran initial ; aucune image > 60 KB.
- **Règle :** **Offline-first** : service worker (PWA) / cache local (Flutter) avec données en lecture toujours disponibles ; file d'attente des écritures (cotisations, messages) rejouée à la reconnexion, avec badge « en attente d'envoi ».
- **Règle :** États hors-ligne **tolérants et explicites** : bannière « Mode hors-ligne — dernières données du [date] », jamais d'écran d'erreur brut ; chaque action mise en file est annulable.
- **Règle :** Rendu sans JS bloquant : squelettes de chargement légers, polices système ou 1 seule fonte variable sous-ensemble (~20–40 KB), pas de carrousels/poids morts au démarrage.

### 3.2 Sécurité et données
- **Règle :** **Chiffrement local** des données sensibles (cache des membres, montants, PIN) : WebCrypto/IndexedDB chiffré côté PWA, `flutter_secure_storage` (Keystore/Keychain) côté mobile ; jamais de secrets en `localStorage` brut.
- **Règle :** Authentification à la fois par code SMS et PIN local ; expiration de session raisonnable (l'argent impose de la friction), re-PIN pour les actions sensibles.

### 3.3 Culture WhatsApp et canaux
- **Règle :** **Partage d'invitation natif WhatsApp** : bouton « Inviter » qui ouvre `wa.me` avec un message pré-rédigé + code/lien d'invitation court et lisible (« Rejoins ma tontine « Njangui Famille » sur KÓMBE : code KMB-4F7A ») — le bouche-à-pouce passe par WhatsApp, pas par l'email.
- **Règle :** Le code d'invitation doit aussi fonctionner **hors app** (dictable, saisissable à la main) ; deep link + code alphabétique court en secours.
- **Règle :** **Fiabilité SMS** : OTP par SMS avec relance automatique, expiration lisible et bouton « Renvoyer » ; ne pas faire du SMS le seul canal de récupération (les taux d'échec de livraison sont élevés en Afrique ; les flux USSD montrent un « success cliff » quand le nombre d'étapes augmente). Prévoir rappels SMS/WhatsApp en plus des notifications push.
- **Règle :** **Formatage FCFA** : `Intl.NumberFormat('fr-FR'|'fr-CM', {style:'currency', currency:'XOF'|'XAF'})` ou équivalent intl Flutter — séparateur de milliers espace insécable, **pas de décimales**, suffixe « FCFA » : « 25 000 FCFA ». Les montants critiques (à recevoir, à verser) toujours en toutes lettres dans le contexte (« Tu recevras 250 000 FCFA en mars »).

### 3.4 Onboarding et confiance
- **Règle :** **Onboarding < 3 écrans** : valeur → numéro de téléphone → code SMS ; demander les permissions à la demande (contexte), jamais en rafale au démarrage ; la PWA doit être utilisable sans compte pour consulter une tontine partagée.
- **Règle :** **Transparence radicale** : registre lisible par tous les membres — qui a cotisé, combien, qui reçoit quand, et le libellé du rôle (« L'argent est tenu par le trésorier, Fatima ») ; chaque mouvement d'argent traçable (traçabilité de bout en bout revendiquée par les acteurs du secteur, ex. Cirkkle pour la diaspora).
- **Règle :** Les partenaires de paiement (MTN MoMo, Orange Money) sont nommés à l'écran de paiement ; l'app affiche ce qu'elle est — un **registre et un assistant de tontine** — sans prétendre être une banque.

## 4. Accessibilité : WCAG 2.2 AA (+ socle iOS/Android)

- **Règle :** **Contraste texte ≥ 4,5:1** (texte < 18 pt), ≥ 3:1 pour grand texte (≥ 18 pt ou 14 pt gras) et pour les bordures/états de composants (non-text contrast) — vérifier clair ET sombre (Apple impose le même niveau AA).
- **Règle :** **Cibles tactiles** : minimum WCAG 2.2 AA = 24×24 CSS px (SC 2.5.8, avec exceptions d'espacement) ; **standard KÓMBE = 44×44 pt/px** (recommandation Apple HIG, SC 2.5.5 AAA, ≈48 dp Material) + ~12 pt d'espacement autour des contrôles.
- **Règle :** **Focus visible** : indicateur de focus toujours perceptible (SC 2.4.7) et non masqué par la barre de navigation/les éléments flottants (SC 2.4.11 « Focus Not Obscured ») — viser un anneau ≥ 2 px, contraste 3:1 avec le fond.
- **Règle :** **Libellés** : chaque icône/bouton a un nom accessible (aria-label / Semantics Flutter) ; les champs ont des labels permanents visibles (pas de placeholder-only) ; les erreurs sont annoncées et textuelles, jamais par la couleur seule (forme + icône + texte).
- **Règle :** **prefers-reduced-motion** : requête média CSS (et `MediaQuery.disableAnimations`/Reduce Motion iOS) → désactiver/remplacer par des fondus toutes les animations non essentielles ; l'information ne doit jamais être portée par la seule animation.
- **Règle :** Supporter l'agrandissement du texte à 200 % (Dynamic Type / `textScaleFactor`) sans perte de contenu ; tester à la taille AX3.

## 5. État de l'art apps de tontine / ROSCA 2024–2026

### 5.1 Panorama
- Applications repérées et publiques : **Cirkkle** (ROSCA approuvée, traçabilité, diaspora), **Esusu** (États-Unis, épargne-liée-crédit), **Matontine** (Sénégal, inclusion des femmes), **Moneyfellows** (Égypte, cercles à grande échelle), **Chamasoft** (Kenya, gestion de groupes/chamas) ; au Cameroun : **Yankap** (tontine digitale, paiements Orange Money/MTN MoMo, transparence), **Djangui/FreemoPay**, et une digitalisation largement adossée à WhatsApp + mobile money (France24, 2024).
- **Enseignement :** les apps qui durent ne remplacent pas la tontine, elles la **matérialisent** : elles reproduisent le carnet du trésorier à l'écran.

### 5.2 Ce qui rassure (à faire)
- **Règle :** Cycle « **qui reçoit quand** » explicite dès l'écran d'accueil : ordre de passage, tour de chacun, prochaine échéance — c'est la donnée n°1 de l'utilisateur.
- **Règle :** **Calendrier des séances** visible (dates, lieu/heure, montant dû) et compte à rebours avant la prochaine séance.
- **Règle :** **Statuts de cotisation clairs** par membre : Payé / En attente / En retard (avec date), et statut du paiement mobile money en temps réel (initié → confirmé).
- **Règle :** **Registre public du groupe** : historique complet des tours passés, montants collectés/distribués, et trace du versement au bénéficiaire — la traçabilité est l'argument de confiance des apps (Cirkkle, Yankap).
- **Règle :** **Rappels multi-canaux** (notification + SMS/WhatsApp) à J-3 et le jour de la séance ; le trésorier peut relancer en un geste.
- **Règle :** Accepter le **double mode de paiement** : cotisation enregistrée par le trésorier quand le paiement a eu lieu en espèces (cash) — le digital enregistre, il ne remplace pas tout.

### 5.3 Anti-patterns à éviter
- **Règle :** Cacher la mécanique de rotation (ordre opaque, « défini par le système » sans explication) — source n°1 de méfiance.
- **Règle :** Jargon bancaire (« épargne bloquée », « frais de gestion », « souscription ») à la place du vocabulaire de la tontine (tour, séance, trésorier, cotisation).
- **Règle :** Forcer le 100 % digital : bloquer un utilisateur faute de data/réseau ou interdire le cash casse les groupes réels.
- **Règle :** Faire passer l'app pour une institution financière régulée alors qu'elle est un registre (risque juridique + perte de confiance en cas de doute).
- **Règle :** Notifications agressives / guilt-tripping sur les retards ; contester la parole du trésorier dans l'interface.
- **Règle :** Surcharge visuelle type « dashboard bancaire » : tableaux de bord complexes pour un usage mobile à faible littératie numérique.

---

## 6. Les 12 règles d'or KÓMBE (PWA web + Flutter Android/iOS)

1. **Le contenu d'abord, la matière avec parcimonie.** Une seule couche « verre/translucide » pour la navigation flottante (Liquid Glass côté iOS, surface élevée côté Android/web) ; jamais dans le contenu. Fallback opaque si « Réduire la transparence ».
2. **Le mouvement a un but, il est bref et interruptible.** Physique de ressort (tokens partagés), feedback < 300 ms, toute animation annulable à tout moment.
3. **Respecter Reduce Motion et Reduce Transparency** partout (CSS `prefers-reduced-motion`, réglages iOS/Android) : fondus au lieu de translations, ressorts resserrés, alternatives haptiques/textuelles.
4. **Hiérarchie typographique par échelle, pas par décoration.** Échelle type iOS/M3 (34/28/22/17/15), graisses ≥ Regular, optical sizing, 17 pt de corps par défaut, 11 pt minimum absolu.
5. **Texte à 200 % sans casse.** Dynamic Type / textScale testés (AX3) ; passage en colonne empilée au-delà d'un seuil.
6. **Cibles 44×44 pt minimum** (WCAG AA plancher 24×24 px), espacement ~12 pt, focus visible ≥ 2 px jamais masqué, libellés accessibles sur 100 % des icônes.
7. **Contraste ≥ 4,5:1 vérifié en clair ET en sombre** ; dark mode first-class avec couleurs sémantiques (jamais de noir/blanc codé en dur).
8. **< 200 KB par écran, WebP/AVIF, polices sous-ensemblées.** Le shell PWA tient sur une connexion 2G ; aucun écran ne dépend d'une image lourde.
9. **Offline-first honnête.** Lecture toujours dispo, écritures en file rejouables, bannière « hors-ligne + date des données », statut « en attente d'envoi » annulable.
10. **Chiffrement local des données sensibles** (secure storage mobile, IndexedDB chiffré web) + PIN/biométrie pour toute action financière.
11. **L'invitation vit sur WhatsApp.** Bouton « Inviter » → `wa.me` avec message pré-rédigé et code KMB-XXXX dictable + saisissable ; rappels séance via notification + SMS/WhatsApp.
12. **Le registre est la promesse.** « Qui reçoit quand », calendrier des séances, statut de chaque cotisation, rôle du trésorier affichés en toutes lettres, montants en FCFA formatés (« 25 000 FCFA », sans décimales) — transparence avant esthétique.

---

## Sources

### Apple HIG 2025–2026
- Liquid Glass (Apple Developer) : https://developer.apple.com/documentation/technologyoverviews/liquid-glass
- HIG Materials (Liquid Glass, variantes regular/clear, vibrancy) : https://developer.apple.com/design/human-interface-guidelines/materials
- HIG Motion (ressort, interruption, restraint, Reduce Motion) : https://developer.apple.com/design/human-interface-guidelines/motion
- HIG Typography (Dynamic Type, optical sizing, tailles 17/11 pt, tracking) : https://developer.apple.com/design/human-interface-guidelines/typography
- HIG Accessibility (contrastes WCAG, 44×44 pt, haptique, Reduce Motion) : https://developer.apple.com/design/human-interface-guidelines/accessibility
- HIG Dark Mode : https://developer.apple.com/design/human-interface-guidelines/dark-mode
- WWDC25 — Get to know the new design system : https://developer.apple.com/videos/play/wwdc2025/356/
- WWDC23 — Animate with springs : https://developer.apple.com/videos/play/wwdc2023/10158/

### Material 3 Expressive
- Building with M3 Expressive (Google, 13 mai 2025) : https://m3.material.io/blog/building-with-m3-expressive
- Material Design 3 (système, tokens) : https://m3.material.io/
- M3 Motion (physique de ressort) : https://m3.material.io/styles/motion/overview/how-it-works
- Expressive Design : Google's UX Research : https://design.google/library/expressive-material-design-google-research
- Synthèse M3 Expressive (composants, 18k participants) : https://supercharge.design/blog/material-3-expressive

### Fintech mobile-first Afrique / performance
- Building Mobile-First Web Apps for African Markets : https://lioncapventures.com/blog/building-mobile-first-web-apps-african-markets
- Build a Low-Bandwidth Web App for 2G in Africa : https://codeinktechnologies.com/companynews/low-bandwidth-web-app-2g-africa
- Building Scalable Web Apps for African Markets (2025) : https://tezzasolutions.com/building-scalable-web-apps-for-african-markets-2025-dev-best-practices/
- GSMA — The Mobile Economy Africa 2025 : https://www.gsmaintelligence.com/research/the-mobile-economy-africa-2025
- GSMA — Inclusive Digital Finance / Mobile Money : https://www.gsma.com/mobilefordevelopment/mobile-money/
- Evidence of a Success Cliff in USSD Workflows (arXiv) : https://arxiv.org/html/2607.07650v1
- Guide OTP delivery fiable (Afrique) : https://simbox.app/guides/guide-for-mobile-developers-building-reliable-otp-delivery
- MDN — Intl.NumberFormat (formatage XOF/FCFA) : https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat

### Accessibilité WCAG 2.2
- WCAG 2.2 (recommandation W3C) : https://www.w3.org/TR/WCAG22/
- Understanding SC 2.5.8 Target Size (Minimum, 24×24 px) : https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Understanding SC 2.4.11 Focus Not Obscured : https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- Understanding SC 2.4.13 Focus Appearance : https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- MDN — prefers-reduced-motion : https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

### Tontines / ROSCA 2024–2026
- France24 — Au Cameroun, les ancestrales tontines se digitalisent (12/03/2024) : https://www.france24.com/fr/info-en-continu/20240312-au-cameroun-les-ancestrales-tontines-se-digitalisent
- Cirkkle — Top 5 des applications de tontine digitale : https://cirkkle.com/blog/top-5-des-applications-de-tontine-digitale-dans-le-monde
- Cirkkle — Why join a digital ROSCA : https://cirkkle.com/en/blog/why-join-a-digital-rosca
- Yankap — tontine digitale du Cameroun (MoMo/Orange Money) : https://yankap.cm/
- Tontiin — épargne communautaire africaine : https://tontiin.com/
- Djangui — Tontine MTN Mobile Money : https://djangui.net/tontine-mtn-mobile-money
- World Bank — Digital Access: The Future of Financial Inclusion in Africa : https://documents1.worldbank.org/curated/en/719111532533639732/pdf/128850-WP-AFR-Digital-Access-The-Future-of-Financial-Inclusion-in-Africa-PUBLIC.pdf
