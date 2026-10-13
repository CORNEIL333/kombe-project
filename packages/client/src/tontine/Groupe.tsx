/* KÓMBE — un groupe : onglets Aperçu, Membres, Séances, Cotisations, Tours,
   Amendes & secours, Statuts, Registre, Règlement. Chaque bouton n'apparaît
   que pour la fonction qui peut l'exercer ; le serveur reste seul juge. */

import { useState } from "react";
import type { GroupRole } from "@kombe/domain";
import { ApiError, acces, argent, cycle, reglement, tontines, type DueView, type MemberView, type Session, type TontineDetail } from "./api.js";
import { peut } from "./droits.js";
import { Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import type { PaymentChannel } from "@kombe/domain";
import { useTextes, type CleTexte } from "./textes.js";
import { Membres } from "./Membres.js";
import { Seances } from "./Seances.js";
import { Argent, CANAUX, FormulaireDeclaration } from "./Argent.js";
import { Tours } from "./Tours.js";
import { Discipline } from "./Discipline.js";
import { Decisions } from "./Decisions.js";
import { Statuts, Journal } from "./Statuts.js";
import { Reglages } from "./Reglages.js";

type Onglet = "apercu" | "membres" | "seances" | "argent" | "tours" | "discipline" | "decisions" | "statuts" | "journal" | "reglages";
const ONGLETS: { id: Onglet; cle: CleTexte }[] = [
  { id: "apercu", cle: "td.apercu" },
  { id: "argent", cle: "td.argent" },
  { id: "seances", cle: "td.seances" },
  { id: "tours", cle: "td.tours" },
  { id: "membres", cle: "td.membres" },
  { id: "discipline", cle: "td.discipline" },
  { id: "decisions", cle: "td.decisions" },
  { id: "statuts", cle: "td.statuts" },
  { id: "journal", cle: "td.journal" },
  { id: "reglages", cle: "td.reglages" },
];

export interface ContexteGroupe {
  readonly session: Session;
  readonly groupe: TontineDetail;
  readonly roles: readonly GroupRole[];
  readonly rafraichir: () => void;
}

export function Groupe({ session, groupId, onRetour }: { readonly session: Session; readonly groupId: string; readonly onRetour: () => void }) {
  const { tx, dyn } = useTextes();
  const [onglet, setOnglet] = useState<Onglet>("apercu");
  const { etat, recharger } = useDonnees(() => tontines.detail(session, groupId), [session.sessionId, groupId]);

  return (
    <div className="pile">
      <button type="button" className="lien-retour" onClick={onRetour}>
        ← {tx("app.accueil")}
      </button>
      <Charge etat={etat} recharger={recharger}>
        {(g) => {
          const ctx: ContexteGroupe = { session, groupe: g, roles: g.me.roles, rafraichir: recharger };
          return (
            <>
              <header className="entete-groupe">
                <h2>{g.name}</h2>
                <p className="aide-champ">
                  {tx("td.etat", { etat: dyn(`etat.${g.state}`) })} · {g.me.roles.map((r) => dyn(`role.${r}`)).join(" · ")}
                </p>
              </header>
              <nav className="onglets-groupe" aria-label={g.name}>
                {ONGLETS.filter((o) => o.id !== "reglages" || peut(g.me.roles, "group.manage")).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-current={onglet === o.id ? "page" : undefined}
                    className={onglet === o.id ? "onglet onglet--actif" : "onglet"}
                    onClick={() => setOnglet(o.id)}
                  >
                    {tx(o.cle)}
                  </button>
                ))}
              </nav>
              {onglet === "apercu" ? <Apercu ctx={ctx} allerA={setOnglet} /> : null}
              {onglet === "membres" ? <Membres ctx={ctx} /> : null}
              {onglet === "seances" ? <Seances ctx={ctx} /> : null}
              {onglet === "argent" ? <Argent ctx={ctx} /> : null}
              {onglet === "tours" ? <Tours ctx={ctx} /> : null}
              {onglet === "discipline" ? <Discipline ctx={ctx} /> : null}
              {onglet === "decisions" ? <Decisions ctx={ctx} /> : null}
              {onglet === "statuts" ? <Statuts ctx={ctx} /> : null}
              {onglet === "journal" ? <Journal ctx={ctx} /> : null}
              {onglet === "reglages" ? <Reglages ctx={ctx} /> : null}
            </>
          );
        }}
      </Charge>
    </div>
  );
}

function Apercu({ ctx, allerA }: { readonly ctx: ContexteGroupe; readonly allerA: (o: Onglet) => void }) {
  const { tx, dyn, xaf, date } = useTextes();
  const g = ctx.groupe;
  const echeances = useDonnees(() => acces.mesEcheances(ctx.session, g.groupId), [g.groupId, ctx.session.sessionId]);
  const [aDeclarer, setADeclarer] = useState<DueView | null>(null);

  return (
    <div className="pile">
      {g.statutes && !g.statutes.acceptedByMe ? (
        <div className="msg msg--attente" role="status">
          <p>{tx("td.statutsAAccepter", { v: g.statutes.version })}</p>
          <button type="button" className="bouton bouton-compact" onClick={() => allerA("statuts")}>
            {tx("td.lireAccepter")}
          </button>
        </div>
      ) : null}
      {g.pendingCount > 0 && peut(ctx.roles, "member.admit") ? (
        <div className="msg msg--attente" role="status">
          <p>{tx("td.adhesions", { n: g.pendingCount })}</p>
          <button type="button" className="bouton bouton-compact" onClick={() => allerA("membres")}>
            {tx("td.membres")}
          </button>
        </div>
      ) : null}

      {!g.cycleStarted && peut(ctx.roles, "schedule.manage") ? <Demarrage ctx={ctx} /> : null}

      {g.currentRound ? (
        <Carte titre={tx("td.tourCourant", { seq: g.currentRound.seq, date: date(g.currentRound.date) })}>
          <p>{tx("td.beneficiaire", { nom: g.currentRound.beneficiaryName ?? "—" })}</p>
          <p>{tx("td.collecte", { collecte: xaf(g.currentRound.collected), attendu: xaf(g.currentRound.expectedPot) })}</p>
          <Pastille ton={g.currentRound.payoutState === "received" ? "ok" : g.currentRound.payoutState === "none" ? "neutre" : "attente"}>
            {dyn(`to.remiseEtat.${g.currentRound.payoutState}`)}
          </Pastille>
        </Carte>
      ) : null}

      {g.nextMeeting ? (
        <Carte titre={tx("se.seance", { seq: g.nextMeeting.seq, date: date(g.nextMeeting.date) })}>
          <p>
            {dyn(`se.etat.${g.nextMeeting.state}`)}
            {g.nextMeeting.location ? ` · ${g.nextMeeting.location}` : ""}
          </p>
          <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => allerA("seances")}>
            {tx("td.seances")}
          </button>
        </Carte>
      ) : null}

      <Carte titre={tx("acc.mesEcheances")}>
        <Charge etat={echeances.etat} recharger={echeances.recharger}>
          {(liste) =>
            liste.length === 0 ? (
              <p>{tx("acc.aJour")}</p>
            ) : (
              <>
              <ToutDeclarer
                ctx={ctx}
                echeances={liste}
                onFini={() => {
                  echeances.recharger();
                  ctx.rafraichir();
                }}
              />
              <ul className="liste">
                {liste.map((d) => (
                  <li key={`${d.fundId}-${d.roundSeq}`} className="liste__ligne">
                    <div>
                      <strong>{dyn(`caisse.${d.fundKind}`)}</strong>
                      <span className="aide-champ">
                        {tx("ar.tour")} {d.roundSeq} · {date(d.date)} · {tx("ar.reste", { montant: xaf(d.remaining) })}
                        {BigInt(d.declared) > 0n ? ` · ${tx("td.enAttente")} ${xaf(d.declared)}` : ""}
                      </span>
                      <Pastille ton={d.lateness === "late" ? "alerte" : d.lateness === "grace" ? "attente" : "neutre"}>{dyn(`ar.retard.${d.lateness}`)}</Pastille>
                    </div>
                    {BigInt(d.remaining) > 0n ? (
                      <button type="button" className="bouton bouton-compact" onClick={() => setADeclarer(d)}>
                        {tx("acc.declarer")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              </>
            )
          }
        </Charge>
        {aDeclarer ? (
          <FormulaireDeclaration
            ctx={ctx}
            echeance={aDeclarer}
            onFini={() => {
              setADeclarer(null);
              echeances.recharger();
              ctx.rafraichir();
            }}
          />
        ) : null}
      </Carte>

      <Carte titre={tx("td.caisses")}>
        <p className="aide-champ">{tx("td.caisseTenue")}</p>
        <ul className="liste">
          {g.funds.map((f) => (
            <li key={f.fundId} className="liste__ligne">
              <div>
                <strong>{dyn(`caisse.${f.kind}`)}</strong>
                <span className="aide-champ">
                  {tx("td.confirme")} : {xaf(f.confirmedBalance)}
                  {BigInt(f.pendingIn) > 0n ? ` · ${tx("td.enAttente")} : ${xaf(f.pendingIn)}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Carte>
    </div>
  );
}

function Demarrage({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx } = useTextes();
  const [ordre, setOrdre] = useState<"draw" | "join_order" | "manual">("draw");
  const [tirage, setTirage] = useState<{ drawId: string; commitment: string } | null>(null);
  const membres = useDonnees(() => tontines.membres(ctx.session, ctx.groupe.groupId), [ctx.groupe.groupId]);
  const statuts = useDonnees(
    () =>
      reglement.statuts(ctx.session, ctx.groupe.groupId).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    [ctx.groupe.groupId, ctx.groupe.statutes?.version],
  );
  const [liste, setListe] = useState<MemberView[] | null>(null);
  const action = useAction();
  const actifs = membres.etat.statut === "ok" ? membres.etat.donnees.filter((m) => m.state === "active") : [];
  const avecTelephone = actifs.filter((m) => !m.offline).length;
  const tresorier = actifs.some((m) => m.roles.includes("treasurer"));
  const st = statuts.etat.statut === "ok" ? statuts.etat.donnees : null;
  const conditions: { ok: boolean; texte: string }[] = [
    { ok: actifs.length >= 2, texte: tx("td.c.membres", { n: actifs.length }) },
    { ok: tresorier, texte: tx("td.c.tresorier") },
    { ok: st !== null, texte: tx("td.c.statuts") },
    { ok: st !== null && st.acceptedCount >= avecTelephone, texte: tx("td.c.acceptes", { n: st?.acceptedCount ?? 0, total: avecTelephone }) },
  ];
  const pret = conditions.every((c) => c.ok);
  const ordreManuel = liste ?? actifs;

  const deplacer = (i: number, d: -1 | 1) => {
    const l = [...ordreManuel];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j] as MemberView, l[i] as MemberView];
    setListe(l);
  };

  const demarrer = async () => {
    await action.lancer(async () => {
      if (ordre === "draw") {
        const t = tirage ?? (await cycle.engagerTirage(ctx.session, ctx.groupe.groupId));
        setTirage(t);
        return cycle.demarrer(ctx.session, ctx.groupe.groupId, "draw", t.drawId);
      }
      if (ordre === "manual") return cycle.demarrer(ctx.session, ctx.groupe.groupId, "manual", undefined, ordreManuel.map((m) => m.membershipId));
      return cycle.demarrer(ctx.session, ctx.groupe.groupId, "join_order");
    });
    ctx.rafraichir();
  };

  return (
    <Carte titre={tx("td.demarrer")}>
      <p className="aide-champ">{tx("td.demarrerAide")}</p>
      <ul className="liste">
        {conditions.map((c) => (
          <li key={c.texte} className="liste__ligne">
            <span>{c.texte}</span>
            <Pastille ton={c.ok ? "ok" : "attente"}>{c.ok ? "OK" : tx("td.aFaire")}</Pastille>
          </li>
        ))}
      </ul>
      {st === null && peut(ctx.roles, "statutes.publish") ? (
        <button
          type="button"
          className="bouton bouton-secondaire"
          disabled={action.enCours}
          onClick={() => void action.lancer(() => reglement.publier(ctx.session, ctx.groupe.groupId)).then(() => (statuts.recharger(), ctx.rafraichir()))}
        >
          {tx("st.publier")}
        </button>
      ) : null}
      <fieldset className="champ">
        <legend>{tx("cr.e.ordre")}</legend>
        {(["draw", "join_order", "manual"] as const).map((o) => (
          <label key={o} className="case">
            <input type="radio" name="ordre" checked={ordre === o} onChange={() => setOrdre(o)} />
            {tx(`td.ordre.${o}` as CleTexte)}
          </label>
        ))}
      </fieldset>
      {ordre === "draw" ? (
        tirage ? (
          <p className="msg msg--info">{tx("td.tirageEngage", { c: tirage.commitment.slice(0, 16) })}</p>
        ) : (
          <button
            type="button"
            className="bouton bouton-secondaire bouton-compact"
            onClick={() => void action.lancer(() => cycle.engagerTirage(ctx.session, ctx.groupe.groupId)).then((t) => t && setTirage(t))}
          >
            {tx("td.ordre.draw")}
          </button>
        )
      ) : null}
      {ordre === "manual" ? (
        <ol className="liste liste--ordre">
          {ordreManuel.map((m, i) => (
            <li key={m.membershipId} className="liste__ligne">
              <span>
                {i + 1}. {m.displayName}
              </span>
              <span>
                <button type="button" className="bouton bouton-secondaire bouton-compact" aria-label="↑" onClick={() => deplacer(i, -1)}>
                  ↑
                </button>
                <button type="button" className="bouton bouton-secondaire bouton-compact" aria-label="↓" onClick={() => deplacer(i, 1)}>
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <Retour erreur={action.erreur} />
      <button type="button" className="bouton" disabled={action.enCours || !pret} onClick={() => void demarrer()}>
        {action.enCours ? tx("app.envoi") : tx("td.demarrer")}
      </button>
    </Carte>
  );
}

/** Déclare d'un coup toutes les parts restantes du premier tour ouvert
   (cagnotte, secours, fonctionnement…), comme on paie en séance. Chaque caisse
   garde sa propre déclaration ; rien n'est confirmé avant le trésorier. */
function ToutDeclarer({ ctx, echeances, onFini }: { readonly ctx: ContexteGroupe; readonly echeances: readonly DueView[]; readonly onFini: () => void }) {
  const { tx, dyn, xaf } = useTextes();
  const [ouvert, setOuvert] = useState(false);
  const [canal, setCanal] = useState<PaymentChannel>("cash");
  const [reference, setReference] = useState("");
  const action = useAction();
  const restantes = echeances.filter((d) => BigInt(d.remaining) > 0n);
  const tour = restantes.reduce<number | null>((m, d) => (m === null || d.roundSeq < m ? d.roundSeq : m), null);
  const duTour = restantes.filter((d) => d.roundSeq === tour);
  if (duTour.length < 2) return null;
  const total = duTour.reduce((s, d) => s + BigInt(d.remaining), 0n).toString();
  const mobile = canal !== "cash";

  const envoyer = async () => {
    await action.lancer(async () => {
      for (const d of duTour) {
        await argent.declarer(ctx.session, ctx.groupe.groupId, {
          fundId: d.fundId,
          kind: "contribution",
          amount: d.remaining,
          roundSeq: d.roundSeq,
          channel: canal,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        });
      }
      return true;
    }, tx("ar.declare"));
    onFini();
  };

  return ouvert ? (
    <div className="formulaire-encart pile">
      <h4>{tx("ar.toutDeclarer", { montant: xaf(total), seq: tour ?? "" })}</h4>
      <Champ id="tout-canal" libelle={tx("ar.canal")}>
        <select id="tout-canal" value={canal} onChange={(e) => setCanal(e.target.value as PaymentChannel)}>
          {CANAUX.map((c) => (
            <option key={c} value={c}>
              {dyn(`ar.canal.${c}`)}
            </option>
          ))}
        </select>
      </Champ>
      {mobile ? (
        <Champ id="tout-ref" libelle={tx("ar.reference")} aide={tx("ar.referenceAide")}>
          <input id="tout-ref" value={reference} maxLength={64} required onChange={(e) => setReference(e.target.value)} />
        </Champ>
      ) : null}
      <Retour erreur={action.erreur} succes={action.succes} />
      <div className="actions-formulaire">
        <button type="button" className="bouton bouton-secondaire" onClick={() => setOuvert(false)}>
          {tx("app.annuler")}
        </button>
        <button type="button" className="bouton" disabled={action.enCours || (mobile && !reference.trim())} onClick={() => void envoyer()}>
          {action.enCours ? tx("app.envoi") : tx("ar.declarer")}
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className="bouton" onClick={() => setOuvert(true)}>
      {tx("ar.toutDeclarer", { montant: xaf(total), seq: tour ?? "" })}
    </button>
  );
}
