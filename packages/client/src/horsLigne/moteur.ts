/* KÓMBE C15 — moteur hors-ligne (client pur, sans backend). Il formalise la
   « lecture prudente et brouillons SANS créer de fausse validation » (12.2, 18.7) :

   - Un BROUILLON (`brouillon`/`en_attente`) reste TOUJOURS distinct d'une COMMANDE
     ACCEPTÉE : `statutServeurValide()` n'est vrai que si le SERVEUR a acquitté
     (`acceptee`). Une soumission hors-ligne ne vaut donc jamais validation
     (C15-OFFLINE : `server_validated = false`).
   - Le CACHE de lecture est scopé par compte/groupe/période,_ttl_ et assaini :
     aucun secret d'auth, aucun commentaire de litige, aucune référence complète
     n'y transitent par défaut. Mode appareil partagé = AUCUNE conservation.
   - La file est scopée par identité ; `deconnecter()` purge cette portée, donc
     B ne voit jamais les données A sur le même appareil (C15-LOGOUT).
   - Au retour réseau, `synchroniser()` RE-SOUMET chaque commande en attente avec
     sa MÊME clé d'idempotence persistée (jamais de nouvelle clé), et le SERVEUR
     (autorité injectée) re-contrôle droits/versions À CE MOMENT-LÀ : un rôle
     révoqué pendant la coupure ⇒ refus ⇒ `mutation_accepted = false`
     (C15-RECONNECT). L'horloge SERVEUR fait foi ; l'horloge client ne prolonge
     jamais un droit.

   La frontière serveur (`Transport`) et le dépôt (`Depot`) sont INJECTÉS : le
   MÉCANISME client est prouvé ici en pur ; la soudure réelle vers l'API/PG (C02/
   C03/C05, idempotence serveur, RLS) est déclarée hors périmètre (voir preuves). */

export type Connexivite = "en_ligne" | "hors_ligne";

export type StatutCommande =
  | "brouillon"
  | "en_attente"
  | "acceptee"
  | "refusee"
  | "conflit";

/** Seul un acquittement serveur rend une commande « validée ». */
export function statutServeurValide(statut: StatutCommande): boolean {
  return statut === "acceptee";
}

export interface Portee {
  readonly identiteId: string;
  readonly groupId: string;
}

function clePortee(p: Portee): string {
  return `${p.identiteId}::${p.groupId}`;
}

export interface CommandeLocale {
  readonly id: string; // clé d'idempotence, persistée jusqu'à certitude
  readonly portee: Portee;
  readonly kind: string; // declaration_contribution | validation | vote | role | regle …
  readonly montant: string; // XAF entier en chaîne, jamais de flottant (ADR-0002)
  /** Types exigeant impérieusement le serveur (jamais validés en local). */
  readonly statut: StatutCommande;
  readonly creeLe: number; // horloge CLIENT, affichage seulement
}

export interface DecisionServeur {
  readonly accepte: boolean;
  readonly horodatageServeur: number; // autorité d'horloge = serveur
  readonly code?: string | undefined; // AUTORITE_REVOQUEE | CONFLIT_VERSION | …
  readonly version?: number | undefined;
}

/** Frontière serveur injectée (stub dans les tests ; API réelle en production). */
export interface Transport {
  envoyer(commande: CommandeLocale): Promise<DecisionServeur>;
}

/** Dépôt de persistance injecté (mémoire ici ; IndexedDB/caches en production). */
export interface Depot {
  lire<T>(cle: string): T | undefined;
  ecrire<T>(cle: string, valeur: T): void;
  supprimer(cle: string): void;
  supprimerPortee(prefixIdentite: string): void;
}

const CLES_INTERDITES_EN_CACHE: readonly string[] = [
  "token",
  "jeton",
  "secret",
  "authorization",
  "motdepasse",
  "password",
  "commentaire",
  "comment",
  "reference",
  "iban",
  "litige",
];

/** Retire structurellement tout champ sensible interdit en cache par défaut. */
export function assainirPourCache(
  donnees: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const propre: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(donnees)) {
    const min = cle.toLowerCase();
    if (CLES_INTERDITES_EN_CACHE.some((interdit) => min.includes(interdit))) {
      continue;
    }
    propre[cle] = valeur;
  }
  return propre;
}

export interface EntreeCache {
  readonly cle: string;
  readonly donnees: Record<string, unknown>;
  readonly syncLe: number;
  readonly expireLe: number;
}

const REGLE_MONTANT_ENTIER = /^\d+$/;

export interface OptionsMoteur {
  readonly transport: Transport;
  readonly depot: Depot;
  readonly ttlSecondes: number; // durée de conservation du cache (bornée)
  readonly modePartage?: boolean | undefined; // appareil partagé : aucune conservation
  readonly horloge?: () => number; // horloge CLIENT (affichage), jamais autorité d'expiration
}

export interface ResultatSoumission {
  readonly statut: StatutCommande;
  readonly serverValide: boolean;
}

export class MoteurHorsLigne {
  private readonly transport: Transport;
  private readonly depot: Depot;
  private readonly ttl: number;
  private readonly modePartage: boolean;
  private readonly horloge: () => number;
  private connexivite: Connexivite = "en_ligne";

  constructor(options: OptionsMoteur) {
    this.transport = options.transport;
    this.depot = options.depot;
    this.ttl = options.ttlSecondes;
    this.modePartage = options.modePartage ?? false;
    this.horloge = options.horloge ?? (() => Math.floor(Date.now() / 1000));
  }

  private enClé(kind: "q" | "c" | "s", portee: Portee): string {
    return `${kind}:${clePortee(portee)}`;
  }

  private lireFile(portee: Portee): CommandeLocale[] {
    return this.depot.lire<CommandeLocale[]>(this.enClé("q", portee)) ?? [];
  }

  private ecrireFile(portee: Portee, file: CommandeLocale[]): void {
    if (this.modePartage) return; // aucune conservation sur appareil partagé
    this.depot.ecrire(this.enClé("q", portee), file);
  }

  estHorsLigne(): boolean {
    return this.connexivite === "hors_ligne";
  }

  passerHorsLigne(): void {
    this.connexivite = "hors_ligne";
  }

  revenirEnLigne(): void {
    this.connexivite = "en_ligne";
  }

  /** Un brouillon est créé LOCAL, jamais validé par le serveur. */
  creerBrouillon(
    portee: Portee,
    kind: string,
    montant: string,
  ): CommandeLocale {
    if (!REGLE_MONTANT_ENTIER.test(montant)) {
      throw new Error("MONTANT_NON_ENTIER");
    }
    const commande: CommandeLocale = {
      id: `${clePortee(portee)}:${this.horloge()}:${this.lireFile(portee).length}`,
      portee,
      kind,
      montant,
      statut: "brouillon",
      creeLe: this.horloge(),
    };
    const file = this.lireFile(portee);
    this.ecrireFile(portee, [...file, commande]);
    return commande;
  }

  /** Demande de confirmation. Hors-ligne ⇒ mise en attente, JAMAIS server_validée
   * (C15-OFFLINE). En ligne ⇒ transmission immédiate. La commande passée est la
   * source de vérité (clé d'idempotence, portée, montant) ; on ne met à jour la
   * copie stockée que si elle existe (en mode partagé, rien n'est persisté). */
  async soumettre(commande: CommandeLocale): Promise<ResultatSoumission> {
    if (this.estHorsLigne()) {
      const file = this.lireFile(commande.portee);
      const idx = file.findIndex((c) => c.id === commande.id);
      if (idx >= 0) {
        const copie = [...file];
        copie[idx] = { ...commande, statut: "en_attente" };
        this.ecrireFile(commande.portee, copie);
      }
      return { statut: "en_attente", serverValide: false };
    }

    return await this.envoyerEtAppliquer(commande);
  }

  private async envoyerEtAppliquer(
    commande: CommandeLocale,
  ): Promise<ResultatSoumission> {
    const decision = await this.transport.envoyer(commande);
    const copie = this.lireFile(commande.portee);
    const idx = copie.findIndex((c) => c.id === commande.id);
    let nouveau: StatutCommande;
    if (decision.accepte) {
      nouveau = "acceptee";
      this.marquerSync(commande.portee, decision.horodatageServeur);
    } else if (decision.code === "CONFLIT_VERSION") {
      nouveau = "conflit"; // 409 ⇒ rechargement + confirmation humaine
    } else {
      nouveau = "refusee"; // autorité révoquée, montant refusé, etc.
    }
    if (idx >= 0) {
      const mise: CommandeLocale = { ...copie[idx] as CommandeLocale, statut: nouveau };
      copie[idx] = mise;
      this.ecrireFile(commande.portee, copie);
    }
    return { statut: nouveau, serverValide: statutServeurValide(nouveau) };
  }

  /** Au retour réseau : re-soumet chaque commande `en_attente` avec sa MÊME clé
   * d'idempotence, en laissant le serveur re-trancher droits/versions. */
  async synchroniser(portee: Portee): Promise<ResultatSoumission[]> {
    const résultats: ResultatSoumission[] = [];
    const attente = this.lireFile(portee).filter(
      (c) => c.statut === "en_attente" || c.statut === "brouillon",
    );
    for (const commande of attente) {
      // Idempotence : même id réémis jusqu'à certitude ; le serveur déduplique.
      résultats.push(await this.envoyerEtAppliquer(commande));
    }
    return résultats;
  }

  private marquerSync(portee: Portee, serveurNow: number): void {
    if (this.modePartage) return;
    this.depot.ecrire(this.enClé("s", portee), { derniereSync: serveurNow });
  }

  derniereSync(portee: Portee): number | undefined {
    return this.depot
      .lire<{ derniereSync: number }>(this.enClé("s", portee))
      ?.derniereSync;
  }

  /** Écrit en cache une LECTURE assainie,_ttl_ (aucune donnée sensible). */
  ecrireCache(
    portee: Portee,
    cle: string,
    donnees: Readonly<Record<string, unknown>>,
    serveurNow: number,
  ): void {
    if (this.modePartage) return; // appareil partagé : rien n'est conservé
    const entree: EntreeCache = {
      cle,
      donnees: assainirPourCache(donnees),
      syncLe: serveurNow,
      expireLe: serveurNow + this.ttl,
    };
    const sac = this.depot.lire<Record<string, EntreeCache>>(
      this.enClé("c", portee),
    ) ?? {};
    this.depot.ecrire(this.enClé("c", portee), { ...sac, [cle]: entree });
  }

  /** Lecture du cache : expiré ⇒ null ; l'expiration est jugée par le SERVEUR
   * (`serveurNow`), jamais par l'horloge client. */
  lireCache(
    portee: Portee,
    cle: string,
    serveurNow: number,
  ): EntreeCache | null {
    const sac = this.depot.lire<Record<string, EntreeCache>>(
      this.enClé("c", portee),
    );
    const entree = sac?.[cle];
    if (entree === undefined) return null;
    if (serveurNow >= entree.expireLe) {
      // Éviction gérée : on purge l'entrée périmée.
      if (sac) {
        const restante = { ...sac };
        delete restante[cle];
        this.depot.ecrire(this.enClé("c", portee), restante);
      }
      return null;
    }
    return entree;
  }

  commandes(portee: Portee): CommandeLocale[] {
    return this.lireFile(portee);
  }

  /** Déconnexion : purge TOUTE la portée de cette identité (cache, file, sync).
   * Un autre compte sur le même appareil ne voit donc RIEN (C15-LOGOUT). */
  deconnecter(identiteId: string): void {
    this.depot.supprimerPortee(identiteId);
  }
}
