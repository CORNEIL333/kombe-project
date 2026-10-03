# Baseline sécurité & accessibilité

## Sécurité

Le code est structuré pour une revue selon OWASP MASVS :

- **STORAGE** : pas de données métier embarquées ; brouillons séparés ; secrets dans secure storage seulement ;
- **AUTH** : PIN non persisté ; biométrie déléguée au système ; autorité serveur ;
- **NETWORK** : adapter distant absent tant que TLS, erreurs et politique réseau ne sont pas raccordés ;
- **PLATFORM** : file picker natif et biométrie via plugins plateforme ;
- **CODE** : analyse statique stricte ; dépendances explicites ; pas de secrets codés en dur ;
- **PRIVACY** : minimisation, pas de seed, pas de canal support réel codé en dur ;
- **RESILIENCE** : à compléter au lot de release avec attestation/intégrité selon la menace retenue.

## Accessibilité

Cible : WCAG 2.2 A/AA applicable aux applications mobiles, avec la guidance W3C WCAG2Mobile.

Déjà pris en compte dans le code :

- Material semantics et labels sur actions critiques ;
- cibles tactiles ≥ 48 dp dans le design system ;
- contraste vert profond / crème / texte foncé ;
- statuts accompagnés de texte et non de couleur seule ;
- listes scrollables et écrans sans hauteur de texte fixe ;
- langue FR/EN ;
- boutons et champs libellés ;
- états loading/empty/error/unavailable explicites.

À valider sur appareils réels :

- TalkBack Android ;
- VoiceOver iOS ;
- taille de texte système maximale ;
- orientation et reflow ;
- contraste calculé ;
- navigation avec clavier externe lorsque pertinente ;
- focus et annonces des erreurs formulaire.
