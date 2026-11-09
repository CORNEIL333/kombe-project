/* KÓMBE — accueil du groupe actif (direction premium). Emplacements STABLES :
   1. bandeau d'accueil (salutation, groupe) ; 2. carte de cotisation (reste
   dû réel, échéance ou retard, déclaré en attente / confirmé, action
   principale) ; 3. actions rapides selon la fonction ; 4. « À faire » ;
   5. prochaine séance ; 6. activité récente. Sur grand écran, une colonne
   « Tour en cours » (progression, cagnotte, bénéficiaire, membres).
   Lectures en parallèle ; une donnée absente reste absente. */

import { BandeCycle } from "./BandeCycle.js";
import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "../App.js";
import {
  acces,
  argent,
  lirePhotoGroupe,
  decisions,
  cycle,
  tontines,
  votes,
  type DecisionView,
  type PollView,
  type NotificationView,
  type RoundView,
  type Session,
  type TontineSummary,
} from "./api.js";
import { Charge, useDonnees } from "./ui.js";
import { Icone, type NomIcone } from "../composants/Icones.js";
import { useTextes, type CleTexte } from "./textes.js";
import { destinationNotification, entreeNotification, texteNotification } from "./notifications.js";
import { AvatarPersonne } from "./PhotoGroupe.js";

const CONFIRME = ["treasurer", "treasurer_deputy", "animator", "vice_president"];

interface DonneesAccueil {
  readonly prenom: string | null;
  readonly reste: bigint;
  readonly enRetard: boolean;
  readonly prochaineEcheance: string | null;
  readonly declare: bigint;
  readonly confirme: bigint;
  readonly aValider: number;
  readonly controle: boolean;
  readonly votes: readonly DecisionView[];
  readonly seance: { readonly date: string; readonly lieu: string | null } | null;
  readonly tour: { readonly rang: number; readonly total: number; readonly round: RoundView } | null;
  readonly membres: number;
  readonly noms: readonly { readonly nom: string; readonly id: string; readonly version?: number | null | undefined }[];
  readonly recentes: readonly NotificationView[];
  /** Votes libres ouverts auxquels je n'ai pas encore répondu (0041). */
  readonly sondages: readonly PollView[];
  /** Tous les tours du cycle (tableau de bord interactif). */
  readonly tours: readonly RoundView[];
  readonly seanceEnLigne: string | null;
}

async function chargerAccueil(session: Session, g: TontineSummary): Promise<DonneesAccueil> {
  const confirme = g.roles.some((r) => CONFIRME.includes(r));
  const controle = g.roles.includes("auditor");
  const [moi, echeances, detail, miennes, scrutins, notifs, aTraiter, membres, sondages, tours] = await Promise.all([
    acces.moi(session).catch(() => null),
    acces.mesEcheances(session, g.groupId),
    tontines.detail(session, g.groupId),
    argent.mouvements(session, g.groupId, { mine: true, state: "declared" }),
    decisions.liste(session, g.groupId),
    acces.notifications(session),
    confirme || controle ? argent.mouvements(session, g.groupId, { state: controle ? "confirmed" : "declared" }) : Promise.resolve([]),
    tontines.membres(session, g.groupId).catch(() => []),
    votes.liste(session, g.groupId).catch(() => [] as PollView[]),
    cycle.tours(session, g.groupId).catch(() => [] as RoundView[]),
  ]);
  const ouvertes = echeances.filter((e) => BigInt(e.remaining) > 0n);
  const dates = ouvertes.map((e) => e.date).sort();
  const cy = detail.cycle;
  const cr = detail.currentRound;
  return {
    prenom: moi?.displayName ? (moi.displayName.trim().split(/\s+/)[0] ?? null) : null,
    reste: ouvertes.reduce((s, e) => s + BigInt(e.remaining), 0n),
    enRetard: ouvertes.some((e) => e.lateness === "late"),
    prochaineEcheance: dates[0] ?? null,
    confirme: echeances.reduce((s, e) => s + BigInt(e.confirmed), 0n),
    declare: miennes.filter((m) => m.kind === "contribution").reduce((s, m) => s + BigInt(m.amount), 0n),
    // Le serveur dit ce que MA fonction permet — jamais ma propre déclaration.
    aValider: aTraiter.filter((m) => (controle ? m.can?.control : m.can?.confirm) === true).length,
    controle,
    votes: scrutins.filter((d) => d.state === "open" && d.myChoice === null && d.can.vote),
    seance: detail.nextMeeting ? { date: detail.nextMeeting.date, lieu: detail.nextMeeting.location } : null,
    tour: cy && cr ? { rang: cr.seq - cy.firstSeq + 1, total: cy.lastSeq - cy.firstSeq + 1, round: cr } : null,
    membres: detail.memberCount,
    noms: membres.filter((m) => m.state === "active").map((m) => ({ nom: m.displayName, id: m.membershipId, version: m.photoVersion })),
    recentes: notifs.filter((n) => n.groupId === g.groupId).slice(0, 3),
    sondages: sondages.filter((p) => p.state === "open" && p.myBallot === null),
    tours,
    seanceEnLigne: detail.nextMeeting && detail.nextMeeting.format !== "in_person" ? detail.nextMeeting.onlineUrl : null,
  };
}

export function Accueil({
  session,
  groupe,
  enChargement,
  enAttente,
  aller,
}: {
  readonly session: Session;
  readonly groupe: TontineSummary | null;
  readonly enChargement: boolean;
  readonly enAttente: readonly TontineSummary[];
  readonly aller: (r: Route) => void;
}) {
  const { tx } = useTextes();
  if (enChargement) {
    return (
      <div className="pile ecran accueil" role="status" aria-busy="true" aria-label={tx("app.chargement")}>
        <SqueletteAccueil />
      </div>
    );
  }
  if (!groupe) {
    return (
      <div className="pile ecran accueil-vide">
        <h1 className="ecran-titre-simple">{tx("ho.bienvenue")}</h1>
        <p>{tx("ho.bienvenueTexte")}</p>
        {enAttente.map((g) => (
          <p key={g.groupId} className="msg msg--info">
            {tx("ho.attenteAdhesion", { nom: g.name })}
          </p>
        ))}
        <div className="actions-pile">
          <button type="button" className="bouton" onClick={() => aller({ ecran: "rejoindre" })}>
            {tx("ho.rejoindreCode")}
          </button>
          <button type="button" className="bouton bouton-secondaire" onClick={() => aller({ ecran: "creer" })}>
            {tx("sh.creer")}
          </button>
        </div>
      </div>
    );
  }
  return <AccueilGroupe key={groupe.groupId} session={session} groupe={groupe} aller={aller} />;
}

function AccueilGroupe({ session, groupe, aller }: { readonly session: Session; readonly groupe: TontineSummary; readonly aller: (r: Route) => void }) {
  const { tx, dyn, xaf, date } = useTextes();
  const { etat, recharger } = useDonnees(() => chargerAccueil(session, groupe), [session.sessionId, groupe.groupId]);
  const vers = (onglet: string) => () => aller({ ecran: "groupe", groupId: groupe.groupId, onglet });
  const visuel = useVisuelGroupe(session, groupe);
  const moi = useDonnees(() => acces.moi(session), [session.sessionId]);
  return (
    <div className="accueil-premium">
      <Charge etat={etat} recharger={recharger} squelette={<SqueletteAccueil />}>
        {(d) => (
          <>
            {/* Téléphone : bandeau forêt sous la barre (salutation, marque). */}
            <section className="bandeau-accueil" aria-label={tx("ho.bonjour")}>
              <p className="bandeau-accueil__salut">{d.prenom ? tx("ho.bonjourNom", { nom: d.prenom }) : tx("ho.bonjour")}</p>
              <p className="bandeau-accueil__marque">KÓMBE</p>
              <p className="bandeau-accueil__groupe">{tx("ho.signatureMarque")}</p>
            </section>

            <div className="accueil-grille">
              <div className="accueil-principal">
                <section className={d.enRetard ? "hero-cotisation is-retard apparition" : "hero-cotisation apparition"} aria-labelledby="situation-titre">
                  <div className="hero-cotisation__contenu">
                    <p className="hero-cotisation__sur">
                      <Icone nom="cagnotte" taille={22} />
                      {tx("ho.cotisationTour")}
                    </p>
                    {d.reste > 0n ? (
                      <>
                        <h1 id="situation-titre" className="hero-cotisation__libelle">
                          {tx("ho.aRegler")}
                        </h1>
                        <p className="hero-cotisation__montant">{xaf(d.reste.toString())}</p>
                        <p className="hero-cotisation__echeance">
                          <Icone nom="seance" taille={18} />
                          {d.enRetard ? (
                            tx("ho.enRetard")
                          ) : d.prochaineEcheance ? (
                            <>
                              <span className="seulement-bureau">{tx("ho.aReglerAvant", { date: date(d.prochaineEcheance) })}</span>
                              <span className="seulement-telephone">{tx("ho.avant", { date: date(d.prochaineEcheance) })}</span>
                            </>
                          ) : (
                            tx("ho.tourEnCours")
                          )}
                        </p>
                        <button type="button" className="bouton hero-cotisation__cta" onClick={vers("argent")}>
                          <Icone nom="declarer" taille={20} />
                          {tx("ho.declarer")}
                        </button>
                      </>
                    ) : (
                      <h1 id="situation-titre" className="hero-cotisation__ajour">
                        <Icone nom="coche" taille={26} />
                        {tx("ho.aJour")}
                      </h1>
                    )}
                    {groupe.cyclePosition ? (
                      <div className="hero-cotisation__cycle">
                        <BandeCycle courant={groupe.cyclePosition.current} total={groupe.cyclePosition.total} libelle={tx("gr.cycle", { n: groupe.cyclePosition.current, total: groupe.cyclePosition.total })} />
                        <span>{tx("gr.cycle", { n: groupe.cyclePosition.current, total: groupe.cyclePosition.total })}</span>
                      </div>
                    ) : null}
                  </div>
                  {visuel ? <span className="hero-cotisation__visuel" aria-hidden="true" style={{ backgroundImage: `url("${visuel}")` }} /> : null}
                </section>

                {d.declare > 0n ? (
                  <button type="button" className="ligne-attente apparition" onClick={() => aller({ ecran: "cotisations" })}>
                    <Icone nom="attente" taille={20} />
                    <span>{tx("ho.enAttente", { montant: xaf(d.declare.toString()) })}</span>
                    <Icone nom="chevron" taille={18} />
                  </button>
                ) : null}

                {moi.etat.statut === "ok" && !moi.etat.donnees.photoVersion ? (
                  <button type="button" className="ligne-attente apparition" onClick={() => aller({ ecran: "profil" })}>
                    <Icone nom="plus" taille={20} />
                    <span>{tx("ho.ajouterPhoto")}</span>
                    <Icone nom="chevron" taille={18} />
                  </button>
                ) : null}

                <nav className="actions-rapides apparition" aria-label={tx("ho.actionsRapides")}>
                  <Tuile icone="declarer" libelle={tx("ho.declarer")} onClick={vers("argent")} accent />
                  {groupe.roles.some((r) => CONFIRME.includes(r) || r === "auditor") ? (
                    <Tuile icone="validations" libelle={tx(d.controle ? "ho.tuileControler" : "ho.tuileConfirmer")} badge={d.aValider} onClick={() => aller({ ecran: "validations" })} />
                  ) : (
                    <Tuile icone="registre" libelle={tx("ho.tuileHistorique")} onClick={() => aller({ ecran: "cotisations" })} />
                  )}
                  <Tuile icone="vote" libelle={tx("ho.tuileVoter")} badge={d.votes.length + d.sondages.length} onClick={vers("decisions")} />
                  <Tuile icone="seance" libelle={tx("ho.tuileSeances")} onClick={vers("seances")} />
                </nav>

                {d.tours.length > 0 ? <TableauDeBord tours={d.tours} courant={d.tour?.round.seq ?? null} ouvrirTours={vers("tours")} /> : null}

                <div className="accueil-duo">
                  <Section
                    titre={tx("ho.aFaire")}
                    icone="alerte"
                    compte={d.aValider + d.votes.length + d.sondages.length}
                    action={
                      <button type="button" className="bouton-texte" onClick={() => aller({ ecran: "notifications" })}>
                        {tx("ho.toutVoir")}
                      </button>
                    }
                  >
                    {d.aValider > 0 || d.votes.length > 0 || d.sondages.length > 0 ? (
                      <ul className="lignes carte-liste">
                        {d.aValider > 0 ? (
                          <Ligne
                            icone="validations"
                            titre={tx(d.controle ? "ho.aControler" : "ho.aConfirmer", { n: d.aValider })}
                            sousTitre={tx("ho.votreFonction")}
                            onClick={() => aller({ ecran: "validations" })}
                          />
                        ) : null}
                        {d.votes.map((v) => (
                          <Ligne
                            key={v.decisionId}
                            icone="vote"
                            titre={tx("ho.vote", { titre: dyn(`dc.k.${v.kind}`) })}
                            sousTitre={tx("ho.jusquAu", { date: date(v.closesAt) })}
                            onClick={vers("decisions")}
                          />
                        ))}
                        {d.sondages.map((p) => (
                          <Ligne key={p.pollId} icone="vote" titre={p.question} sousTitre={tx("ho.sondage", { nom: p.createdByName })} onClick={vers("decisions")} />
                        ))}
                      </ul>
                    ) : (
                      <p className="aide-champ carte-liste carte-liste--vide">{tx("ho.rienDeNeuf")}</p>
                    )}
                  </Section>

                  {d.seance ? (
                    <Section titre={tx("ho.seance")} icone="seance">
                      <button type="button" className="carte-seance" onClick={vers("seances")}>
                        <span className="carte-seance__vignette" aria-hidden="true" />
                        <span className="carte-seance__icone" aria-hidden="true">
                          <Icone nom="seance" taille={24} />
                        </span>
                        <span className="carte-seance__texte">
                          <span className="carte-seance__sur">{tx("ho.seance")}</span>
                          <span className="carte-seance__date">{date(d.seance.date)}</span>
                          {d.seanceEnLigne ? (
                            <span className="carte-seance__lieu">
                              <Icone nom="monde" taille={16} />
                              {tx("se.enLigne")}
                            </span>
                          ) : null}
                          {d.seance.lieu ? (
                            <span className="carte-seance__lieu">
                              <Icone nom="monde" taille={16} />
                              {d.seance.lieu}
                            </span>
                          ) : null}
                        </span>
                        <Icone nom="chevron" taille={20} />
                      </button>
                    </Section>
                  ) : null}
                </div>

                <Section
                  titre={tx("ho.activite")}
                  icone="historique"
                  action={
                    <button type="button" className="bouton-texte" onClick={() => aller({ ecran: "notifications" })}>
                      {tx("ho.toutVoir")} →
                    </button>
                  }
                >
                  {d.recentes.length === 0 ? (
                    <p className="aide-champ carte-liste carte-liste--vide">{tx("ho.rienDeNeuf")}</p>
                  ) : (
                    <ul className="lignes carte-liste">
                      {d.recentes.map((n) => (
                        <LigneNotification key={n.notificationId} n={n} session={session} aller={aller} />
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              <aside className="accueil-rail" aria-label={tx("ho.cycleEnCours")}>
                {d.tour ? (
                  <section className="carte-rail">
                    <h2 className="carte-rail__titre">
                      <Icone nom="cycle" taille={20} />
                      {tx("ho.cycleEnCours")}
                    </h2>
                    <p className="carte-rail__grand">{tx("ho.cycleN", { n: d.tour.rang, total: d.tour.total })}</p>
                    <BandeCycle courant={d.tour.rang} total={d.tour.total} libelle={tx("ho.progressionCycle")} clair />
                    <ul className="carte-rail__chiffres">
                      <li>
                        <span className="carte-rail__pastille carte-rail__pastille--or" aria-hidden="true">
                          <Icone nom="cagnotte" taille={18} />
                        </span>
                        <span>
                          <span className="carte-rail__libelle">{tx("ho.totalTour")}</span>
                          <span className="carte-rail__valeur">{xaf(d.tour.round.expectedPot)}</span>
                        </span>
                      </li>
                      <li>
                        <span className="carte-rail__pastille carte-rail__pastille--jade" aria-hidden="true">
                          <Icone nom="coche" taille={18} />
                        </span>
                        <span>
                          <span className="carte-rail__libelle">{tx("ho.dejaConfirme")}</span>
                          <span className="carte-rail__valeur">{xaf(d.tour.round.collected)}</span>
                        </span>
                      </li>
                      <li>
                        <span className="carte-rail__pastille carte-rail__pastille--or" aria-hidden="true">
                          <Icone nom="attente" taille={18} />
                        </span>
                        <span>
                          <span className="carte-rail__libelle">{tx("ho.restantTour")}</span>
                          <span className="carte-rail__valeur">
                            {xaf((BigInt(d.tour.round.expectedPot) > BigInt(d.tour.round.collected) ? BigInt(d.tour.round.expectedPot) - BigInt(d.tour.round.collected) : 0n).toString())}
                          </span>
                        </span>
                      </li>
                    </ul>
                  </section>
                ) : null}
                <button type="button" className="carte-rail carte-rail--membres" onClick={vers("membres")}>
                  <span className="carte-rail__titre">
                    <Icone nom="personnes" taille={20} />
                    {tx("ho.membresN", { n: d.membres })}
                    <Icone nom="chevron" taille={18} />
                  </span>
                  <span className="pile-avatars" aria-hidden="true">
                    {d.noms.slice(0, 4).map((n) => (
                      <AvatarPersonne key={n.id} session={session} groupId={groupe.groupId} membreId={n.id} nom={n.nom} version={n.version} taille={40} />
                    ))}
                    {d.membres > 4 ? <span className="pile-avatars__un pile-avatars__plus">+{d.membres - 4}</span> : null}
                  </span>
                </button>
                <section className="carte-promo">
                  <Icone nom="personnes" taille={26} />
                  <h2>{tx("ho.promoTitre")}</h2>
                  <p>{tx("ho.promoTexte")}</p>
                </section>
              </aside>
            </div>
          </>
        )}
      </Charge>
    </div>
  );
}

/**
 * Tableau de bord interactif : « Ce tour » (jauge de la collecte) ou « Tout le
 * cycle » (une barre par tour, à toucher pour voir son détail). Les chiffres
 * sont ceux du serveur ; rien n'est estimé.
 */
function TableauDeBord({ tours, courant, ouvrirTours }: { readonly tours: readonly RoundView[]; readonly courant: number | null; readonly ouvrirTours: () => void }) {
  const { tx, xaf, date } = useTextes();
  const [vue, setVue] = useState<"tour" | "cycle">("tour");
  const [choisi, setChoisi] = useState<number | null>(courant ?? tours[tours.length - 1]?.seq ?? null);
  const tour = tours.find((r) => r.seq === (vue === "tour" ? (courant ?? choisi) : choisi)) ?? tours[0];
  if (!tour) return null;
  const pct = (r: RoundView) => {
    const e = BigInt(r.expectedPot);
    return e > 0n ? Number((BigInt(r.collected) * 100n) / e) : 0;
  };
  const totalAttendu = tours.reduce((s, r) => s + BigInt(r.expectedPot), 0n);
  const totalRecu = tours.reduce((s, r) => s + BigInt(r.collected), 0n);
  const remis = tours.filter((r) => r.payoutState === "received" || r.state === "closed").length;
  return (
    <section className="tableau-bord section-accueil apparition" aria-labelledby="tb-titre">
      <div className="titre-section titre-section--action">
        <h2 id="tb-titre">
          <Icone nom="cycle" taille={22} />
          {tx("tb.titre")}
        </h2>
        <div className="segments" role="tablist" aria-label={tx("tb.titre")}>
          {(["tour", "cycle"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={vue === v} className="segments__bouton" onClick={() => setVue(v)}>
              {tx(v === "tour" ? "tb.ceTour" : "tb.cycle")}
            </button>
          ))}
        </div>
      </div>
      {vue === "tour" ? (
        <button type="button" className="tableau-bord__jauge" onClick={ouvrirTours}>
          <span className="tableau-bord__chiffres">
            <span className="tableau-bord__grand">{pct(tour)} %</span>
            <span className="aide-champ">{tx("tb.collecte", { recu: xaf(tour.collected), attendu: xaf(tour.expectedPot) })}</span>
          </span>
          <span className="tableau-bord__barre" aria-hidden="true">
            <span style={{ width: `${Math.min(100, pct(tour))}%` }} />
          </span>
          <span className="aide-champ">
            {tx("tb.tourDe", { n: tour.seq, date: date(tour.date) })}
            {tour.beneficiaryName ? ` · ${tour.shareLabel && tour.shareLabel !== tour.beneficiaryName ? `${tour.shareLabel} (${tour.beneficiaryName})` : tour.beneficiaryName}` : ""}
          </span>
        </button>
      ) : (
        <div className="pile">
          <p className="aide-champ">{tx("tb.resumeCycle", { remis, total: tours.length, recu: xaf(totalRecu.toString()), attendu: xaf(totalAttendu.toString()) })}</p>
          <div className="tableau-bord__histo" role="group" aria-label={tx("tb.cycle")}>
            {tours.map((r) => (
              <button
                key={r.seq}
                type="button"
                className={["tableau-bord__colonne", r.seq === courant ? "is-courant" : "", r.seq === choisi ? "is-choisi" : ""].filter(Boolean).join(" ")}
                aria-pressed={r.seq === choisi}
                aria-label={tx("tb.colonne", { n: r.seq, pct: pct(r) })}
                onClick={() => setChoisi(r.seq)}
              >
                <span style={{ height: `${Math.max(4, Math.min(100, pct(r)))}%` }} />
              </button>
            ))}
          </div>
          {choisi !== null ? (
            <div className="tableau-bord__detail">
              <span>
                <strong>{tx("tb.tourDe", { n: tour.seq, date: date(tour.date) })}</strong>
                <span className="aide-champ">
                  {tour.shareLabel ?? tour.beneficiaryName ?? "—"} · {tx("tb.collecte", { recu: xaf(tour.collected), attendu: xaf(tour.expectedPot) })}
                </span>
              </span>
              <button type="button" className="bouton-texte" onClick={ouvrirTours}>
                {tx("ho.toutVoir")} →
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Visuel du héros : la photo du groupe si elle existe ; sinon rien, le motif Ndop de la surface suffit. */
function useVisuelGroupe(session: Session, groupe: TontineSummary): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const v = groupe.photoVersion;
    if (!v) return;
    let vivant = true;
    lirePhotoGroupe(session, groupe.groupId, v, 512).then(
      (b) => b && vivant && setUrl(URL.createObjectURL(b)),
      () => undefined,
    );
    return () => {
      vivant = false;
    };
  }, [session, groupe.groupId, groupe.photoVersion]);
  return url;
}

function Section({
  titre,
  icone,
  compte,
  action,
  children,
}: {
  readonly titre: string;
  readonly icone?: NomIcone;
  readonly compte?: number;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="section-accueil apparition">
      <div className="titre-section titre-section--action">
        <h2>
          {icone ? <Icone nom={icone} taille={22} /> : null}
          {titre}
          {compte ? <span className="pastille-compte">{compte}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tuile({ icone, libelle, onClick, badge, accent }: { readonly icone: NomIcone; readonly libelle: string; readonly onClick: () => void; readonly badge?: number; readonly accent?: boolean }) {
  return (
    <button type="button" className={accent ? "tuile-action tuile-action--accent" : "tuile-action"} onClick={onClick}>
      <span className="tuile-action__icone" aria-hidden="true">
        <Icone nom={icone} taille={24} />
        {badge ? <span className="tuile-action__badge">{badge}</span> : null}
      </span>
      <span className="tuile-action__libelle">{libelle}</span>
      {badge ? <span className="visuellement-cache">({badge})</span> : null}
    </button>
  );
}

function Ligne({
  icone,
  titre,
  sousTitre,
  onClick,
  nonLue,
  famille,
}: {
  readonly icone: NomIcone;
  readonly titre: string;
  readonly sousTitre?: string | undefined;
  readonly onClick: () => void;
  readonly nonLue?: boolean;
  readonly famille?: string;
}) {
  return (
    <li data-famille={famille}>
      <button type="button" className={nonLue ? "ligne ligne--nonlue" : "ligne"} onClick={onClick}>
        <span className="ligne__icone" aria-hidden="true">
          <Icone nom={icone} taille={22} />
        </span>
        <span className="ligne__texte">
          <span className="ligne__titre">{titre}</span>
          {sousTitre ? <span className="ligne__sous">{sousTitre}</span> : null}
        </span>
        {nonLue ? <span className="ligne__point" aria-label="non lue" /> : <Icone nom="chevron" taille={18} />}
      </button>
    </li>
  );
}

/** Ouvre la destination contrôlée et marque la notification lue. */
export function ouvrirNotification(session: Session, n: NotificationView, aller: (r: Route) => void): void {
  if (!n.read) void acces.marquerLues(session, [n.notificationId]).catch(() => undefined);
  const d = destinationNotification(n);
  if (d) aller(d);
}

/** Catégories historiques : le libellé par nature (`topic`) y est le plus précis. */
const KINDS_HISTORIQUES = new Set([
  "meeting_reminder", "due_reminder", "validation_waiting", "payout_recorded", "fine_issued",
  "aid_decided", "order_change", "membership", "minutes_ready", "general", "decision",
]);

function LigneNotification({ n, session, aller }: { readonly n: NotificationView; readonly session: Session; readonly aller: (r: Route) => void }) {
  const { tx, date, dyn, instant, xaf } = useTextes();
  const e = entreeNotification(n);
  // Types précis de l'ADR-0042 (statuts, relances, cycle…) : titre par type et
  // palier ; dans tous les cas, ligne de détail tirée de `params`.
  const t = texteNotification(n, { dyn, instant, date, xaf });
  const titre = KINDS_HISTORIQUES.has(n.kind) || n.kind === "due_reminder" ? (n.params?.stage ? t.titre : tx(e.cle as CleTexte)) : t.titre;
  return (
    <Ligne
      icone={e.icone}
      titre={titre}
      sousTitre={[t.detail || (n.groupName ?? ""), date(n.createdAt)].filter(Boolean).join(" · ")}
      nonLue={!n.read}
      famille={familleNotification(n)}
      onClick={() => ouvrirNotification(session, n, aller)}
    />
  );
}

/* ── Activité : filtres et regroupement par jour ───────────────────────── */

type Filtre = "tout" | "argent" | "votes" | "seances" | "groupe";
const FAMILLE: Readonly<Record<string, Filtre>> = {
  declared: "argent", toControl: "argent", rejected: "argent", due: "argent", payout: "argent", received: "argent",
  reserve: "argent", fund: "argent", aid: "argent", aidDecision: "argent", aidPaid: "argent",
  decision: "votes", "decision-closed": "votes", "decision-lifted": "votes", swap: "votes", "swap-ready": "votes",
  meetingSoon: "seances", minutes: "seances", meetingOpen: "seances", voteSoon: "votes",
  poll: "votes", meetingUpdate: "seances", fineRefunded: "argent", fineRefundDue: "argent",
};

/**
 * Regroupe les notifications de même nature dans un même groupe (ex. trois
 * rappels de cotisation) : une seule ligne, dépliable. L'ordre (la plus
 * récente d'abord) est conservé ; une notification isolée reste seule.
 */
export function regrouperNotifications(liste: readonly NotificationView[]): readonly (readonly NotificationView[])[] {
  const paquets = new Map<string, NotificationView[]>();
  const ordre: string[] = [];
  for (const n of liste) {
    const cle = `${n.kind}|${n.topic ?? ""}|${n.groupId ?? ""}`;
    if (!paquets.has(cle)) {
      paquets.set(cle, []);
      ordre.push(cle);
    }
    (paquets.get(cle) as NotificationView[]).push(n);
  }
  return ordre.map((c) => paquets.get(c) as NotificationView[]);
}

function PaquetNotifications({ items, session, aller }: { readonly items: readonly NotificationView[]; readonly session: Session; readonly aller: (r: Route) => void }) {
  const { tx, date, dyn, instant, xaf } = useTextes();
  const [ouvert, setOuvert] = useState(false);
  const tete = items[0] as NotificationView;
  if (items.length === 1) return <LigneNotification n={tete} session={session} aller={aller} />;
  const e = entreeNotification(tete);
  const t = texteNotification(tete, { dyn, instant, date, xaf });
  const nonLues = items.filter((n) => !n.read).length;
  return (
    <li data-famille={familleNotification(tete)} className="paquet-notif">
      <button type="button" className={nonLues ? "ligne ligne--nonlue" : "ligne"} aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <span className="ligne__icone" aria-hidden="true">
          <Icone nom={e.icone} taille={22} />
          <span className="paquet-notif__compte">{items.length}</span>
        </span>
        <span className="ligne__texte">
          <span className="ligne__titre">{t.titre}</span>
          <span className="ligne__sous">
            {[tete.groupName ?? "", tx("ac.paquet", { n: items.length }), nonLues ? tx("ac.nonLues", { n: nonLues }) : ""].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Icone nom="chevron" taille={18} />
      </button>
      {ouvert ? (
        <ul className="lignes paquet-notif__detail">
          {items.map((n) => (
            <LigneNotification key={n.notificationId} n={n} session={session} aller={aller} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
export const familleNotification = (n: Pick<NotificationView, "topic">): Filtre => FAMILLE[n.topic ?? ""] ?? "groupe";

export function periodeNotification(iso: string, maintenant: Date): "aujourdhui" | "semaine" | "avant" {
  const d = new Date(iso);
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(maintenant) - jour(d)) / 86_400_000);
  return ecart <= 0 ? "aujourdhui" : ecart < 7 ? "semaine" : "avant";
}

export function Notifications({ session, aller }: { readonly session: Session; readonly aller: (r: Route) => void }) {
  const { tx } = useTextes();
  const { etat, recharger } = useDonnees(() => acces.notifications(session), [session.sessionId]);
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const filtres: readonly [Filtre, CleTexte][] = [
    ["tout", "ac.tout"],
    ["argent", "ac.argent"],
    ["votes", "ac.votes"],
    ["seances", "ac.seances"],
    ["groupe", "ac.decisions"],
  ];
  return (
    <div className="pile ecran activite">
      <div className="titre-section titre-section--action">
        <div>
          <h1 className="ecran-titre-simple">{tx("nav.activite")}</h1>
          <p className="ecran-sous-titre">{tx("ac.sousTitre")}</p>
        </div>
        {etat.statut === "ok" && etat.donnees.some((n) => !n.read) ? (
          <button type="button" className="bouton-texte" onClick={() => void acces.marquerLues(session, "all").then(recharger, recharger)}>
            {tx("no.toutLu")}
          </button>
        ) : null}
      </div>
      <div className="filtres" role="group" aria-label={tx("ac.filtrer")}>
        {filtres.map(([f, cle]) => (
          <button key={f} type="button" className="filtre" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
            {tx(cle)}
          </button>
        ))}
      </div>
      <Charge etat={etat} recharger={recharger} squelette={<SqueletteLignes />}>
        {(liste) => {
          const visibles = liste.filter((n) => filtre === "tout" || familleNotification(n) === filtre);
          if (visibles.length === 0) return <p className="msg">{tx("no.aucune")}</p>;
          const maintenant = new Date();
          const groupes: readonly ["aujourdhui" | "semaine" | "avant", CleTexte][] = [
            ["aujourdhui", "ac.aujourdhui"],
            ["semaine", "ac.semaine"],
            ["avant", "ac.avant"],
          ];
          return (
            <>
              {groupes.map(([p, cle]) => {
                const items = visibles.filter((n) => periodeNotification(n.createdAt, maintenant) === p);
                return items.length ? (
                  <section key={p} aria-labelledby={`ac-${p}`}>
                    <h2 id={`ac-${p}`} className="titre-section">
                      {tx(cle)}
                    </h2>
                    <ul className="lignes">
                      {regrouperNotifications(items).map((paquet) => (
                        <PaquetNotifications key={(paquet[0] as NotificationView).notificationId} items={paquet} session={session} aller={aller} />
                      ))}
                    </ul>
                  </section>
                ) : null;
              })}
            </>
          );
        }}
      </Charge>
    </div>
  );
}

/** Silhouette de l'accueil : mêmes blocs que le contenu réel, aucune valeur. */
function SqueletteAccueil() {
  return (
    <div className="pile" aria-hidden="true">
      <div className="squelette squelette--titre" />
      <div className="squelette squelette--carte" />
      <div className="squelette squelette--tuiles" />
      <div className="squelette squelette--ligne" />
      <div className="squelette squelette--ligne" />
    </div>
  );
}

function SqueletteLignes() {
  return (
    <div className="pile" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="squelette squelette--ligne" />
      ))}
    </div>
  );
}
