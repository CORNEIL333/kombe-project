/* KÓMBE — mode séance sans réseau (L-05).

   En séance, le réseau tombe souvent. L'appel, une déclaration de versement
   ou une confirmation du trésorier faits sans réseau sont GARDÉS SUR CE
   TÉLÉPHONE, avec leur clé d'idempotence, puis envoyés au retour du réseau.
   Rien n'est présenté comme transmis ni confirmé avant la réponse du
   serveur ; un envoi rejoué deux fois n'enregistre qu'une fois (même clé).
   Un refus du serveur (règle, droit) reste visible jusqu'à ce que la
   personne le retire : jamais d'effacement silencieux. */

export interface OperationEnAttente {
  readonly id: string;
  readonly groupId: string;
  readonly libelle: string;
  readonly methode: "POST" | "PUT";
  readonly chemin: string;
  readonly corps: unknown;
  readonly cle: string;
  readonly creeLe: number;
  readonly erreur?: string;
}

const CLE = "kombe.fileAttente";
const EVENEMENT = "kombe-file-attente";

/** Levée par l'appel quand l'opération est gardée pour plus tard. */
export class EnFileAttente extends Error {
  constructor(readonly operation: OperationEnAttente) {
    super("Pas de réseau : enregistré sur ce téléphone, envoyé au retour du réseau. Rien n'est transmis au groupe avant.");
    this.name = "EnFileAttente";
  }
}

export function lireFile(): OperationEnAttente[] {
  try {
    const brut = window.localStorage.getItem(CLE);
    const v = brut ? (JSON.parse(brut) as unknown) : [];
    return Array.isArray(v) ? (v as OperationEnAttente[]) : [];
  } catch {
    return [];
  }
}

function ecrireFile(ops: readonly OperationEnAttente[]): void {
  try {
    window.localStorage.setItem(CLE, JSON.stringify(ops));
  } catch {
    /* stockage indisponible : la file reste vide, l'erreur réseau s'affiche */
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

/** Ajoute une opération ; la même (chemin + corps) déjà en attente n'est pas doublée. */
export function mettreEnFile(op: Omit<OperationEnAttente, "id" | "creeLe">): OperationEnAttente {
  const ops = lireFile();
  const empreinte = `${op.methode} ${op.chemin} ${JSON.stringify(op.corps)}`;
  const existante = ops.find((o) => `${o.methode} ${o.chemin} ${JSON.stringify(o.corps)}` === empreinte);
  if (existante) return existante;
  const nouvelle: OperationEnAttente = { ...op, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, creeLe: Date.now() };
  ecrireFile([...ops, nouvelle]);
  return nouvelle;
}

export function retirerDeFile(id: string): void {
  ecrireFile(lireFile().filter((o) => o.id !== id));
}

export function surChangementFile(f: () => void): () => void {
  window.addEventListener(EVENEMENT, f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener(EVENEMENT, f);
    window.removeEventListener("storage", f);
  };
}

/** Erreur « pas de réseau » (et non un refus du serveur). */
export function estErreurReseau(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) return true;
  return typeof err === "string" && /timeout|abort/i.test(err);
}

/**
 * Envoie la file dans l'ordre. S'arrête au premier défaut de réseau (on
 * réessaiera) ; un refus du serveur (4xx) est noté sur l'opération et la
 * file continue ; une erreur serveur (5xx) garde l'opération telle quelle.
 */
export async function envoyerFile(
  envoyer: (op: OperationEnAttente) => Promise<void>,
  statutDe: (err: unknown) => { status: number; message: string } | null,
): Promise<{ envoyees: number; refusees: number; restantes: number }> {
  let envoyees = 0;
  let refusees = 0;
  for (const op of lireFile()) {
    if (op.erreur) continue;
    try {
      await envoyer(op);
      retirerDeFile(op.id);
      envoyees += 1;
    } catch (err) {
      if (estErreurReseau(err)) break;
      const s = statutDe(err);
      if (s && s.status >= 400 && s.status < 500) {
        ecrireFile(lireFile().map((o) => (o.id === op.id ? { ...o, erreur: s.message } : o)));
        refusees += 1;
      } else break;
    }
  }
  return { envoyees, refusees, restantes: lireFile().length };
}
