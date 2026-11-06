/* KÓMBE — centre d'aide du PWA : gestes essentiels, questions fréquentes et
   demandes au support (CRM, ADR-0046). Le centre complet vit sur le site
   (/site/aide/). Une demande reçoit une référence (accusé de réception), son
   état est suivi ici, et la réponse se note une fois la demande résolue. */

import { useState } from "react";
import type { Session, TontineSummary } from "./api.js";
import { assistance, CATEGORIES_DEMANDE, type CategorieDemande, type DemandeResume, type StatutDemande } from "./api.js";
import { useTextes, type CleTexte } from "./textes.js";
import { Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { Icone, type NomIcone } from "../composants/Icones.js";
import type { Route } from "../App.js";

const GESTES: { icone: NomIcone; titre: CleTexte; texte: CleTexte }[] = [
  { icone: "declarer", titre: "ai.g1", texte: "ai.g1t" },
  { icone: "confirmer", titre: "ai.g2", texte: "ai.g2t" },
  { icone: "cycle", titre: "ai.g3", texte: "ai.g3t" },
  { icone: "cagnotte", titre: "ai.g4", texte: "ai.g4t" },
  { icone: "hors-ligne", titre: "ai.g5", texte: "ai.g5t" },
  { icone: "bureau", titre: "ai.g6", texte: "ai.g6t" },
];
const QUESTIONS: { q: CleTexte; r: CleTexte }[] = [
  { q: "ai.q1", r: "ai.r1" },
  { q: "ai.q2", r: "ai.r2" },
  { q: "ai.q3", r: "ai.r3" },
  { q: "ai.q4", r: "ai.r4" },
  { q: "ai.q5", r: "ai.r5" },
];

const TON: Record<StatutDemande, "neutre" | "attente" | "ok" | "alerte"> = {
  nouveau: "attente",
  en_cours: "attente",
  attente_membre: "alerte",
  resolu: "ok",
  ferme: "neutre",
};

export function Aide({
  session,
  groupes,
  demande,
  aller,
}: {
  readonly session: Session;
  readonly groupes: readonly TontineSummary[];
  readonly demande: string | null;
  readonly aller: (r: Route) => void;
}) {
  const { tx } = useTextes();
  if (demande) return <FilDemande session={session} ticketId={demande} onRetour={() => aller({ ecran: "aide" })} />;
  return (
    <div className="pile ecran">
      <header className="ecran-titre">
        <span className="ecran-titre__icone" aria-hidden="true">
          <Icone nom="aide" taille={26} />
        </span>
        <div>
          <h1>{tx("pf.centreAide")}</h1>
          <p className="aide-champ">{tx("ai.intro")}</p>
        </div>
      </header>
      <MesDemandes session={session} groupes={groupes} onOuvrir={(id) => aller({ ecran: "aide", demande: id })} />
      <ul className="aide-gestes">
        {GESTES.map((g) => (
          <li key={g.titre}>
            <span className="aide-gestes__icone">
              <Icone nom={g.icone} taille={22} />
            </span>
            <strong>{tx(g.titre)}</strong>
            <span className="aide-champ">{tx(g.texte)}</span>
          </li>
        ))}
      </ul>
      <Carte titre={tx("ai.faq")}>
        <div className="aide-faq">
          {QUESTIONS.map((x) => (
            <details key={x.q}>
              <summary>
                {tx(x.q)}
                <Icone nom="chevron-bas" taille={18} />
              </summary>
              <p>{tx(x.r)}</p>
            </details>
          ))}
        </div>
      </Carte>
      <p className="actions-formulaire">
        <a className="bouton bouton-secondaire" href="/site/aide/">
          <Icone nom="monde" taille={18} />
          {tx("ai.centreComplet")}
        </a>
      </p>
    </div>
  );
}

function MesDemandes({ session, groupes, onOuvrir }: { readonly session: Session; readonly groupes: readonly TontineSummary[]; readonly onOuvrir: (id: string) => void }) {
  const { tx, dyn, instant } = useTextes();
  const { etat, recharger } = useDonnees(() => assistance.mesDemandes(session), [session.sessionId]);
  const [formulaire, setFormulaire] = useState(false);
  const action = useAction();
  return (
    <Carte
      titre={tx("sp.titre")}
      actions={
        formulaire ? null : (
          <button type="button" className="bouton bouton-compact bouton-avec-icone" onClick={() => (action.effacer(), setFormulaire(true))}>
            <Icone nom="contact" taille={18} />
            <span className="bouton-libelle">{tx("sp.nouvelle")}</span>
          </button>
        )
      }
    >
      <p className="aide-champ">{tx("ai.contactTexte")} {tx("sp.delai")}</p>
      <Retour erreur={action.erreur} succes={action.succes} />
      {formulaire ? (
        <NouvelleDemande
          groupes={groupes}
          enCours={action.enCours}
          onAnnuler={() => setFormulaire(false)}
          onEnvoyer={async (d) => {
            const r = await action.lancer(() => assistance.ouvrir(session, d));
            if (r) {
              action.signaler(tx("sp.envoyee", { ref: r.ref }));
              setFormulaire(false);
              recharger();
            }
          }}
        />
      ) : null}
      <Charge etat={etat} recharger={recharger}>
        {(liste: readonly DemandeResume[]) =>
          liste.length === 0 ? (
            <p className="aide-champ">{tx("sp.vide")}</p>
          ) : (
            <ul className="liste-demandes">
              {liste.map((d) => (
                <li key={d.ticketId}>
                  <button type="button" className="ligne-demande" onClick={() => onOuvrir(d.ticketId)}>
                    <span className="ligne-demande__textes">
                      <strong>{d.subject}</strong>
                      <span className="aide-champ">
                        {d.ref} · {dyn(`sp.cat.${d.category}`)}
                        {d.groupName ? ` · ${d.groupName}` : ""} · {instant(d.updatedAt)}
                      </span>
                    </span>
                    <Pastille ton={TON[d.status]}>{dyn(`sp.st.${d.status}`)}</Pastille>
                    <Icone nom="chevron" taille={18} />
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Charge>
    </Carte>
  );
}

function NouvelleDemande({
  groupes,
  enCours,
  onAnnuler,
  onEnvoyer,
}: {
  readonly groupes: readonly TontineSummary[];
  readonly enCours: boolean;
  readonly onAnnuler: () => void;
  readonly onEnvoyer: (d: { subject: string; category: CategorieDemande; body: string; groupId?: string }) => void;
}) {
  const { tx, dyn } = useTextes();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<CategorieDemande>("application");
  const [groupId, setGroupId] = useState("");
  const [body, setBody] = useState("");
  const valide = subject.trim().length >= 3 && body.trim().length >= 10;
  return (
    <form
      className="pile formulaire-demande"
      onSubmit={(e) => {
        e.preventDefault();
        if (valide && !enCours) onEnvoyer({ subject: subject.trim(), category, body: body.trim(), ...(groupId ? { groupId } : {}) });
      }}
    >
      <Champ id="sp-categorie" libelle={tx("sp.categorie")}>
        <select id="sp-categorie" value={category} onChange={(e) => setCategory(e.target.value as CategorieDemande)}>
          {CATEGORIES_DEMANDE.map((c) => (
            <option key={c} value={c}>
              {dyn(`sp.cat.${c}`)}
            </option>
          ))}
        </select>
      </Champ>
      {groupes.length > 0 ? (
        <Champ id="sp-groupe" libelle={tx("sp.groupe")}>
          <select id="sp-groupe" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{tx("sp.aucunGroupe")}</option>
            {groupes.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.name}
              </option>
            ))}
          </select>
        </Champ>
      ) : null}
      <Champ id="sp-objet" libelle={tx("sp.objet")}>
        <input id="sp-objet" required minLength={3} maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Champ>
      <Champ id="sp-message" libelle={tx("sp.message")} aide={tx("sp.messageAide")}>
        <textarea id="sp-message" required minLength={10} maxLength={4000} rows={5} aria-describedby="sp-message-aide" value={body} onChange={(e) => setBody(e.target.value)} />
      </Champ>
      <div className="actions-formulaire">
        <button type="submit" className="bouton" disabled={!valide || enCours} aria-busy={enCours}>
          {tx("sp.envoyer")}
        </button>
        <button type="button" className="bouton bouton-secondaire" onClick={onAnnuler}>
          {tx("sp.annuler")}
        </button>
      </div>
    </form>
  );
}

function FilDemande({ session, ticketId, onRetour }: { readonly session: Session; readonly ticketId: string; readonly onRetour: () => void }) {
  const { tx, dyn, instant } = useTextes();
  const { etat, recharger } = useDonnees(() => assistance.demande(session, ticketId), [session.sessionId, ticketId]);
  const [reponse, setReponse] = useState("");
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const action = useAction();
  return (
    <div className="pile ecran">
      <p>
        <button type="button" className="bouton bouton-secondaire bouton-compact bouton-avec-icone" onClick={onRetour}>
          <Icone nom="retour" taille={18} />
          <span className="bouton-libelle">{tx("sp.retour")}</span>
        </button>
      </p>
      <Charge etat={etat} recharger={recharger}>
        {(d) => (
          <>
            <header className="ecran-titre">
              <span className="ecran-titre__icone" aria-hidden="true">
                <Icone nom="contact" taille={26} />
              </span>
              <div>
                <h1>{d.subject}</h1>
                <p className="aide-champ">
                  {tx("sp.ref", { ref: d.ref })} · {dyn(`sp.cat.${d.category}`)} · <Pastille ton={TON[d.status]}>{dyn(`sp.st.${d.status}`)}</Pastille>
                </p>
              </div>
            </header>
            <ol className="fil-demande" aria-label={tx("sp.titre")}>
              {d.messages.map((m) => (
                <li key={m.messageId} className={`fil-demande__message fil-demande__message--${m.from}`}>
                  <span className="fil-demande__auteur">
                    {m.from === "moi" ? tx("sp.moi") : tx("sp.support")} · <time dateTime={m.createdAt}>{instant(m.createdAt)}</time>
                  </span>
                  <p>{m.body}</p>
                </li>
              ))}
            </ol>
            <Retour erreur={action.erreur} succes={action.succes} />
            {d.status === "ferme" ? (
              <p className="aide-champ">{tx("sp.close")}</p>
            ) : (
              <form
                className="pile"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!reponse.trim()) return;
                  const r = await action.lancer(() => assistance.repondre(session, ticketId, reponse.trim()), tx("sp.reponseEnvoyee"));
                  if (r) {
                    setReponse("");
                    recharger();
                  }
                }}
              >
                <Champ id="sp-reponse" libelle={tx("sp.repondre")}>
                  <textarea id="sp-reponse" rows={3} maxLength={4000} value={reponse} onChange={(e) => setReponse(e.target.value)} />
                </Champ>
                <div className="actions-formulaire">
                  <button type="submit" className="bouton" disabled={!reponse.trim() || action.enCours}>
                    {tx("sp.envoyer")}
                  </button>
                </div>
              </form>
            )}
            {(d.status === "resolu" || d.status === "ferme") && d.satisfaction === null ? (
              <Carte titre={tx("sp.noter")}>
                <form
                  className="pile"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (note < 1) return;
                    const r = await action.lancer(() => assistance.noter(session, ticketId, note, commentaire.trim() || undefined), tx("sp.merci"));
                    if (r) recharger();
                  }}
                >
                  <fieldset className="notation">
                    <legend className="visuellement-cache">{tx("sp.noter")}</legend>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className={`notation__choix${note === n ? " notation__choix--actif" : ""}`}>
                        <input type="radio" name="sp-note" value={n} checked={note === n} onChange={() => setNote(n)} />
                        <span aria-hidden="true">{n}</span>
                        <span className="visuellement-cache">{tx("sp.note", { n })}</span>
                      </label>
                    ))}
                  </fieldset>
                  <Champ id="sp-commentaire" libelle={tx("sp.commentaire")}>
                    <input id="sp-commentaire" maxLength={500} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
                  </Champ>
                  <div className="actions-formulaire">
                    <button type="submit" className="bouton" disabled={note < 1 || action.enCours}>
                      {tx("sp.envoyer")}
                    </button>
                  </div>
                </form>
              </Carte>
            ) : d.satisfaction !== null ? (
              <p className="aide-champ">{tx("sp.noteDonnee", { n: d.satisfaction })}</p>
            ) : null}
          </>
        )}
      </Charge>
    </div>
  );
}
