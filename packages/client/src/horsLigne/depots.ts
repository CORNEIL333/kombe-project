/* KÓMBE C15 — dépôt en mémoire (implémentation de test/local du `Depot` injecté).
   En production, ce rôle est tenu par IndexedDB / le cache du service worker ; ici
   il suffit à prouver la SÉMANTIQUE (scopage par identité, purge au logout, TTL).
   `supprimerPortee` retire toutes les clés `q:`/`c:`/`s:` d'une identité, ce qui
   matérialise la purge « appareil partagé / déconnexion » (C15-LOGOUT). */

import type { Depot } from "./moteur.js";

export class DepotMemoire implements Depot {
  private readonly table = new Map<string, unknown>();

  lire<T>(cle: string): T | undefined {
    return this.table.get(cle) as T | undefined;
  }

  ecrire<T>(cle: string, valeur: T): void {
    this.table.set(cle, valeur);
  }

  supprimer(cle: string): void {
    this.table.delete(cle);
  }

  /** Purge tout ce qui appartient à une identité (`{q|c|s}:identiteId::…`). */
  supprimerPortee(identiteId: string): void {
    const marqueur = `::`;
    const prefixe = `${identiteId}${marqueur}`;
    for (const cle of [...this.table.keys()]) {
      const deuxPoint = cle.indexOf(":");
      const portee = cle.slice(deuxPoint + 1); // après le `q:`/`c:`/`s:`
      if (portee.startsWith(prefixe)) {
        this.table.delete(cle);
      }
    }
  }

  /** Introspection de test : une clé appartient-elle encore au dépôt ? */
  contient(cle: string): boolean {
    return this.table.has(cle);
  }

  taille(): number {
    return this.table.size;
  }
}
