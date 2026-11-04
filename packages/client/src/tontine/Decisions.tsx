/* KÓMBE — décisions votées de l'assemblée (ADR-0038) : pause des séances,
   destitution, exclusion, suspension du droit de bouffer, reprise de place ;
   et graduation des sanctions suggérée au bureau. Le vote est secret jusqu'au
   dépouillement ; la majorité absolue des électeurs décide ; le serveur
   exécute seul ce que le vote a adopté. */

import { useState } from "react";
import type { GroupRole, TontineAction } from "@kombe/domain";
import { decisions, tontines, type DecisionView, type MemberView, type OuvertureDecision } from "./api.js";
import { peut } from "./droits.js";
import { Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { Icone } from "../composants/Icones.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

type Genre = DecisionView["kind"];

/** Copie de `DECISION_OPENERS` (domaine) ; `droits.test.ts` vérifie l'égalité. */
export const OUVREURS: Readonly<Record<Genre, TontineAction>> = {
  pause: "schedule.manage",
  removal: "group.read",
  exclusion: "member.remove",
  payout_suspension: "fine.issue",
  replacement: "order.manage",
};
const GENRES: readonly Genre[] = ["pause", "removal", "exclusion", "payout_suspension", "replacement"];
const BUREAU: readonly GroupRole[] = ["animator", "vice_president", "secretary", "treasurer", "treasurer_deputy", "auditor", "censor", "advisor"];

const TON: Record<DecisionView["state"], "attente" | "ok" | "alerte" | "neutre"> = {
  open: "attente",
  adopted: "ok",
  rejected: "alerte",
  cancelled: "neutre",
  lifted: "neutre",
};

export function Decisions({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx } = useTextes();
  const gid = ctx.groupe.groupId;
  const liste = useDonnees(() => decisions.liste(ctx.session, gid), [gid]);
  const membres = useDonnees(() => tontines.membres(ctx.session, gid, true), [gid]);
  const [ouverture, setOuverture] = useState<Genre | null>(null);
  const permis = GENRES.filter((g) => peut(ctx.roles, OUVREURS[g]));
  const apres = () => {
    liste.recharger();
    membres.recharger();
    ctx.rafraichir();
  };
  return (
    <div className="pile">
      <Carte
        titre={tx("dc.titre")}
        actions={
          !ouverture && permis.length > 0 ? (
            <button type="button" className="bouton bouton-compact bouton-avec-icone bouton-icone-seule" onClick={() => setOuverture(permis[0] as Genre)} title={tx("dc.nouveau")}>
              <Icone nom="plus" taille={18} />
              <span className="bouton-libelle">{tx("dc.nouveau")}</span>
            </button>
          ) : null
        }
      >
        <p className="aide-champ">{tx("dc.regle")}</p>
        {ouverture && membres.etat.statut === "ok" ? (
          <FormulaireOuverture
            ctx={ctx}
            genres={permis}
            initial={ouverture}
            membres={membres.etat.donnees}
            onFini={(ok) => {
              setOuverture(null);
              if (ok) apres();
            }}
          />
        ) : null}
        <Charge etat={liste.etat} recharger={liste.recharger}>
          {(items) =>
            items.length === 0 ? (
              <p>{tx("app.vide")}</p>
            ) : (
              <ul className="liste">
                {items.map((d) => (
                  <LigneDecision key={d.decisionId} ctx={ctx} d={d} onFini={apres} />
                ))}
              </ul>
            )
          }
        </Charge>
      </Carte>
      {peut(ctx.roles, "fine.issue") || peut(ctx.roles, "group.manage") || peut(ctx.roles, "movement.confirm") ? <Sanctions ctx={ctx} /> : null}
    </div>
  );
}

function LigneDecision({ ctx, d, onFini }: { readonly ctx: ContexteGroupe; readonly d: DecisionView; readonly onFini: () => void }) {
  const { tx, dyn, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const action = useAction();
  const [motif, setMotif] = useState<{ quoi: "annuler" | "lever"; texte: string } | null>(null);
  const objet =
    d.kind === "removal" && d.targetRole
      ? `${d.targetName ?? ""} — ${dyn(`role.${d.targetRole}`)}`
      : d.kind === "replacement"
        ? tx("dc.reprise", { sortant: d.targetName ?? "", entrant: String(d.params.incomingName ?? "") })
        : d.kind === "pause"
          ? tx("dc.pauseDe", { n: String(d.params.occurrences ?? 1) })
          : (d.targetName ?? "");
  const lancer = (fn: () => Promise<unknown>) =>
    void action.lancer(fn).then((r) => {
      if (r) {
        setMotif(null);
        onFini();
      }
    });
  return (
    <li className="liste__ligne liste__ligne--haute">
      <div>
        <strong>
          {dyn(`dc.k.${d.kind}`)} · {objet}
        </strong>
        <span className="aide-champ">
          {d.reason}
          {d.openedByName ? ` · ${d.openedByName}` : ""} · {date(d.openedAt)}
        </span>
        <Pastille ton={TON[d.state]}>{dyn(`dc.e.${d.state}`)}</Pastille>
        <span className="aide-champ">
          {d.state === "open" ? `${tx("dc.jusqua", { date: date(d.closesAt) })} · ` : ""}
          {tx("dc.bulletins", { n: String(d.ballots), total: String(d.electorate) })}
          {d.myChoice ? ` · ${tx("dc.monVote")} : ${dyn(`dc.c.${d.myChoice}`)}` : ""}
        </span>
        {d.result ? (
          <span className="aide-champ">{tx("dc.resultat", { oui: String(d.result.yes), non: String(d.result.no), abs: String(d.result.abstain) })}</span>
        ) : d.state === "open" ? (
          <span className="aide-champ">{tx("dc.secret")}</span>
        ) : null}
        {d.outcomeNote ? <p className="aide-champ">{d.outcomeNote}</p> : null}
        <Retour erreur={action.erreur} succes={action.succes} />
        {motif ? (
          <div className="formulaire-encart pile">
            <Champ id={`dc-motif-${d.decisionId}`} libelle={tx("dc.motif")}>
              <input id={`dc-motif-${d.decisionId}`} value={motif.texte} maxLength={500} onChange={(e) => setMotif({ ...motif, texte: e.target.value })} />
            </Champ>
            <div className="actions-formulaire">
              <button type="button" className="bouton bouton-secondaire" onClick={() => setMotif(null)}>
                {tx("app.annuler")}
              </button>
              <button
                type="button"
                className="bouton"
                disabled={action.enCours || motif.texte.trim().length < 3}
                onClick={() =>
                  lancer(() =>
                    motif.quoi === "annuler"
                      ? decisions.annuler(ctx.session, gid, d.decisionId, motif.texte.trim())
                      : decisions.lever(ctx.session, gid, d.decisionId, motif.texte.trim()),
                  )
                }
              >
                {motif.quoi === "annuler" ? tx("dc.annuler") : tx("dc.lever")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="liste__actions">
        {d.can.vote
          ? (["yes", "no", "abstain"] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={c === "yes" ? "bouton bouton-compact" : "bouton bouton-secondaire bouton-compact"}
                disabled={action.enCours}
                onClick={() => lancer(() => decisions.voter(ctx.session, gid, d.decisionId, c))}
              >
                {dyn(`dc.c.${c}`)}
              </button>
            ))
          : null}
        {d.can.close ? (
          <button type="button" className="bouton bouton-secondaire bouton-compact bouton-avec-icone" disabled={action.enCours} onClick={() => lancer(() => decisions.depouiller(ctx.session, gid, d.decisionId))} title={tx("dc.depouiller")}>
            <Icone nom="vote" taille={18} />
            <span className="bouton-libelle">{tx("dc.depouiller")}</span>
          </button>
        ) : null}
        {d.can.cancel && !motif ? (
          <button type="button" className="bouton bouton-secondaire bouton-compact bouton-avec-icone bouton-icone-seule" onClick={() => setMotif({ quoi: "annuler", texte: "" })} title={tx("dc.annuler")}>
            <Icone nom="fermer" taille={18} />
            <span className="bouton-libelle">{tx("dc.annuler")}</span>
          </button>
        ) : null}
        {d.can.lift && !motif ? (
          <button type="button" className="bouton bouton-compact bouton-avec-icone bouton-icone-seule" onClick={() => setMotif({ quoi: "lever", texte: "" })} title={tx("dc.lever")}>
            <Icone nom="cadenas" taille={18} />
            <span className="bouton-libelle">{tx("dc.lever")}</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}

function FormulaireOuverture({
  ctx,
  genres,
  initial,
  membres,
  onFini,
}: {
  readonly ctx: ContexteGroupe;
  readonly genres: readonly Genre[];
  readonly initial: Genre;
  readonly membres: readonly MemberView[];
  readonly onFini: (ok: boolean) => void;
}) {
  const { tx, dyn } = useTextes();
  const action = useAction();
  const [genre, setGenre] = useState<Genre>(initial);
  const [cible, setCible] = useState("");
  const [fonction, setFonction] = useState("");
  const [entrant, setEntrant] = useState("");
  const [occurrences, setOccurrences] = useState(1);
  const [motif, setMotif] = useState("");
  const actifs = membres.filter((m) => m.state === "active");
  // Reprise de place : la personne sortante peut déjà être exclue ou partie.
  const cibles = genre === "replacement" ? membres.filter((m) => m.state !== "pending") : genre === "removal" ? actifs.filter((m) => m.roles.some((r) => BUREAU.includes(r))) : actifs.filter((m) => !m.isMe);
  const fonctions = actifs.find((m) => m.membershipId === cible)?.roles.filter((r) => BUREAU.includes(r)) ?? [];
  const pret =
    motif.trim().length >= 3 &&
    (genre === "pause" || cible !== "") &&
    (genre !== "removal" || fonction !== "") &&
    (genre !== "replacement" || (entrant !== "" && entrant !== cible));
  const corps = (): OuvertureDecision => ({
    kind: genre,
    reason: motif.trim(),
    ...(genre !== "pause" ? { targetMembershipId: cible } : {}),
    ...(genre === "removal" ? { targetRole: fonction } : {}),
    ...(genre === "pause" ? { occurrences } : {}),
    ...(genre === "replacement" ? { incomingMembershipId: entrant } : {}),
  });
  return (
    <div className="formulaire-encart pile">
      <Retour erreur={action.erreur} succes={action.succes} />
      <Champ id="dc-genre" libelle={tx("dc.type")}>
        <select
          id="dc-genre"
          value={genre}
          onChange={(e) => {
            setGenre(e.target.value as Genre);
            setCible("");
            setFonction("");
          }}
        >
          {genres.map((g) => (
            <option key={g} value={g}>
              {dyn(`dc.k.${g}`)}
            </option>
          ))}
        </select>
      </Champ>
      <p className="aide-champ">{dyn(`dc.aide.${genre}`)}</p>
      {genre === "pause" ? (
        <Champ id="dc-occ" libelle={tx("dc.occurrences")}>
          <select id="dc-occ" value={occurrences} onChange={(e) => setOccurrences(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Champ>
      ) : (
        <Champ id="dc-cible" libelle={tx("dc.cible")}>
          <select id="dc-cible" value={cible} onChange={(e) => (setCible(e.target.value), setFonction(""))}>
            <option value="">—</option>
            {cibles.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.displayName}
                {m.state !== "active" ? ` (${dyn(`mb.etat.${m.state}`)})` : ""}
              </option>
            ))}
          </select>
        </Champ>
      )}
      {genre === "removal" && cible ? (
        <Champ id="dc-fonction" libelle={tx("dc.fonction")}>
          <select id="dc-fonction" value={fonction} onChange={(e) => setFonction(e.target.value)}>
            <option value="">—</option>
            {fonctions.map((r) => (
              <option key={r} value={r}>
                {dyn(`role.${r}`)}
              </option>
            ))}
          </select>
        </Champ>
      ) : null}
      {genre === "replacement" ? (
        <Champ id="dc-entrant" libelle={tx("dc.repreneur")}>
          <select id="dc-entrant" value={entrant} onChange={(e) => setEntrant(e.target.value)}>
            <option value="">—</option>
            {actifs
              .filter((m) => m.membershipId !== cible && !m.offline)
              .map((m) => (
                <option key={m.membershipId} value={m.membershipId}>
                  {m.displayName}
                </option>
              ))}
          </select>
        </Champ>
      ) : null}
      <Champ id="dc-motif" libelle={tx("dc.motif")}>
        <input id="dc-motif" value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)} />
      </Champ>
      <div className="actions-formulaire">
        <button type="button" className="bouton bouton-secondaire" onClick={() => onFini(false)}>
          {tx("app.annuler")}
        </button>
        <button
          type="button"
          className="bouton"
          disabled={action.enCours || !pret}
          onClick={() => void action.lancer(() => decisions.ouvrir(ctx.session, ctx.groupe.groupId, corps())).then((r) => r && onFini(true))}
        >
          {tx("dc.ouvrir")}
        </button>
      </div>
    </div>
  );
}

function Sanctions({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn, xaf } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => decisions.sanctions(ctx.session, gid), [gid]);
  return (
    <Carte titre={tx("dc.sanctions")}>
      <p className="aide-champ">{tx("dc.sanctionsAide")}</p>
      <Charge etat={etat} recharger={recharger}>
        {(liste) => {
          const concernes = liste.filter((s) => s.lateCount > 0 || s.payoutSuspended);
          return concernes.length === 0 ? (
            <p>{tx("dc.aucunRetard")}</p>
          ) : (
            <ul className="liste">
              {concernes.map((s) => (
                <li key={s.membershipId} className="liste__ligne">
                  <div>
                    <strong>{s.displayName}</strong>
                    <span className="aide-champ">{tx("dc.retards", { n: String(s.lateCount), montant: xaf(s.lateAmount), dette: xaf(s.openDebt) })}</span>
                  </div>
                  <div className="liste__actions">
                    <Pastille ton={s.suggested === "warning" ? "neutre" : s.suggested === "fine" ? "attente" : "alerte"}>{dyn(`dc.s.${s.suggested}`)}</Pastille>
                    {s.payoutSuspended ? <Pastille ton="alerte">{tx("dc.suspendu")}</Pastille> : null}
                  </div>
                </li>
              ))}
            </ul>
          );
        }}
      </Charge>
    </Carte>
  );
}
