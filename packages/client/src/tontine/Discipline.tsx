/* KÓMBE — amendes (L-09), secours (L-08) et dettes suivies (L-10).
   Une amende ne modifie jamais une cotisation ; elle se paie dans la caisse
   des amendes. Le membre peut contester ; la présidence (≠ membre concerné)
   maintient ou annule. Une dette se règle par une déclaration ordinaire. */

import { useState } from "react";
import type { AidEvent, FineKind, PaymentChannel } from "@kombe/domain";
import { argent, discipline, tontines, type DebtView, type FineView } from "./api.js";
import { peut } from "./droits.js";
import { CANAUX } from "./Argent.js";
import { Carte, Champ, ChampMontant, Charge, Pastille, Retour, aujourdhui, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

const EVENEMENTS: readonly AidEvent[] = ["death_member", "death_spouse", "death_parent", "death_child", "birth", "marriage", "illness", "other"];
const TYPES_AMENDE: readonly FineKind[] = ["late_contribution", "meeting_late", "meeting_absence", "indiscipline"];

export function Discipline({ ctx }: { readonly ctx: ContexteGroupe }) {
  return (
    <div className="pile">
      <Amendes ctx={ctx} />
      {ctx.groupe.funds.some((f) => f.kind === "solidarity") ? <Secours ctx={ctx} /> : null}
      <Dettes ctx={ctx} />
    </div>
  );
}

function Amendes({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn, xaf, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => discipline.amendes(ctx.session, gid), [gid]);
  const membres = useDonnees(() => tontines.membres(ctx.session, gid), [gid]);
  const action = useAction();
  const [motif, setMotif] = useState<{ id: string; quoi: "contester" | "annuler" | "maintenir"; texte: string } | null>(null);
  const [paiement, setPaiement] = useState<FineView | null>(null);
  const [nouvelle, setNouvelle] = useState<{ membershipId: string; kind: FineKind; amount: string; reason: string } | null>(null);
  const caisseAmendes = ctx.groupe.funds.find((f) => f.kind === "fines");
  const moi = membres.etat.statut === "ok" ? membres.etat.donnees.find((m) => m.isMe) : undefined;

  const apres = () => {
    recharger();
    ctx.rafraichir();
  };

  return (
    <Carte
      titre={tx("di.amendes")}
      actions={
        peut(ctx.roles, "fine.issue") && !nouvelle ? (
          <button type="button" className="bouton bouton-compact" onClick={() => setNouvelle({ membershipId: "", kind: "meeting_absence", amount: "", reason: "" })}>
            {tx("di.infliger")}
          </button>
        ) : null
      }
    >
      <Retour erreur={action.erreur} />
      {nouvelle && membres.etat.statut === "ok" ? (
        <div className="formulaire-encart pile">
          <Champ id="am-qui" libelle={tx("td.membres")}>
            <select id="am-qui" value={nouvelle.membershipId} onChange={(e) => setNouvelle({ ...nouvelle, membershipId: e.target.value })}>
              <option value="">—</option>
              {membres.etat.donnees
                .filter((m) => m.state === "active" && !m.isMe)
                .map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.displayName}
                  </option>
                ))}
            </select>
          </Champ>
          <Champ id="am-type" libelle={tx("di.motif")}>
            <select id="am-type" value={nouvelle.kind} onChange={(e) => setNouvelle({ ...nouvelle, kind: e.target.value as FineKind })}>
              {TYPES_AMENDE.map((k) => (
                <option key={k} value={k}>
                  {dyn(`di.k.${k}`)}
                </option>
              ))}
            </select>
          </Champ>
          {nouvelle.kind === "indiscipline" ? <ChampMontant id="am-montant" libelle={tx("ar.montant")} valeur={nouvelle.amount} onChange={(v) => setNouvelle({ ...nouvelle, amount: v })} /> : null}
          <Champ id="am-texte" libelle={tx("di.motif")}>
            <input id="am-texte" value={nouvelle.reason} maxLength={500} onChange={(e) => setNouvelle({ ...nouvelle, reason: e.target.value })} />
          </Champ>
          <div className="actions-formulaire">
            <button type="button" className="bouton bouton-secondaire" onClick={() => setNouvelle(null)}>
              {tx("app.annuler")}
            </button>
            <button
              type="button"
              className="bouton"
              disabled={action.enCours || !nouvelle.membershipId || nouvelle.reason.trim().length < 3}
              onClick={() =>
                void action
                  .lancer(() =>
                    discipline.infliger(ctx.session, gid, {
                      membershipId: nouvelle.membershipId,
                      kind: nouvelle.kind,
                      reason: nouvelle.reason.trim(),
                      ...(nouvelle.kind === "indiscipline" && nouvelle.amount ? { amount: nouvelle.amount } : {}),
                    }),
                  )
                  .then((r) => {
                    if (r) {
                      setNouvelle(null);
                      apres();
                    }
                  })
              }
            >
              {tx("di.infliger")}
            </button>
          </div>
        </div>
      ) : null}
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p>{tx("app.vide")}</p>
          ) : (
            <ul className="liste">
              {liste.map((f) => {
                const concerne = moi?.membershipId === f.membershipId;
                return (
                  <li key={f.fineId} className="liste__ligne liste__ligne--haute">
                    <div>
                      <strong>
                        {f.memberName} · {xaf(f.amount)}
                      </strong>
                      <span className="aide-champ">
                        {dyn(`di.k.${f.kind}`)} · {f.reason} · {date(f.issuedAt)}
                        {f.issuedByName ? ` · ${f.issuedByName}` : ""}
                      </span>
                      <Pastille ton={f.state === "paid" ? "ok" : f.state === "contested" ? "alerte" : f.state === "cancelled" ? "neutre" : "attente"}>{dyn(`di.e.${f.state}`)}</Pastille>
                    </div>
                    <div className="liste__actions">
                      {f.state === "issued" && concerne ? (
                        <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => setMotif({ id: f.fineId, quoi: "contester", texte: "" })}>
                          {tx("di.contester")}
                        </button>
                      ) : null}
                      {f.state === "issued" && caisseAmendes && (concerne || peut(ctx.roles, "movement.confirm")) ? (
                        <button type="button" className="bouton bouton-compact" onClick={() => setPaiement(f)}>
                          {tx("di.payer")}
                        </button>
                      ) : null}
                      {(f.state === "contested" || f.state === "issued") && peut(ctx.roles, "member.admit") && !concerne ? (
                        <>
                          {f.state === "contested" ? (
                            <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => setMotif({ id: f.fineId, quoi: "maintenir", texte: "" })}>
                              {tx("di.maintenir")}
                            </button>
                          ) : null}
                          <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => setMotif({ id: f.fineId, quoi: "annuler", texte: "" })}>
                            {tx("di.annuler")}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Charge>
      {motif ? (
        <div className="formulaire-encart pile">
          <Champ id="am-motif" libelle={tx("di.motif")}>
            <input id="am-motif" value={motif.texte} maxLength={500} onChange={(e) => setMotif({ ...motif, texte: e.target.value })} />
          </Champ>
          <div className="actions-formulaire">
            <button type="button" className="bouton bouton-secondaire" onClick={() => setMotif(null)}>
              {tx("app.annuler")}
            </button>
            <button
              type="button"
              className="bouton"
              disabled={action.enCours || motif.texte.trim().length < 3}
              onClick={() => {
                const f = motif.quoi === "contester" ? discipline.contester : motif.quoi === "annuler" ? discipline.annuler : discipline.maintenir;
                void action.lancer(() => f(ctx.session, gid, motif.id, motif.texte.trim())).then((r) => {
                  if (r) {
                    setMotif(null);
                    apres();
                  }
                });
              }}
            >
              {tx(motif.quoi === "contester" ? "di.contester" : motif.quoi === "annuler" ? "di.annuler" : "di.maintenir")}
            </button>
          </div>
        </div>
      ) : null}
      {paiement && caisseAmendes ? (
        <PaiementLie
          titre={`${tx("di.payer")} — ${paiement.memberName} · ${xaf(paiement.amount)}`}
          montantFixe={paiement.amount}
          onEnvoyer={(channel, reference) =>
            argent.declarer(ctx.session, gid, {
              fundId: caisseAmendes.fundId,
              kind: "fine_payment",
              amount: paiement.amount,
              channel,
              relatedKind: "fine",
              relatedId: paiement.fineId,
              membershipId: paiement.membershipId,
              ...(reference ? { reference } : {}),
            })
          }
          onFini={() => {
            setPaiement(null);
            apres();
          }}
        />
      ) : null}
    </Carte>
  );
}

function Secours({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn, xaf, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => discipline.secours(ctx.session, gid), [gid]);
  const membres = useDonnees(() => tontines.membres(ctx.session, gid), [gid]);
  const action = useAction();
  const [demande, setDemande] = useState<{ pour: string; event: AidEvent; eventDate: string; note: string } | null>(null);
  const [remise, setRemise] = useState<string | null>(null);

  const apres = () => {
    recharger();
    ctx.rafraichir();
  };

  return (
    <Carte
      titre={tx("di.secours")}
      actions={
        demande ? null : (
          <button type="button" className="bouton bouton-compact" onClick={() => setDemande({ pour: "", event: "illness", eventDate: aujourdhui(), note: "" })}>
            {tx("di.demander")}
          </button>
        )
      }
    >
      <Retour erreur={action.erreur} />
      {demande ? (
        <div className="formulaire-encart pile">
          {membres.etat.statut === "ok" ? (
            <Champ id="se-pour" libelle={tx("di.pourQui")}>
              <select id="se-pour" value={demande.pour} onChange={(e) => setDemande({ ...demande, pour: e.target.value })}>
                <option value="">{tx("ar.pourMoi")}</option>
                {membres.etat.donnees
                  .filter((m) => m.state === "active" && !m.isMe)
                  .map((m) => (
                    <option key={m.membershipId} value={m.membershipId}>
                      {m.displayName}
                    </option>
                  ))}
              </select>
            </Champ>
          ) : null}
          <Champ id="se-event" libelle={tx("di.evenement")}>
            <select id="se-event" value={demande.event} onChange={(e) => setDemande({ ...demande, event: e.target.value as AidEvent })}>
              {EVENEMENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {dyn(`di.ev.${ev}`)}
                </option>
              ))}
            </select>
          </Champ>
          <Champ id="se-date" libelle={tx("di.dateEvenement")}>
            <input id="se-date" type="date" value={demande.eventDate} max={aujourdhui()} onChange={(e) => setDemande({ ...demande, eventDate: e.target.value })} />
          </Champ>
          <Champ id="se-note" libelle={tx("se.notes")}>
            <input id="se-note" value={demande.note} maxLength={500} onChange={(e) => setDemande({ ...demande, note: e.target.value })} />
          </Champ>
          <div className="actions-formulaire">
            <button type="button" className="bouton bouton-secondaire" onClick={() => setDemande(null)}>
              {tx("app.annuler")}
            </button>
            <button
              type="button"
              className="bouton"
              disabled={action.enCours}
              onClick={() =>
                void action
                  .lancer(() =>
                    discipline.demanderSecours(ctx.session, gid, {
                      event: demande.event,
                      eventDate: demande.eventDate,
                      ...(demande.pour ? { beneficiaryMembershipId: demande.pour } : {}),
                      ...(demande.note.trim() ? { note: demande.note.trim() } : {}),
                    }),
                  )
                  .then((r) => {
                    if (r) {
                      setDemande(null);
                      apres();
                    }
                  })
              }
            >
              {tx("di.demander")}
            </button>
          </div>
        </div>
      ) : null}
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p>{tx("app.vide")}</p>
          ) : (
            <ul className="liste">
              {liste.map((a) => {
                const moi = membres.etat.statut === "ok" ? membres.etat.donnees.find((m) => m.isMe) : undefined;
                const beneficiaire = moi?.membershipId === a.beneficiaryMembershipId;
                return (
                  <li key={a.aidId} className="liste__ligne liste__ligne--haute">
                    <div>
                      <strong>
                        {a.beneficiaryName} · {dyn(`di.ev.${a.event}`)} · {xaf(a.amount)}
                      </strong>
                      <span className="aide-champ">
                        {date(a.eventDate)}
                        {a.note ? ` · ${a.note}` : ""}
                        {a.decisionNote ? ` · ${a.decisionNote}` : ""}
                      </span>
                      <Pastille ton={a.state === "paid" ? "ok" : a.state === "rejected" ? "alerte" : "attente"}>{dyn(`di.se.${a.state}`)}</Pastille>
                    </div>
                    <div className="liste__actions">
                      {a.state === "requested" && peut(ctx.roles, "aid.decide") && !beneficiaire ? (
                        <>
                          <button type="button" className="bouton bouton-compact" onClick={() => void action.lancer(() => discipline.deciderSecours(ctx.session, gid, a.aidId, "approve")).then(apres)}>
                            {tx("di.accorder")}
                          </button>
                          <button
                            type="button"
                            className="bouton bouton-secondaire bouton-compact"
                            onClick={() => void action.lancer(() => discipline.deciderSecours(ctx.session, gid, a.aidId, "reject")).then(apres)}
                          >
                            {tx("di.refuser")}
                          </button>
                        </>
                      ) : null}
                      {a.state === "approved" && peut(ctx.roles, "movement.confirm") ? (
                        <button type="button" className="bouton bouton-compact" onClick={() => setRemise(a.aidId)}>
                          {tx("di.remettre")}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Charge>
      {remise ? (
        <PaiementLie
          titre={tx("di.remettre")}
          onEnvoyer={(channel, reference) => discipline.remettreSecours(ctx.session, gid, remise, channel, reference || undefined)}
          onFini={() => {
            setRemise(null);
            apres();
          }}
        />
      ) : null}
    </Carte>
  );
}

function Dettes({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn, xaf, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => discipline.dettes(ctx.session, gid), [gid]);
  const membres = useDonnees(() => tontines.membres(ctx.session, gid), [gid]);
  const action = useAction();
  const [regler, setRegler] = useState<DebtView | null>(null);
  const [montant, setMontant] = useState("");
  const [abandon, setAbandon] = useState<{ id: string; motif: string } | null>(null);
  const moi = membres.etat.statut === "ok" ? membres.etat.donnees.find((m) => m.isMe) : undefined;
  const rotation = ctx.groupe.funds.find((f) => f.kind === "rotation");

  const apres = () => {
    recharger();
    ctx.rafraichir();
  };

  return (
    <Carte titre={tx("di.dettes")}>
      <Retour erreur={action.erreur} />
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p>{tx("app.vide")}</p>
          ) : (
            <ul className="liste">
              {liste.map((d) => (
                <li key={d.debtId} className="liste__ligne liste__ligne--haute">
                  <div>
                    <strong>
                      {d.debtorName} · {xaf(d.remaining)} / {xaf(d.amount)}
                    </strong>
                    <span className="aide-champ">
                      {dyn(`di.o.${d.origin}`)} · {date(d.createdAt)}
                      {d.guarantorName ? ` · ${tx("di.avaliseur", { nom: d.guarantorName })}` : ""}
                    </span>
                    <Pastille ton={d.state === "settled" ? "ok" : d.state === "open" ? "attente" : "neutre"}>{dyn(`di.d.${d.state}`)}</Pastille>
                  </div>
                  {d.state === "open" ? (
                    <div className="liste__actions">
                      {moi?.membershipId === d.debtorMembershipId || peut(ctx.roles, "movement.confirm") ? (
                        <button type="button" className="bouton bouton-compact" onClick={() => (setRegler(d), setMontant(d.remaining))}>
                          {tx("di.regler")}
                        </button>
                      ) : null}
                      {peut(ctx.roles, "member.admit") && moi?.membershipId !== d.debtorMembershipId ? (
                        <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => setAbandon({ id: d.debtId, motif: "" })}>
                          {tx("di.abandonner")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        }
      </Charge>
      {regler && rotation ? (
        <>
          <ChampMontant id="dette-montant" libelle={tx("ar.montant")} valeur={montant} onChange={setMontant} />
          <PaiementLie
            titre={`${tx("di.regler")} — ${regler.debtorName}`}
            onEnvoyer={(channel, reference) =>
              argent.declarer(ctx.session, gid, {
                fundId: rotation.fundId,
                kind: "contribution",
                amount: montant,
                channel,
                relatedKind: "debt",
                relatedId: regler.debtId,
                ...(reference ? { reference } : {}),
              })
            }
            onFini={() => {
              setRegler(null);
              apres();
            }}
          />
        </>
      ) : null}
      {abandon ? (
        <div className="formulaire-encart pile">
          <Champ id="ab-motif" libelle={tx("di.motif")}>
            <input id="ab-motif" value={abandon.motif} maxLength={500} onChange={(e) => setAbandon({ ...abandon, motif: e.target.value })} />
          </Champ>
          <div className="actions-formulaire">
            <button type="button" className="bouton bouton-secondaire" onClick={() => setAbandon(null)}>
              {tx("app.annuler")}
            </button>
            <button
              type="button"
              className="bouton"
              disabled={action.enCours || abandon.motif.trim().length < 3}
              onClick={() =>
                void action.lancer(() => discipline.abandonnerDette(ctx.session, gid, abandon.id, abandon.motif.trim())).then((r) => {
                  if (r) {
                    setAbandon(null);
                    apres();
                  }
                })
              }
            >
              {tx("di.abandonner")}
            </button>
          </div>
        </div>
      ) : null}
    </Carte>
  );
}

/** Petit formulaire « moyen de paiement + référence » pour un paiement lié. */
function PaiementLie({
  titre,
  montantFixe,
  onEnvoyer,
  onFini,
}: {
  readonly titre: string;
  readonly montantFixe?: string;
  readonly onEnvoyer: (channel: PaymentChannel, reference: string) => Promise<unknown>;
  readonly onFini: () => void;
}) {
  const { tx, dyn, xaf } = useTextes();
  const [canal, setCanal] = useState<PaymentChannel>("cash");
  const [reference, setReference] = useState("");
  const action = useAction();
  return (
    <div className="formulaire-encart pile">
      <h4>{titre}</h4>
      {montantFixe ? <p>{xaf(montantFixe)}</p> : null}
      <Champ id="pl-canal" libelle={tx("ar.canal")}>
        <select id="pl-canal" value={canal} onChange={(e) => setCanal(e.target.value as PaymentChannel)}>
          {CANAUX.map((c) => (
            <option key={c} value={c}>
              {dyn(`ar.canal.${c}`)}
            </option>
          ))}
        </select>
      </Champ>
      {canal !== "cash" ? (
        <Champ id="pl-ref" libelle={tx("ar.reference")}>
          <input id="pl-ref" value={reference} maxLength={64} required onChange={(e) => setReference(e.target.value)} />
        </Champ>
      ) : null}
      <Retour erreur={action.erreur} succes={action.succes} />
      <div className="actions-formulaire">
        <button type="button" className="bouton bouton-secondaire" onClick={onFini}>
          {tx("app.annuler")}
        </button>
        <button
          type="button"
          className="bouton"
          disabled={action.enCours || (canal !== "cash" && reference.trim().length === 0)}
          onClick={() => void action.lancer(() => onEnvoyer(canal, reference.trim()), tx("ar.declare")).then((r) => r !== undefined && setTimeout(onFini, 900))}
        >
          {action.enCours ? tx("app.envoi") : tx("ar.declarer")}
        </button>
      </div>
    </div>
  );
}
