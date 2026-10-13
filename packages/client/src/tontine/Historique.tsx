/* KÓMBE — reprise de l'historique (L-20) : page du cahier de la tontine
   (« nom ; date ; montant ») ou export de l'ancienne application. Les lignes
   reprises restent À PART : elles n'entrent dans aucun total, aucune
   échéance, aucune remise. Réimporter la même page ne double rien. */

import { useState } from "react";
import { historique, type HistoryImportResult } from "./api.js";
import { peut } from "./droits.js";
import { Carte, Champ, Charge, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

export interface LigneCahier {
  readonly memberName: string;
  readonly date: string;
  readonly amount: number;
}

/**
 * Lit les lignes collées depuis un tableur ou recopiées du cahier :
 * séparateur « ; », tabulation ou virgule ; date AAAA-MM-JJ ou JJ/MM/AAAA ;
 * montant en FCFA avec ou sans espaces (« 5 000 »). Une ligne illisible est
 * renvoyée telle quelle dans `erreurs` (jamais devinée).
 */
export function lireCahier(texte: string): { lignes: LigneCahier[]; erreurs: string[] } {
  const lignes: LigneCahier[] = [];
  const erreurs: string[] = [];
  for (const brut of texte.split(/\r?\n/)) {
    const l = brut.trim();
    if (!l || /^nom\s*[;,\t]/i.test(l)) continue;
    const cols = l.split(/\s*[;\t]\s*/).length >= 3 ? l.split(/\s*[;\t]\s*/) : l.split(/\s*,\s*/);
    const [nom, d, mt] = cols;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "")
      ? (d as string)
      : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(d ?? "")
        ? (d as string).replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_x, j: string, mo: string, a: string) => `${a}-${mo.padStart(2, "0")}-${j.padStart(2, "0")}`)
        : null;
    const chiffres = (mt ?? "").replace(/[\s .]/g, "").replace(/f?cfa$/i, "");
    if (!nom || !date || !/^\d{1,10}$/.test(chiffres)) {
      erreurs.push(l);
      continue;
    }
    lignes.push({ memberName: nom, date, amount: Number(chiffres) });
  }
  return { lignes, erreurs };
}

export function Historique({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, xaf, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => historique.resume(ctx.session, gid), [gid]);
  const action = useAction();
  const [texte, setTexte] = useState("");
  const [libelle, setLibelle] = useState("");
  const [resultat, setResultat] = useState<HistoryImportResult | null>(null);
  const lu = lireCahier(texte);
  const peutImporter = peut(ctx.roles, "import.history");

  const importer = async (corps: Parameters<typeof historique.importer>[2]) => {
    const r = await action.lancer(() => historique.importer(ctx.session, gid, corps));
    if (r) {
      setResultat(r);
      setTexte("");
      recharger();
    }
  };

  const fichier = async (f: File | undefined) => {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text()) as { njangis?: unknown[] } & Record<string, unknown>;
      const njangi = Array.isArray(json.njangis) ? json.njangis[0] : json;
      await importer({ source: "kombe_v1", njangi: njangi as never });
    } catch {
      setResultat(null);
      void action.lancer(() => Promise.reject(new Error(tx("hi.fichierIllisible"))));
    }
  };

  return (
    <Carte titre={tx("hi.titre")}>
      <p className="aide-champ">{tx("hi.aide")}</p>
      <Charge etat={etat} recharger={recharger}>
        {(h) =>
          h.perMember.length === 0 ? (
            <p>{tx("app.vide")}</p>
          ) : (
            <div className="pile">
              <ul className="liste">
                {h.perMember.map((p) => (
                  <li key={`${p.membershipId ?? ""}-${p.memberName}`} className="liste__ligne">
                    <div>
                      <strong>{p.memberName}</strong>
                      <span className="aide-champ">
                        {tx("hi.ligne", { n: String(p.count), debut: date(p.firstDate), fin: date(p.lastDate) })}
                        {p.membershipId ? "" : ` · ${tx("hi.nonRetrouve")}`}
                      </span>
                    </div>
                    <strong>{xaf(p.total)}</strong>
                  </li>
                ))}
              </ul>
              <p className="aide-champ">{tx("hi.total", { total: xaf(h.total) })}</p>
            </div>
          )
        }
      </Charge>
      {peutImporter ? (
        <div className="formulaire-encart pile">
          <Retour erreur={action.erreur} succes={action.succes} />
          <Champ id="hi-libelle" libelle={tx("hi.libelle")}>
            <input id="hi-libelle" value={libelle} maxLength={80} placeholder="Cahier 2025" onChange={(e) => setLibelle(e.target.value)} />
          </Champ>
          <Champ id="hi-texte" libelle={tx("hi.coller")} aide={tx("hi.format")}>
            <textarea id="hi-texte" rows={6} value={texte} onChange={(e) => setTexte(e.target.value)} />
          </Champ>
          {texte.trim() ? (
            <p className="aide-champ">
              {tx("hi.apercu", { ok: String(lu.lignes.length), total: xaf(String(lu.lignes.reduce((s, l) => s + l.amount, 0))), ko: String(lu.erreurs.length) })}
            </p>
          ) : null}
          <div className="actions-formulaire">
            <label className="bouton bouton-secondaire">
              {tx("hi.fichier")}
              <input type="file" accept="application/json,.json" hidden onChange={(e) => void fichier(e.target.files?.[0])} />
            </label>
            <button
              type="button"
              className="bouton"
              disabled={action.enCours || lu.lignes.length === 0}
              onClick={() => void importer({ source: "cahier", rows: lu.lignes, ...(libelle.trim() ? { label: libelle.trim() } : {}) })}
            >
              {tx("hi.importer")}
            </button>
          </div>
          {resultat ? (
            <div className="msg msg--succes" role="status">
              {tx("hi.resultat", { ok: String(resultat.acceptedContributions), deja: String(resultat.alreadyImported), ko: String(resultat.rejected.length), total: xaf(resultat.total) })}
              {resultat.unmatchedMembers.length ? <p>{tx("hi.inconnus", { noms: resultat.unmatchedMembers.join(", ") })}</p> : null}
              {resultat.rejected.length ? (
                <ul>
                  {resultat.rejected.slice(0, 20).map((r) => (
                    <li key={r.legacyId}>{r.reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Carte>
  );
}
