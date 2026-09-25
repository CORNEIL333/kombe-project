# Runbook incident et reprise

## Fiche à compléter avant G0

Responsable incident : à nommer. Suppléant : à nommer. Responsable données : à nommer. Contact utilisateurs : à publier. Accès console : comptes organisation sous MFA. Fenêtre de support et procédure hors horaires : à adopter. Ces champs sont des blocages identifiés, pas des personnes supposées disponibles.

## S1 — Fuite ou intégrité compromise

Détection → ouvrir un numéro d'incident et relever UTC, version, groupes concernés → révoquer l'accès en cause ou geler les commandes affectées → conserver les traces expurgées avec accès restreint → comparer journal et projections → identifier exposition et écritures acceptées → consulter responsable données pour les obligations de notification effectivement applicables → remédier et retester → décision explicite de réouverture.

Ne jamais effacer le journal pour masquer une erreur. Ne pas envoyer des preuves financières par canal de support non prévu. Si une clé fuit, tourner la clé et analyser son utilisation ; modifier seulement le fichier de configuration ne clôt pas l'incident.

## S2 — API indisponible ou base défaillante

Vérifier sondes, erreurs, saturation connexions, expiration certificats, quota et facture. Désactiver producteurs de tâches non essentielles si nécessaire. Afficher état indisponible et garder les brouillons ; aucune validation hors ligne. Réparer ou appliquer la reprise décrite dans le plan. Contrôler qu'une commande reçue avant panne n'est pas rejouée comme nouvelle.

## S3 — Canal externe indisponible

Préserver les opérations et notifications internes. Suspendre canal en panne, noter statut ambigu, appliquer reprise bornée et budget maximal. Recontrôler préférences et droits avant nouvel envoi. Éviter un basculement SMS automatique générant des coûts ou des messages non consentis.

## Compte rendu

Chronologie UTC ; cause démontrée ou inconnue ; périmètre ; données/écritures touchées ; actions ; décision données/juridique ; mesures RPO/RTO ; correctifs avec propriétaire et délai ; preuve de retest ; messages réellement approuvés ; date de retour d'expérience. Le template ne crée ni n'envoie de message.
