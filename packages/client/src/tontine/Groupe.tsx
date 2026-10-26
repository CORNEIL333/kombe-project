/* KÓMBE — un groupe : onglets Aperçu, Membres, Séances, Cotisations, Tours,
   Amendes & secours, Statuts, Registre, Règlement. Chaque bouton n'apparaît
   que pour la fonction qui peut l'exercer ; le serveur reste seul juge. */

import { BandeauPhoto, photoPour } from "../composants/Scene.js";
import { Orbite } from "../composants/Orbite.js";
import { useState } from "react";
import type { GroupRole } from "@kombe/domain";
import {
  ApiError,
  acces,
  argent,
  cycle,
  reglement,
  tontines,
  type DueView,
  type LigneRegularite,
  type MemberView,
  type RedistributionReserve,
  type Session,
  type TontineDetail,
} from "./api.js";
import { peut } from "./droits.js";
import { BoutonIcone, Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { estBureau, ouvrirBureau } from "./bureau.js";
import { Icone, type NomIcone } from "../composants/Icones.js";
import type { PaymentChannel } from "@kombe/domain";
import { useTextes, type CleTexte } from "./textes.js";
import { Membres } from "./Membres.js";
import { Seances } from "./Seances.js";
import { Argent, CANAUX, FormulaireDeclaration } from "./Argent.js";
import { Caisses, useNomCaisse } from "./Caisses.js";
import { Tours } from "./Tours.js";
import { Discipline } from "./Discipline.js";
import { Decisions } from "./Decisions.js";
import { Statuts, Journal } from "./Statuts.js";
import { Reglages } from "./Reglages.js";
import { EnFileAttente } from "./fileAttenteMoteur.js";

type Onglet = "apercu" | "membres" | "seances" | "argent" | "tours" | "discipline" | "decisions" | "statuts" | "journal" | "reglages";
const ONGLETS: { id: Onglet; cle: CleTexte; icone: NomIcone }[] = [
  { id: "apercu", cle: "td.apercu", icone: "accueil" },
  { id: "argent", cle: "td.argent", icone: "cagnotte" },
  { id: "seances", cle: "td.seances", icone: "seance" },
  { id: "tours", cle: "td.tours", icone: "cycle" },
  { id: "membres", cle: "td.membres", icone: "personnes" },
  { id: "discipline", cle: "td.discipline", icone: "balance" },
  { id: "decisions", cle: "td.decisions", icone: "vote" },
  { id: "statuts", cle: "td.statuts", icone: "document" },
  { id: "journal", cle: "td.journal", icone: "registre" },
  { id: "reglages", cle: "td.reglages", icone: "reglages" },
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
    <div className="pile ecran">
      <Charge etat={etat} recharger={recharger}>
        {(g) => {
          const ctx: ContexteGroupe = { session, groupe: g, roles: g.me.roles, rafraichir: recharger };
          // Position réelle dans le cycle (aucune valeur inventée : sans cycle ni tour, pas d'orbite).
          const tourActuel =
            g.cycle && g.currentRound
              ? { total: g.cycle.lastSeq - g.cycle.firstSeq + 1, index: g.currentRound.seq - g.cycle.firstSeq }
              : null;
          return (
            <>
              <div className="barre-groupe">
                <BoutonIcone icone="retour" libelle={tx("app.accueil")} onClick={onRetour} />
                {estBureau(g.me.roles) ? (
                  <BoutonIcone icone="bureau" ton="or" legende libelle={tx("app.bureau")} onClick={() => ouvrirBureau(session, g.groupId)} />
                ) : null}
              </div>
              <BandeauPhoto
                photo={photoPour(g.groupId)}
                surtitre={tx("imm.grpSur")}
                titre={g.name}
                orbite={
                  tourActuel ? (
                    <Orbite
                      total={tourActuel.total}
                      courant={tourActuel.index}
                      variante="marque"
                      taille={170}
                      libelle={tx("imm.tourSur", { n: tourActuel.index + 1, total: tourActuel.total })}
                    />
                  ) : undefined
                }
              >
                <p className="bandeau-photo__meta">
                  {tx("td.etat", { etat: dyn(`etat.${g.state}`) })}
                  {g.cycle ? ` · ${tx("td.cycleN", { n: g.cycle.number })}` : ""} · {g.me.roles.map((r) => dyn(`role.${r}`)).join(" · ")}
                </p>
                {tourActuel ? (
                  <ul className="bandeau-photo__chiffres">
                    <li>{tx("imm.tourSur", { n: tourActuel.index + 1, total: tourActuel.total })}</li>
                    {g.currentRound?.beneficiaryName ? (
                      <li data-ton="accent">{tx("imm.beneficiaire", { nom: g.currentRound.beneficiaryName })}</li>
                    ) : null}
                  </ul>
                ) : null}
              </BandeauPhoto>
              <nav className="onglets-groupe" aria-label={g.name}>
                {ONGLETS.filter((o) => o.id !== "reglages" || peut(g.me.roles, "group.manage")).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-current={onglet === o.id ? "page" : undefined}
                    className={onglet === o.id ? "onglet onglet--icone onglet--actif" : "onglet onglet--icone"}
                    title={tx(o.cle)}
                    onClick={() => setOnglet(o.id)}
                  >
                    <Icone nom={o.icone} taille={20} />
                    <span className="onglet__libelle">{tx(o.cle)}</span>
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
  const nomCaisse = useNomCaisse();
  const g = ctx.groupe;
  const echeances = useDonnees(() => acces.mesEcheances(ctx.session, g.groupId), [g.groupId, ctx.session.sessionId]);
  const [aDeclarer, setADeclarer] = useState<DueView | null>(null);

  return (
    <div className="pile">
      {g.statutes && !g.statutes.acceptedByMe ? (
        <div className="msg msg--attente" role="status">
          <p>{tx("td.statutsAAccepter", { v: g.statutes.version })}</p>
          <button type="button" className="bouton bouton-compact bouton-avec-icone bouton-icone-seule" onClick={() => allerA("statuts")} title={tx("td.lireAccepter")}>
            <Icone nom="document" taille={18} />
            <span className="bouton-libelle">{tx("td.lireAccepter")}</span>
          </button>
        </div>
      ) : null}
      {g.pendingCount > 0 && peut(ctx.roles, "member.admit") ? (
        <div className="msg msg--attente" role="status">
          <p>{tx("td.adhesions", { n: g.pendingCount })}</p>
          <button type="button" className="bouton bouton-compact bouton-avec-icone" onClick={() => allerA("membres")} title={tx("td.membres")}>
            <Icone nom="personnes" taille={18} />
            <span className="bouton-libelle">{tx("td.membres")}</span>
          </button>
        </div>
      ) : null}

      {!g.cycleStarted && peut(ctx.roles, "schedule.manage") ? <Demarrage ctx={ctx} /> : null}
      {g.cycle?.finished && peut(ctx.roles, "schedule.manage") ? <Demarrage ctx={ctx} cycleTermine={g.cycle.number} /> : null}

      {g.currentRound ? (
        <Carte titre={tx("td.tourCourant", { seq: g.currentRound.seq, date: date(g.currentRound.date) })}>
          <p>{tx("td.beneficiaire", { nom: g.currentRound.beneficiaryName ?? "—" })}</p>
          <p>{tx("td.collecte", { collecte: xaf(g.currentRound.collected), attendu: xaf(g.currentRound.expectedPot) })}</p>
          <Pastille ton={g.currentRound.payoutState === "received" ? "ok" : g.currentRound.payoutState === "none" ? "neutre" : "attente"}>
            {dyn(`to.remiseEtat.${g.currentRound.payoutState}`)}
          </Pastille>
        </Carte>
      ) : null}

      {g.cycleStarted && g.me.state === "active" ? <MonTour ctx={ctx} /> : null}

      {g.nextMeeting ? (
        <Carte titre={tx("se.seance", { seq: g.nextMeeting.seq, date: date(g.nextMeeting.date) })}>
          <p>
            {dyn(`se.etat.${g.nextMeeting.state}`)}
            {g.nextMeeting.location ? ` · ${g.nextMeeting.location}` : ""}
          </p>
          <button type="button" className="bouton bouton-secondaire bouton-compact bouton-avec-icone" onClick={() => allerA("seances")} title={tx("td.seances")}>
            <Icone nom="seance" taille={18} />
            <span className="bouton-libelle">{tx("td.seances")}</span>
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
                      <strong>{nomCaisse(d)}</strong>
                      <span className="aide-champ">
                        {tx("ar.tour")} {d.roundSeq} · {date(d.date)} · {tx("ar.reste", { montant: xaf(d.remaining) })}
                        {BigInt(d.declared) > 0n ? ` · ${tx("td.enAttente")} ${xaf(d.declared)}` : ""}
                      </span>
                      <Pastille ton={d.lateness === "late" ? "alerte" : d.lateness === "grace" ? "attente" : "neutre"}>{dyn(`ar.retard.${d.lateness}`)}</Pastille>
                    </div>
                    {BigInt(d.remaining) > 0n ? (
                      <button type="button" className="bouton bouton-compact bouton-avec-icone" onClick={() => setADeclarer(d)} title={tx("acc.declarer")}>
                        <Icone nom="declarer" taille={18} />
                        <span className="bouton-libelle">{tx("acc.declarer")}</span>
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

      <Caisses ctx={ctx} />
      {g.funds.some((f) => f.kind === "year_end_reserve" && BigInt(f.confirmedBalance) > 0n) &&
      (peut(ctx.roles, "movement.confirm") || ctx.roles.includes("animator") || ctx.roles.includes("vice_president")) ? (
        <Carte>
          <RendreReserve ctx={ctx} />
        </Carte>
      ) : null}

      {g.cycleStarted ? <Regularite ctx={ctx} /> : null}
    </div>
  );
}

/** « Mon tour » : quand je reçois, combien, et qui avance à qui (ADR-0039). */
function MonTour({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, xaf, date } = useTextes();
  const prevision = useDonnees(() => cycle.monTour(ctx.session, ctx.groupe.groupId), [ctx.groupe.groupId, ctx.groupe.cycle?.number]);
  return (
    <Carte titre={tx("mt.titre")}>
      <Charge etat={prevision.etat} recharger={prevision.recharger}>
        {(p) => (
          <>
            {p.turns.length === 0 ? <p>{tx("mt.aucun")}</p> : null}
            <ul className="liste">
              {p.turns.map((tour) => (
                <li key={tour.seq} className="liste__ligne">
                  <div>
                    <strong>{tx("mt.tour", { seq: tour.seq, date: date(tour.date), montant: xaf(tour.amount) })}</strong>
                    <span className="aide-champ">{tour.explanation}</span>
                    <Pastille ton={tour.received ? "ok" : tour.position === "group_advances_you" ? "attente" : "neutre"}>
                      {tour.received
                        ? tx("mt.recu")
                        : tour.position === "group_advances_you"
                          ? tx("mt.avance", { montant: xaf(tour.gap) })
                          : tour.position === "you_advance_group"
                            ? tx("mt.vousAvancez", { montant: xaf(tour.gap) })
                            : tx("mt.egal")}
                    </Pastille>
                  </div>
                </li>
              ))}
            </ul>
            <p className="aide-champ">{tx("mt.total", { verse: xaf(p.totalDue), recu: xaf(p.totalToReceive), confirme: xaf(p.confirmedSoFar) })}</p>
          </>
        )}
      </Charge>
    </Carte>
  );
}

const BADGES: Readonly<Record<LigneRegularite["badge"], { cle: CleTexte; ton: "ok" | "neutre" | "attente" | "alerte" }>> = {
  nouveau: { cle: "rg.nouveau", ton: "neutre" },
  exemplaire: { cle: "rg.exemplaire", ton: "ok" },
  régulier: { cle: "rg.regulier", ton: "ok" },
  "à suivre": { cle: "rg.aSuivre", ton: "attente" },
  "en retard": { cle: "rg.enRetard", ton: "alerte" },
};

/** Régularité de chacun sur les tours échus ; la transparence du règlement décide qui voit qui. */
function Regularite({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx } = useTextes();
  const lignes = useDonnees(() => cycle.regularite(ctx.session, ctx.groupe.groupId), [ctx.groupe.groupId]);
  return (
    <Carte titre={tx("rg.titre")}>
      <p className="aide-champ">{tx("rg.aide")}</p>
      <Charge etat={lignes.etat} recharger={lignes.recharger}>
        {(liste) => (
          <ul className="liste">
            {liste.map((l) => (
              <li key={l.membershipId} className="liste__ligne">
                <div>
                  <strong>
                    {l.name}
                    {l.dueSoFar > 0 ? ` · ${l.onTimeRate} %` : ""}
                  </strong>
                  <span className="aide-champ">{tx("rg.ligne", { aTemps: l.onTime, retard: l.late, impaye: l.unpaidLate, amendes: l.openFines })}</span>
                </div>
                <Pastille ton={BADGES[l.badge].ton}>{tx(BADGES[l.badge].cle)}</Pastille>
              </li>
            ))}
          </ul>
        )}
      </Charge>
    </Carte>
  );
}

/** Réserve de fin d'année rendue à chacun : une remise par membre, accusée par lui. */
function RendreReserve({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn, xaf } = useTextes();
  const [canal, setCanal] = useState<PaymentChannel>("cash");
  const [reference, setReference] = useState("");
  const [resultat, setResultat] = useState<RedistributionReserve | null>(null);
  const action = useAction();
  const mobile = canal !== "cash";
  const rendre = async () => {
    const r = await action.lancer(() =>
      argent.rendreReserve(ctx.session, ctx.groupe.groupId, { channel: canal, ...(reference.trim() ? { reference: reference.trim() } : {}) }),
    );
    if (r) {
      setResultat(r);
      ctx.rafraichir();
    }
  };
  return (
    <div className="formulaire-encart pile">
      <h4>{tx("rs.titre")}</h4>
      <p className="aide-champ">{tx("rs.aide")}</p>
      <Champ id="reserve-canal" libelle={tx("ar.canal")}>
        <select id="reserve-canal" value={canal} onChange={(e) => setCanal(e.target.value as PaymentChannel)}>
          {CANAUX.map((c) => (
            <option key={c} value={c}>
              {dyn(`ar.canal.${c}`)}
            </option>
          ))}
        </select>
      </Champ>
      {mobile ? (
        <Champ id="reserve-ref" libelle={tx("ar.reference")} aide={tx("ar.referenceAide")}>
          <input id="reserve-ref" value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
        </Champ>
      ) : null}
      <Retour erreur={action.erreur} />
      {resultat ? (
        <div className="msg msg--info" role="status">
          <p>{tx("rs.fait", { n: resultat.movements.length, disponible: xaf(resultat.available) })}</p>
          {resultat.shortfall ? <p>{tx("rs.prorata")}</p> : null}
          {resultat.waiting.map((w) => (
            <p key={w.membershipId}>{tx("rs.attente", { nom: w.name ?? "—", montant: xaf(w.amount), motif: w.reason })}</p>
          ))}
        </div>
      ) : null}
      <button type="button" className="bouton bouton-secondaire" disabled={action.enCours || (mobile && !reference.trim())} onClick={() => void rendre()}>
        {action.enCours ? tx("app.envoi") : tx("rs.rendre")}
      </button>
    </div>
  );
}

function Demarrage({ ctx, cycleTermine }: { readonly ctx: ContexteGroupe; readonly cycleTermine?: number }) {
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
      const planter = cycleTermine ? cycle.renouveler : cycle.demarrer;
      if (ordre === "draw") {
        const t = tirage ?? (await cycle.engagerTirage(ctx.session, ctx.groupe.groupId));
        setTirage(t);
        return planter(ctx.session, ctx.groupe.groupId, "draw", t.drawId);
      }
      if (ordre === "manual") return planter(ctx.session, ctx.groupe.groupId, "manual", undefined, ordreManuel.map((m) => m.membershipId));
      return planter(ctx.session, ctx.groupe.groupId, "join_order");
    });
    ctx.rafraichir();
  };

  return (
    <Carte titre={cycleTermine ? tx("td.nouveauCycle", { n: cycleTermine + 1 }) : tx("td.demarrer")}>
      <p className="aide-champ">{cycleTermine ? tx("td.nouveauCycleAide", { n: cycleTermine }) : tx("td.demarrerAide")}</p>
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
      <Retour erreur={action.erreur} succes={action.succes} />
      <button type="button" className="bouton" disabled={action.enCours || !pret} onClick={() => void demarrer()}>
        {action.enCours ? tx("app.envoi") : cycleTermine ? tx("td.nouveauCycle", { n: cycleTermine + 1 }) : tx("td.demarrer")}
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
      // Sans réseau, chaque déclaration est gardée sur le téléphone : on les
      // garde toutes, puis on le dit une seule fois.
      let gardee: EnFileAttente | null = null;
      for (const d of duTour) {
        try {
          await argent.declarer(ctx.session, ctx.groupe.groupId, {
            fundId: d.fundId,
            kind: "contribution",
            amount: d.remaining,
            roundSeq: d.roundSeq,
            channel: canal,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
          });
        } catch (err) {
          if (err instanceof EnFileAttente) gardee = err;
          else throw err;
        }
      }
      if (gardee) throw gardee;
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
