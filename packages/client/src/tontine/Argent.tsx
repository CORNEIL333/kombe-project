/* KÓMBE — cotisations et mouvements (L-05, L-07, L-16, I-08).
   Circuit : déclaré (une personne) → confirmé (trésorier, jamais sa propre
   déclaration) → validé (commissaire aux comptes si le groupe en a un).
   KÓMBE ne déplace aucun argent : chaque ligne est la déclaration d'un
   paiement fait en espèces, Orange Money, MTN MoMo ou banque. */

import { useMemo, useState, type ReactNode } from "react";
import type { PaymentChannel } from "@kombe/domain";
import { argent, tontines, type DueView, type MemberView, type MovementView } from "./api.js";
import { peut } from "./droits.js";
import { Carte, Champ, ChampMontant, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

export const CANAUX: readonly PaymentChannel[] = ["cash", "orange_money", "mtn_momo", "bank", "international_transfer", "other"];

export function tonMouvement(state: MovementView["state"]): "neutre" | "attente" | "ok" | "alerte" {
  return state === "validated" ? "ok" : state === "rejected" ? "alerte" : state === "confirmed" ? "ok" : "attente";
}

export function FormulaireDeclaration({
  ctx,
  echeance,
  pourMembre,
  meetingId,
  onFini,
}: {
  readonly ctx: ContexteGroupe;
  readonly echeance?: DueView;
  readonly pourMembre?: MemberView;
  readonly meetingId?: string;
  readonly onFini: () => void;
}) {
  const { tx, dyn } = useTextes();
  const g = ctx.groupe;
  const caissesCotisation = g.funds.filter((f) => f.state === "active" && f.kind !== "loan" && f.kind !== "collector");
  const [fundId, setFundId] = useState(echeance?.fundId ?? caissesCotisation.find((f) => f.kind === "rotation")?.fundId ?? caissesCotisation[0]?.fundId ?? "");
  const [montant, setMontant] = useState(echeance?.remaining ?? (pourMembre ? g.settings.contributionPerShare : ""));
  const [canal, setCanal] = useState<PaymentChannel>("cash");
  const [reference, setReference] = useState("");
  const [payeur, setPayeur] = useState("");
  const action = useAction();
  const mobile = canal === "orange_money" || canal === "mtn_momo" || canal === "bank" || canal === "international_transfer";
  const roundSeq = echeance?.roundSeq ?? (pourMembre ? g.currentRound?.seq : undefined);

  const envoyer = async () => {
    const r = await action.lancer(
      () =>
        argent.declarer(ctx.session, g.groupId, {
          fundId,
          kind: "contribution",
          amount: montant,
          channel: canal,
          ...(roundSeq ? { roundSeq } : {}),
          ...(pourMembre ? { membershipId: pourMembre.membershipId } : {}),
          ...(meetingId ? { meetingId } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(payeur.trim() ? { payerNote: payeur.trim() } : {}),
        }),
      tx("ar.declare"),
    );
    if (r) setTimeout(onFini, 900);
  };

  return (
    <form
      className="pile formulaire-encart"
      onSubmit={(e) => {
        e.preventDefault();
        void envoyer();
      }}
    >
      <h4>
        {tx("ar.declarer")}
        {pourMembre ? ` — ${pourMembre.displayName}` : ""}
      </h4>
      {echeance ? null : (
        <Champ id="dec-caisse" libelle={tx("ar.caisse")}>
          <select id="dec-caisse" value={fundId} onChange={(e) => setFundId(e.target.value)}>
            {caissesCotisation.map((f) => (
              <option key={f.fundId} value={f.fundId}>
                {dyn(`caisse.${f.kind}`)}
              </option>
            ))}
          </select>
        </Champ>
      )}
      <ChampMontant id="dec-montant" libelle={tx("ar.montant")} valeur={montant} onChange={setMontant} />
      <Champ id="dec-canal" libelle={tx("ar.canal")}>
        <select id="dec-canal" value={canal} onChange={(e) => setCanal(e.target.value as PaymentChannel)}>
          {CANAUX.map((c) => (
            <option key={c} value={c}>
              {dyn(`ar.canal.${c}`)}
            </option>
          ))}
        </select>
      </Champ>
      {mobile ? (
        <Champ id="dec-ref" libelle={tx("ar.reference")} aide={tx("ar.referenceAide")}>
          <input id="dec-ref" value={reference} maxLength={64} required onChange={(e) => setReference(e.target.value)} aria-describedby="dec-ref-aide" />
        </Champ>
      ) : null}
      {pourMembre ? (
        <Champ id="dec-payeur" libelle={tx("ar.payeurNote")}>
          <input id="dec-payeur" value={payeur} maxLength={120} onChange={(e) => setPayeur(e.target.value)} />
        </Champ>
      ) : null}
      <Retour erreur={action.erreur} succes={action.succes} />
      <div className="actions-formulaire">
        <button type="button" className="bouton bouton-secondaire" onClick={onFini}>
          {tx("app.annuler")}
        </button>
        <button type="submit" className="bouton" disabled={action.enCours || !fundId || !montant || BigInt(montant || "0") <= 0n || (mobile && reference.trim().length === 0)}>
          {action.enCours ? tx("app.envoi") : tx("ar.declarer")}
        </button>
      </div>
    </form>
  );
}

export function LigneMouvement({ m, actions }: { readonly m: MovementView; readonly actions?: ReactNode }) {
  const { tx, dyn, xaf, date } = useTextes();
  const pourCompte = m.declaredByName && m.memberName && m.declaredByName !== m.memberName;
  return (
    <li className="liste__ligne liste__ligne--haute">
      <div>
        <strong>
          {dyn(`ar.type.${m.kind}`)} · {xaf(m.amount)}
        </strong>
        <span className="aide-champ">
          {m.memberName ?? ""}
          {m.roundSeq ? ` · ${tx("ar.tour")} ${m.roundSeq}` : ""} · {dyn(`ar.canal.${m.channel}`)}
          {m.reference ? ` · ${m.reference}` : ""} · {date(m.declaredAt)}
        </span>
        <span className="aide-champ">
          {pourCompte ? tx("ar.pourCompte", { par: m.declaredByName ?? "", pour: m.memberName ?? "" }) : tx("ar.declarePar", { nom: m.declaredByName ?? "—" })}
          {m.payerNote ? ` · ${m.payerNote}` : ""}
          {m.rejectedReason ? ` · ${m.rejectedReason}` : ""}
        </span>
        <Pastille ton={tonMouvement(m.state)}>{dyn(`ar.etat.${m.state}`)}</Pastille>
      </div>
      {actions ? <div className="liste__actions">{actions}</div> : null}
    </li>
  );
}

export function Argent({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx } = useTextes();
  const gid = ctx.groupe.groupId;
  const [mes, setMes] = useState(false);
  const [declarer, setDeclarer] = useState(false);
  const [pour, setPour] = useState<MemberView | null>(null);
  const mouvements = useDonnees(() => argent.mouvements(ctx.session, gid, mes ? { mine: true } : {}), [gid, mes]);
  const membres = useDonnees(() => tontines.membres(ctx.session, gid), [gid]);
  // La présidence confirme les versements du trésorier lui-même.
  const tresorier = peut(ctx.roles, "movement.confirm") || peut(ctx.roles, "member.admit");
  const commissaire = peut(ctx.roles, "movement.control");
  const moiId = membres.etat.statut === "ok" ? membres.etat.donnees.find((m) => m.isMe)?.membershipId : undefined;

  const apres = () => {
    mouvements.recharger();
    ctx.rafraichir();
  };

  return (
    <div className="pile">
      <Carte
        titre={tx("ar.declarer")}
        actions={
          declarer || pour ? null : (
            <button type="button" className="bouton bouton-compact" onClick={() => setDeclarer(true)}>
              {tx("ar.declarer")}
            </button>
          )
        }
      >
        {declarer ? <FormulaireDeclaration ctx={ctx} onFini={() => (setDeclarer(false), apres())} /> : null}
        {!declarer && membres.etat.statut === "ok" ? (
          <Champ id="pour-qui" libelle={tx("ar.pourQui")}>
            <select
              id="pour-qui"
              value={pour?.membershipId ?? ""}
              onChange={(e) => setPour(membres.etat.statut === "ok" ? (membres.etat.donnees.find((m) => m.membershipId === e.target.value) ?? null) : null)}
            >
              <option value="">{tx("ar.pourMoi")}</option>
              {membres.etat.donnees
                .filter((m) => m.state === "active" && !m.isMe && (peut(ctx.roles, "movement.confirm") || m.proxyMembershipId === moiId))
                .map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.displayName}
                  </option>
                ))}
            </select>
          </Champ>
        ) : null}
        {pour ? <FormulaireDeclaration ctx={ctx} pourMembre={pour} onFini={() => (setPour(null), apres())} /> : null}
      </Carte>

      {tresorier ? <AConfirmer ctx={ctx} onFini={apres} /> : null}
      {commissaire ? <AControler ctx={ctx} onFini={apres} /> : null}

      <Carte
        titre={mes ? tx("ar.mes") : tx("ar.tous")}
        actions={
          <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => setMes((x) => !x)}>
            {mes ? tx("ar.tous") : tx("ar.mes")}
          </button>
        }
      >
        <Charge etat={mouvements.etat} recharger={mouvements.recharger}>
          {(liste) =>
            liste.length === 0 ? (
              <p>{tx("app.vide")}</p>
            ) : (
              <ul className="liste">
                {liste.map((m) => (
                  <LigneMouvement key={m.movementId} m={m} actions={m.can.acknowledge ? <Accuse ctx={ctx} m={m} onFini={apres} /> : undefined} />
                ))}
              </ul>
            )
          }
        </Charge>
      </Carte>
    </div>
  );
}

function Accuse({ ctx, m, onFini }: { readonly ctx: ContexteGroupe; readonly m: MovementView; readonly onFini: () => void }) {
  const { tx } = useTextes();
  const action = useAction();
  return (
    <>
      <button
        type="button"
        className="bouton bouton-compact"
        disabled={action.enCours}
        onClick={() => void action.lancer(() => argent.accuserReception(ctx.session, ctx.groupe.groupId, m.movementId)).then(onFini)}
      >
        {tx("ar.recu")}
      </button>
      <Retour erreur={action.erreur} succes={action.succes} />
    </>
  );
}

/** Collecte en lot : le trésorier coche les paiements reçus et confirme le lot. */
export function AConfirmer({ ctx, onFini, meetingId }: { readonly ctx: ContexteGroupe; readonly onFini: () => void; readonly meetingId?: string }) {
  const { tx } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => argent.mouvements(ctx.session, gid, { state: "declared", ...(meetingId ? { meetingId } : {}) }), [gid, meetingId]);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [rejet, setRejet] = useState<{ id: string; motif: string } | null>(null);
  const action = useAction();
  const confirmables = useMemo(() => (etat.statut === "ok" ? etat.donnees.filter((m) => m.can.confirm) : []), [etat]);

  const confirmer = async () => {
    const r = await action.lancer(() => argent.confirmerLot(ctx.session, gid, [...coches]));
    if (r) {
      setCoches(new Set());
      recharger();
      onFini();
    }
  };

  return (
    <Carte titre={tx("ar.aConfirmer")}>
      <Retour erreur={action.erreur} succes={action.succes} />
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p>{tx("app.vide")}</p>
          ) : (
            <>
              <ul className="liste">
                {liste.map((m) => (
                  <LigneMouvement
                    key={m.movementId}
                    m={m}
                    actions={
                      m.can.confirm ? (
                        <>
                          <label className="case">
                            <input
                              type="checkbox"
                              aria-label={`${m.memberName ?? ""} ${m.amount}`}
                              checked={coches.has(m.movementId)}
                              onChange={(e) =>
                                setCoches((s) => {
                                  const n = new Set(s);
                                  if (e.target.checked) n.add(m.movementId);
                                  else n.delete(m.movementId);
                                  return n;
                                })
                              }
                            />
                            ✓
                          </label>
                          {m.can.reject ? (
                            <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => setRejet({ id: m.movementId, motif: "" })}>
                              {tx("ar.rejeter")}
                            </button>
                          ) : null}
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
              {rejet ? (
                <div className="formulaire-encart pile">
                  <Champ id="rej-motif" libelle={tx("ar.motif")}>
                    <input id="rej-motif" value={rejet.motif} maxLength={500} onChange={(e) => setRejet({ ...rejet, motif: e.target.value })} />
                  </Champ>
                  <div className="actions-formulaire">
                    <button type="button" className="bouton bouton-secondaire" onClick={() => setRejet(null)}>
                      {tx("app.annuler")}
                    </button>
                    <button
                      type="button"
                      className="bouton"
                      disabled={action.enCours || rejet.motif.trim().length < 3}
                      onClick={() =>
                        void action.lancer(() => argent.rejeter(ctx.session, gid, rejet.id, rejet.motif.trim())).then((r) => {
                          if (r) {
                            setRejet(null);
                            recharger();
                            onFini();
                          }
                        })
                      }
                    >
                      {tx("ar.rejeter")}
                    </button>
                  </div>
                </div>
              ) : null}
              {confirmables.length ? (
                <div className="actions-formulaire">
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-compact"
                    onClick={() => setCoches(new Set(confirmables.map((m) => m.movementId)))}
                  >
                    ✓ {confirmables.length}
                  </button>
                  <button type="button" className="bouton" disabled={action.enCours || coches.size === 0} onClick={() => void confirmer()}>
                    {tx("ar.confirmerSelection", { n: coches.size })}
                  </button>
                </div>
              ) : null}
            </>
          )
        }
      </Charge>
    </Carte>
  );
}

function AControler({ ctx, onFini }: { readonly ctx: ContexteGroupe; readonly onFini: () => void }) {
  const { tx } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => argent.mouvements(ctx.session, gid, { state: "confirmed" }), [gid]);
  const action = useAction();
  return (
    <Carte titre={tx("ar.aControler")}>
      <Retour erreur={action.erreur} succes={action.succes} />
      <Charge etat={etat} recharger={recharger}>
        {(liste) => {
          const aControler = liste.filter((m) => m.can.control);
          return aControler.length === 0 ? (
            <p>{tx("app.vide")}</p>
          ) : (
            <ul className="liste">
              {aControler.map((m) => (
                <LigneMouvement
                  key={m.movementId}
                  m={m}
                  actions={
                    <button
                      type="button"
                      className="bouton bouton-compact"
                      disabled={action.enCours}
                      onClick={() =>
                        void action.lancer(() => argent.controler(ctx.session, gid, m.movementId)).then(() => {
                          recharger();
                          onFini();
                        })
                      }
                    >
                      {tx("ar.controler")}
                    </button>
                  }
                />
              ))}
            </ul>
          );
        }}
      </Charge>
    </Carte>
  );
}
