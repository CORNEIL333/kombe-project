# Zones noires et grises de KÓMBE

La construction à zéro est actée. Les inconnues d’un ancien dépôt ne sont plus un motif de blocage ; l’absence de preuve du nouveau logiciel reste normale mais doit être traitée avant G0. Une zone noire est une information ou une preuve essentielle absente. Une zone grise est une règle ambiguë ou un arbitrage ouvert.

## Zones noires

| ID | Zone | Manque | Responsable proposé | Preuve de fermeture | Référence |
|---|---|---|---|---|---|
| ZN01 | Règles critiques non adoptées | Amorçage, corrections décaissement/frais, perte de données acceptable. | Produit | ADR et exemples chiffrés acceptés | A02 A03 A09 |
| ZN02 | Fiabilité du futur registre | Aucun résultat applicatif réel ; concurrence et atomicité à construire. | Backend/QA | Transactions réelles éprouvées ; absence de doublons | A04 A10 |
| ZN03 | Isolation et privilèges | Aucune configuration applicative, rôle DB ou restriction agent existante. | Sécurité | Tests groupes A/B, jobs, exports et contexte de pool | A06 A13 |
| ZN04 | Responsabilités des données | Éditeur, prestataires, régions, bases et durées non finalisés. | Direction/données | Registre et contrats renseignés, validation adaptée | A08 |
| ZN05 | Reprise opérationnelle | Aucune restauration du logiciel neuf démontrée. | Exploitation | Restauration chronométrée et rapprochement | A09 |
| ZN06 | Équipe et accès réels | Responsables, suppléants, identités de revue et séparation technique à nommer. | Direction | Rôles nominatifs et permissions effectives | A10 A14 |
| ZN07 | Viabilité commerciale | Prix et conversions hypothétiques ; coût IA/support non mesuré. | Produit/finance | Pilote payant et coûts nets constatés | A16 |
| ZN08 | Usage terrain | Pas de recette actuelle sur téléphones et connexions ciblés. | UX/terrain | Essais utilisateurs, accessibilité, réseau dégradé | A12 A17 |

## Zones grises

Toutes les décisions ci-dessous sont proposées, sauf périmètre déjà explicitement adopté dans un ADR.

| ID | Zone | Arbitrage à formaliser | Audit | Lots |
|---|---|---|---|---|
| ZG01 | Registre ou paiement | Pot externe au pilote ; abonnement séparé. | A18 | C00 C19 C25 |
| ZG02 | Sens de paiement validé | Identifier déclarant/confirmateur ; ne pas promettre une preuve bancaire. | A03 | C06 C07 |
| ZG03 | Premiers rôles | Phase configuration, acceptation des fonctions puis activation. | A02 | C03 |
| ZG04 | Correction et remboursement | Contre-écriture traçable ; le remboursement externe est un autre fait. | A03 A04 | C07 C08 |
| ZG05 | Pouvoir du support | Règle unique des approbateurs, durée, lecture et interdictions. | A14 | C17 |
| ZG06 | Droits après départ | Matrice objet/champ/période ; contrôle à la génération et au téléchargement. | A13 | C12 |
| ZG07 | Offline et téléphone partagé | TTL, effacement, changement de compte et limites de révocation hors ligne. | A12 | C15 |
| ZG08 | RPO 24 h ou 1 h | Chiffrer puis faire adopter le niveau de perte toléré et son rapprochement. | A09 | C29 |
| ZG09 | Pénalités | Blocage serveur au pilote ; introduction par nouvelle décision métier. | A21 | C04 |
| ZG10 | Promesse du journal | Distinguer intégrité, origine et réalité du versement externe. | A05 A20 | C11 |
| ZG11 | Périmètre de lancement | Extensions IA/paiement futures restent fermées ; gates distinctes. | A17 A18 | C22 C23 C25 |
| ZG12 | Fin abonnement | Historique autorisé, réclamation et export de base à maintenir selon règle adoptée. | COM15 | C19 |

## Ordre de fermeture

Fermer d’abord le sens des statuts et les responsabilités ; ensuite les corrections, validations et droits ; puis démontrer concurrence, isolation et reprise. Mesurer l’usage et l’économie après ouverture contrôlée. Un test valide une règle adoptée, pas la légitimité d’un arbitrage inventé par l’agent.
