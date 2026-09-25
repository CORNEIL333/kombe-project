# Référentiels internationaux et preuves attendues

## Position de conformité

Ce dossier fixe une cible vérifiable ; aucun label de conformité n'est attribué au logiciel. ASVS et WCAG sont des référentiels de vérification ; ISO/IEC 27001 concerne un système de management de la sécurité dans un périmètre organisationnel défini ; un rapport SOC 2 n'est pas une certification universelle du code. Un fournisseur certifié ne transmet pas automatiquement son assurance à KÓMBE.

| Référentiel de travail | Application KÓMBE | Preuve et responsable | Porte |
|---|---|---|---|
| OWASP ASVS 5.0.0, cible L2 | Sécurité application et API ; sélectionner exigences applicables, IDs versionnés | Matrice exigence/test/preuve, revue indépendante ; sécurité | G0 chemins critiques, G1 couverture applicable complète |
| OWASP MASVS / MASTG | Uniquement si client natif retenu ; secrets, cache, plateforme | Tests appareils et stockage, version du référentiel figée ; mobile/sécurité | Avant client natif réel |
| NIST SP 800-63B-4 | Politique d'authentification et récupération | Essais mots de passe, sessions, MFA, canaux et récupération ; identité | G0 |
| WCAG 2.2 AA | Parcours web, erreurs, authentification et exports utilisables | Audit automatique + clavier + TalkBack/lecteur écran, zoom et reflow ; UX/QA | G0 parcours critiques, G1 reste |
| NIST SSDF SP 800-218 v1.1 | Préparation, protection, production et réponse aux vulnérabilités | Dépôt protégé, revues, SBOM, scans et incident ; lead | Dès premier lot |
| SLSA v1.1 comme baseline de provenance | Artefact associé au commit, builder et dépendances | Attestation de provenance vérifiable ; DevOps | G0 |
| ISO/IEC 27001:2022 | Politique, risques, accès, fournisseurs, incidents et amélioration | Dossier de management avec responsabilités et audit ; direction | Démarrage avant G0, trajectoire ultérieure |
| OpenAPI 3.1.1 / JSON Schema | Requêtes et réponses versionnées | Validation des schémas + tests contrats ; backend | C00 puis chaque lot |
| RFC 8785 / SHA-256 | Canonicalisation d'événement et empreinte des fichiers | Golden vectors interlangages, vérificateur et ancrage ; backend/sécurité | G0 proposé pour profil, ancrage avant promesse d'intégrité avancée |
| Loi camerounaise 2024/017 | Traitements, droits et prestataires | Analyse locale écrite, notices, registre, contrats, flux internationaux ; données/conseil | Avant données réelles |
| Règlement CEMAC 04/18 services de paiement | Qualification fonctionnelle du montage futur | Analyse des flux et responsabilités, partenaire admissible et contrat ; conseil | Avant activation paiement du pot |

**Application locale à confirmer :** l'existence et l'intitulé de la loi camerounaise sont retrouvés dans l'index officiel ; la page du document renvoie une erreur à l'ouverture. Aucun délai légal précis, formalité, autorité actuellement opérationnelle ou dérogation n'est déduit d'un extrait de recherche. Le règlement BEAC est accessible comme PDF officiel ; aucune qualification juridique individuelle n'est affirmée ici.

## Critères opérationnels de sécurité

MFA obligatoire proposé pour opérateurs techniques et support sensible ; step-up des changements à fort impact. Séparation stricte des comptes ordinaires et de maintenance. Récupération révoquant les sessions ; mode de suspension des privilèges clairement documenté. La vérification de téléphone confirme le contrôle d'un canal, pas l'identité civile ni l'absence de collusion.

Les tests ASVS sont numérotés d'après le document réellement importé, sans inventer des numéros. Pour chaque exigence : applicable/non applicable avec motif ; composant ; test ; résultat ; SHA d'artefact ; date ; auteur ; réviseur ; défaut lié. Les cases non renseignées restent bloquantes si le contrôle est nécessaire à la porte visée.

Cible d'accessibilité : contraste 4,5:1 pour texte normal, 3:1 pour grand texte selon définition WCAG ; contrôles et focus visibles ; cibles tactiles conformes aux critères applicables, sans imposer une dimension arbitraire comme norme. Les validations financières permettent relecture et correction ; l'erreur n'est pas exprimée par couleur seule. L'audit automatique ne remplace pas les essais utilisateurs. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Dossier de preuve de release

Chaque release contient SHA du commit, schéma DB, hash de l'image, lockfile, SBOM, provenance, versions de tests, résultats non expurgés de leurs échecs mais nettoyés des secrets, rapports de revue et exceptions approuvées. Les artefacts sensibles restent sous contrôle d'accès. Une capture d'écran, un pourcentage de couverture ou un « tout passe » rédigé par l'auteur ne constitue pas seul une preuve.

Le contrôle de porte du harness fourni vérifie la structure et les empreintes de preuves présentes. La revue humaine indépendante doit vérifier leur authenticité et leur pertinence ; un script ne peut pas certifier un rapport falsifié par une personne qui contrôle tous les fichiers.

## Sources officielles

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP sécurité mobile](https://owasp.org/www-project-mobile-app-security/)
- [NIST authentificateurs](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
- [NIST SSDF v1.1](https://csrc.nist.gov/pubs/sp/800/218/final)
- [SLSA v1.1](https://slsa.dev/spec/v1.1/)
- [ISO/IEC 27001:2022](https://www.iso.org/standard/27001)
- [Index officiel loi camerounaise](https://www.prc.cm/fr/actualites/actes/lois?start=24)
- [BEAC règlement 04/18](https://www.beac.int/wp-content/uploads/2019/07/REGLEMENT-N-04-18-CEMAC-UMAC-COBAC-du-21-d%C3%A9cembre-2018.pdf)
