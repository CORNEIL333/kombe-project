/* KÓMBE — accueil du groupe actif. Emplacements STABLES, dans cet ordre :
   1. ma situation (reste dû réel, retard, déclaré en attente) et l'action
      principale ; 2. « À faire » (confirmations de ma fonction, vote ouvert) ;
   3. prochaine séance ; 4. activité récente du groupe, chaque ligne menant à
   l'action. Lectures en parallèle ; une donnée absente reste absente. Même
   contrat que l'accueil de l'app mobile. */

import type { Route } from "../App.js";
import { acces, argent, decisions, tontines, type DecisionView, type NotificationView, type Session, type TontineSummary } from "./api.js";
import { Charge, useDonnees } from "./ui.js";
import { Icone } from "../composants/Icones.js";
import { useTextes, type CleTexte } from "./textes.js";
import { destinationNotification, entreeNotification } from "./notifications.js";

const CONFIRME = ["treasurer", "treasurer_deputy", "animator", "vice_president"];

interface DonneesAccueil {
  readonly reste: bigint;
  readonly enRetard: boolean;
  readonly prochaineEcheance: string | null;
  readonly declare: bigint;
  readonly aValider: number;
  readonly controle: boolean;
  readonly votes: readonly DecisionView[];
  readonly seance: { readonly date: string; readonly lieu: string | null } | null;
  readonly recentes: readonly NotificationView[];
}

async function chargerAccueil(session: Session, g: TontineSummary): Promise<DonneesAccueil> {
  const confirme = g.roles.some((r) => CONFIRME.includes(r));
  const controle = g.roles.includes("auditor");
  const [echeances, detail, miennes, scrutins, notifs, aTraiter] = await Promise.all([
    acces.mesEcheances(session, g.groupId),
    tontines.detail(session, g.groupId),
    argent.mouvements(session, g.groupId, { mine: true, state: "declared" }),
    decisions.liste(session, g.groupId),
    acces.notifications(session),
    confirme || controle ? argent.mouvements(session, g.groupId, { state: controle ? "confirmed" : "declared" }) : Promise.resolve([]),
  ]);
  const ouvertes = echeances.filter((e) => BigInt(e.remaining) > 0n);
  const dates = ouvertes.map((e) => e.date).sort();
  return {
    reste: ouvertes.reduce((s, e) => s + BigInt(e.remaining), 0n),
    enRetard: ouvertes.some((e) => e.lateness === "late"),
    prochaineEcheance: dates[0] ?? null,
    declare: miennes.filter((m) => m.kind === "contribution").reduce((s, m) => s + BigInt(m.amount), 0n),
    // Le serveur dit ce que MA fonction permet — jamais ma propre déclaration.
    aValider: aTraiter.filter((m) => (controle ? m.can?.control : m.can?.confirm) === true).length,
    controle,
    votes: scrutins.filter((d) => d.state === "open" && d.myChoice === null && d.can.vote),
    seance: detail.nextMeeting ? { date: detail.nextMeeting.date, lieu: detail.nextMeeting.location } : null,
    recentes: notifs.filter((n) => n.groupId === g.groupId).slice(0, 3),
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
  /** Adhésions en attente d'accord du bureau. */
  readonly enAttente: readonly TontineSummary[];
  readonly aller: (r: Route) => void;
}) {
  const { tx } = useTextes();
  if (enChargement) return <p className="msg" role="status">{tx("app.chargement")}</p>;
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
  return (
    <div className="pile ecran accueil">
      <Charge etat={etat} recharger={recharger}>
        {(d) => (
          <>
            <section className="situation" aria-labelledby="situation-titre">
              {d.reste > 0n ? (
                <>
                  <h1 id="situation-titre" className="situation__libelle">
                    {tx("ho.aRegler")}
                  </h1>
                  <p className="situation__montant">{xaf(d.reste.toString())}</p>
                  <p className={d.enRetard ? "situation__echeance situation__echeance--retard" : "situation__echeance"}>
                    {d.enRetard ? tx("ho.enRetard") : d.prochaineEcheance ? tx("ho.avant", { date: date(d.prochaineEcheance) }) : tx("ho.tourEnCours")}
                  </p>
                  <button type="button" className="bouton bouton-large" onClick={() => aller({ ecran: "groupe", groupId: groupe.groupId, onglet: "argent" })}>
                    <Icone nom="declarer" taille={20} />
                    {tx("ho.declarer")}
                  </button>
                </>
              ) : (
                <h1 id="situation-titre" className="situation__ajour">
                  <Icone nom="coche" taille={26} />
                  {tx("ho.aJour")}
                </h1>
              )}
              {d.declare > 0n ? (
                <button type="button" className="lien-ligne" onClick={() => aller({ ecran: "cotisations" })}>
                  <Icone nom="attente" taille={18} />
                  <span>{tx("ho.enAttente", { montant: xaf(d.declare.toString()) })}</span>
                  <Icone nom="chevron" taille={18} />
                </button>
              ) : null}
              {groupe.myPayoutDate ? <p className="aide-champ">{tx("ho.remise", { date: date(groupe.myPayoutDate) })}</p> : null}
            </section>

            {d.aValider > 0 || d.votes.length > 0 ? (
              <section aria-labelledby="afaire-titre">
                <h2 id="afaire-titre" className="titre-section">
                  {tx("ho.aFaire")}
                </h2>
                <ul className="lignes">
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
                      onClick={() => aller({ ecran: "groupe", groupId: groupe.groupId, onglet: "decisions" })}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {d.seance ? (
              <section aria-labelledby="seance-titre">
                <h2 id="seance-titre" className="titre-section">
                  {tx("ho.seance")}
                </h2>
                <ul className="lignes">
                  <Ligne
                    icone="seance"
                    titre={date(d.seance.date)}
                    sousTitre={d.seance.lieu ?? undefined}
                    onClick={() => aller({ ecran: "groupe", groupId: groupe.groupId, onglet: "seances" })}
                  />
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="activite-titre">
              <div className="titre-section titre-section--action">
                <h2 id="activite-titre">{tx("ho.activite")}</h2>
                <button type="button" className="bouton-texte" onClick={() => aller({ ecran: "notifications" })}>
                  {tx("ho.toutVoir")}
                </button>
              </div>
              {d.recentes.length === 0 ? (
                <p className="aide-champ">{tx("ho.rienDeNeuf")}</p>
              ) : (
                <ul className="lignes">
                  {d.recentes.map((n) => (
                    <LigneNotification key={n.notificationId} n={n} session={session} aller={aller} />
                  ))}
                </ul>
              )}
            </section>

            <p>
              <button type="button" className="bouton bouton-secondaire" onClick={() => aller({ ecran: "groupe", groupId: groupe.groupId })}>
                {tx("sh.toutLeGroupe")}
              </button>
            </p>
          </>
        )}
      </Charge>
    </div>
  );
}

function Ligne({
  icone,
  titre,
  sousTitre,
  onClick,
  nonLue,
}: {
  readonly icone: Parameters<typeof Icone>[0]["nom"];
  readonly titre: string;
  readonly sousTitre?: string | undefined;
  readonly onClick: () => void;
  readonly nonLue?: boolean;
}) {
  return (
    <li>
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

function LigneNotification({ n, session, aller, onLue }: { readonly n: NotificationView; readonly session: Session; readonly aller: (r: Route) => void; readonly onLue?: () => void }) {
  const { tx, date } = useTextes();
  const e = entreeNotification(n);
  return (
    <Ligne
      icone={e.icone}
      titre={tx(e.cle as CleTexte)}
      sousTitre={[n.groupName ?? "", date(n.createdAt)].filter(Boolean).join(" · ")}
      nonLue={!n.read}
      onClick={() => {
        onLue?.();
        ouvrirNotification(session, n, aller);
      }}
    />
  );
}

export function Notifications({ session, aller }: { readonly session: Session; readonly aller: (r: Route) => void }) {
  const { tx } = useTextes();
  const { etat, recharger } = useDonnees(() => acces.notifications(session), [session.sessionId]);
  return (
    <div className="pile ecran">
      <div className="titre-section titre-section--action">
        <h1 className="ecran-titre-simple">{tx("nav.activite")}</h1>
        {etat.statut === "ok" && etat.donnees.some((n) => !n.read) ? (
          <button type="button" className="bouton-texte" onClick={() => void acces.marquerLues(session, "all").then(recharger, recharger)}>
            {tx("no.toutLu")}
          </button>
        ) : null}
      </div>
      <Charge etat={etat} recharger={recharger}>
        {(liste) => {
          if (liste.length === 0) return <p className="msg">{tx("no.aucune")}</p>;
          const nonLues = liste.filter((n) => !n.read);
          const lues = liste.filter((n) => n.read);
          return (
            <>
              {nonLues.length ? (
                <section aria-labelledby="no-nonlues">
                  <h2 id="no-nonlues" className="titre-section">
                    {tx("no.nonLues", { n: nonLues.length })}
                  </h2>
                  <ul className="lignes">
                    {nonLues.map((n) => (
                      <LigneNotification key={n.notificationId} n={n} session={session} aller={aller} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {lues.length ? (
                <section aria-labelledby="no-lues">
                  <h2 id="no-lues" className="titre-section">
                    {tx("no.plusTot")}
                  </h2>
                  <ul className="lignes">
                    {lues.map((n) => (
                      <LigneNotification key={n.notificationId} n={n} session={session} aller={aller} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          );
        }}
      </Charge>
    </div>
  );
}

