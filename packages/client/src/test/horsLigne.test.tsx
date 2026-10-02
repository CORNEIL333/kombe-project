/* KÓMBE C15 — tests du moteur hors-ligne. Les scénarios de recette C15-OFFLINE,
   C15-LOGOUT et C15-RECONNECT sont éprouvés par des actions RÉELLES du mécanisme
   client (aucune attente lue depuis un fichier : le serveur est une frontière
   injectée qui re-tranche). Le montant reste une chaîne XAF entière. */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MoteurHorsLigne,
  statutServeurValide,
  assainirPourCache,
  type Portee,
  type Transport,
  type CommandeLocale,
  type DecisionServeur,
} from "../horsLigne/moteur.js";
import { DepotMemoire } from "../horsLigne/depots.js";
import { BandeauHorsLigne } from "../horsLigne/BandeauHorsLigne.js";
import { FournisseurLangue } from "../i18n/ContexteLangue.js";

const NOW = 1_757_904_000; // 2026-09-15T10:00:00Z, en secondes

class TransportStub implements Transport {
  horsService = false;
  readonly revoquees = new Set<string>();
  readonly appliquates = new Set<string>();
  readonly nbEnvoisParId = new Map<string, number>();
  constructor(public serveurNow: number) {}

  async envoyer(c: CommandeLocale): Promise<DecisionServeur> {
    this.nbEnvoisParId.set(c.id, (this.nbEnvoisParId.get(c.id) ?? 0) + 1);
    if (this.horsService) {
      this.horsService = false; // échec réseau transitoire, la clé reste en attente
      throw new Error("RESEAU_INDISPONIBLE");
    }
    // Autorité SERVEUR re-contrôlée au moment de l'envoi (pas au créne client).
    if (this.revoquees.has(c.portee.identiteId)) {
      return { accepte: false, code: "AUTORITE_REVOQUEE", horodatageServeur: this.serveurNow };
    }
    // Idempotence : une clé déjà appliquée n'est jamais appliquée deux fois.
    this.appliquates.add(c.id);
    return { accepte: true, horodatageServeur: this.serveurNow };
  }
}

function moteurNeuf(opts?: {
  modePartage?: boolean;
  transport?: TransportStub;
}): { moteur: MoteurHorsLigne; depot: DepotMemoire; transport: TransportStub } {
  const depot = new DepotMemoire();
  const transport = opts?.transport ?? new TransportStub(NOW);
  const moteur = new MoteurHorsLigne({
    transport,
    depot,
    ttlSecondes: 60,
    modePartage: opts?.modePartage ?? false,
    horloge: () => NOW,
  });
  return { moteur, depot, transport };
}

const porteeA: Portee = { identiteId: "A", groupId: "gA" };

describe("C15-OFFLINE — une soumission hors-ligne n'est jamais server_validée", () => {
  it("brouillon -> mise en attente, serverValide=false, statut != acceptee", async () => {
    const { moteur } = moteurNeuf();
    const brouillon = moteur.creerBrouillon(porteeA, "declaration_contribution", "5000");
    expect(brouillon.statut).toBe("brouillon");

    moteur.passerHorsLigne();
    const res = await moteur.soumettre(brouillon);

    expect(res.serverValide).toBe(false); // observation exigée
    expect(res.statut).toBe("en_attente");
    expect(statutServeurValide(res.statut)).toBe(false);
    // En attente ≠ validé : jamais présenté comme accepté par le serveur.
    expect(moteur.commandes(porteeA)[0]?.statut).toBe("en_attente");
  });

  it("un montant non entier est rejeté à la création", () => {
    const { moteur } = moteurNeuf();
    expect(() => moteur.creerBrouillon(porteeA, "declaration", "5000.50")).toThrow();
    expect(() => moteur.creerBrouillon(porteeA, "declaration", "-100")).toThrow();
  });
});

describe("C15-LOGOUT — purge scopée : B ne voit pas les données de A", () => {
  it("déconnexion de A retire sa portée ; un autre compte ne lit rien", async () => {
    const { moteur, depot } = moteurNeuf();
    await moteur.soumettre(moteur.creerBrouillon(porteeA, "declaration", "5000"));
    moteur.ecrireCache(porteeA, "resume", { nom: "Groupe A" }, NOW);
    expect(moteur.commandes(porteeA).length).toBe(1);

    moteur.deconnecter("A");

    // Après purge, plus AUCUNE donnée de A ne subsiste sur l'appareil.
    expect(moteur.commandes(porteeA)).toHaveLength(0);
    expect(moteur.lireCache(porteeA, "resume", NOW)).toBeNull();
    // Aucun résidu de portée A dans le dépôt (préfixe des clés scopées).
    for (const cle of ["q:A::gA", "c:A::gA", "s:A::gA"]) {
      expect(depot.contient(cle)).toBe(false);
    }
    // B, sur le même appareil, ne voit rien de A (clés scopées distinctes).
    const porteeB: Portee = { identiteId: "B", groupId: "gB" };
    expect(moteur.commandes(porteeB)).toHaveLength(0);
  });

  it("mode appareil partagé : rien n'est conservé dès le départ", async () => {
    const { moteur } = moteurNeuf({ modePartage: true });
    const b = moteur.creerBrouillon(porteeA, "declaration", "5000");
    moteur.passerHorsLigne();
    await moteur.soumettre(b);
    moteur.ecrireCache(porteeA, "resume", { nom: "Groupe A" }, NOW);
    // Aucune persistance => ni file ni cache ne sont relus.
    expect(moteur.commandes(porteeA)).toHaveLength(0);
    expect(moteur.lireCache(porteeA, "resume", NOW)).toBeNull();
  });
});

describe("C15-RECONNECT — autorité re-contrôlée au retour ; horloge client ne prolonge rien", () => {
  it("rôle révoqué pendant la coupure => mutation refusée au retour", async () => {
    const transport = new TransportStub(NOW);
    const { moteur } = moteurNeuf({ transport });
    const b = moteur.creerBrouillon(porteeA, "validation", "5000");
    moteur.passerHorsLigne();
    const horsLigneRes = await moteur.soumettre(b);
    expect(horsLigneRes.serverValide).toBe(false);

    // Révocation Serveur pendant la coupure.
    transport.revoquees.add("A");
    moteur.revenirEnLigne();
    const res = await moteur.synchroniser(porteeA);

    expect(res.some((r) => r.statut === "refusee")).toBe(true);
    expect(res.every((r) => r.serverValide === false)).toBe(true); // mutation_accepted=false
    expect(moteur.commandes(porteeA)[0]?.statut).toBe("refusee");
  });

  it("idempotence : échec réseau transitoire puis succès, même clé, appliquée une fois", async () => {
    const transport = new TransportStub(NOW);
    const { moteur } = moteurNeuf({ transport });
    const b = moteur.creerBrouillon(porteeA, "declaration", "5000");
    moteur.passerHorsLigne();
    await moteur.soumettre(b);
    moteur.revenirEnLigne();

    transport.horsService = true; // première tentative : réseau coupé
    const premiere = await moteur.synchroniser(porteeA).catch(() => null);
    expect(premiere).toBeNull(); // échec propagé, commande reste en attente
    expect(moteur.commandes(porteeA)[0]?.statut).toBe("en_attente");

    const seconde = await moteur.synchroniser(porteeA);
    expect(seconde[0]?.serverValide).toBe(true);
    expect(moteur.commandes(porteeA)[0]?.statut).toBe("acceptee");
    // La MÊME clé d'idempotence a été réémise, et le serveur ne l'applique qu'une fois.
    expect(transport.nbEnvoisParId.get(b.id)).toBe(2);
    expect(transport.appliquates.has(b.id)).toBe(true);
    expect(transport.appliquates.size).toBe(1);
  });

  it("expiration du cache jugée par l'horodatage SERVEUR, TTL borné", () => {
    const { moteur } = moteurNeuf();
    moteur.ecrireCache(porteeA, "resume", { nom: "Groupe A" }, NOW);
    // Avant expiration : présent.
    expect(moteur.lireCache(porteeA, "resume", NOW + 30)).not.toBeNull();
    // Après expiration (ttl=60), jugée sur serveurNow : évicté, même si l'horloge
    // client dirait encore « frais ».
    expect(moteur.lireCache(porteeA, "resume", NOW + 61)).toBeNull();
  });
});

describe("Assainissement du cache — aucun secret/commentaire de litige par défaut", () => {
  it("retire structurellement les champs sensibles", () => {
    const propre = assainirPourCache({
      nom: "Groupe",
      tokenAcces: "SECRET",
      commentaire: "litige en cours",
      referenceComplete: "REF-0000",
      montant: "5000",
    });
    expect(propre).toEqual({ nom: "Groupe", montant: "5000" });
  });
});

describe("BandeauHorsLigne — UX d'état accessible, sans fausse validation", () => {
  const monter = (horsLigne: boolean, attente: number) =>
    render(
      <FournisseurLangue langueInitiale="fr">
        <BandeauHorsLigne
          etat={{ horsLigne, derniereSync: NOW, brouillonsEnAttente: attente }}
        />
      </FournisseurLangue>,
    );

  it("hors-ligne : annonce le badge, le compte de brouillons, et nie la validation", () => {
    monter(true, 2);
    const statut = screen.getByRole("status");
    expect(statut.textContent).toMatch(/Hors ligne/i);
    expect(statut.textContent).toMatch(/2 brouillon\(s\) en attente/i);
    expect(statut.textContent).toMatch(/jamais considéré validé/i);
    // Ne revendique JAMAIS une validation serveur positive (brouillon ≠ accepté).
    expect(statut.textContent).not.toMatch(/validé par le serveur/i);
  });

  it("en ligne : affiche la dernière synchronisation, sans parler de brouillons", () => {
    monter(false, 0);
    const statut = screen.getByRole("status");
    expect(statut.textContent).toMatch(/Dernière synchronisation/i);
    expect(screen.queryByText(/brouillon/i)).toBeNull();
  });
});
