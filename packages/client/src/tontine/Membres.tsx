/* KÓMBE — membres, bureau et invitations (I-14, L-11, L-14, L-15, L-17). */

import { useState } from "react";
import type { GroupRole } from "@kombe/domain";
import { tontines, type InvitationView, type MemberView } from "./api.js";
import { ROLES_NOMMABLES, peut } from "./droits.js";
import { Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { Icone } from "../composants/Icones.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

export function Membres({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => tontines.membres(ctx.session, gid), [gid]);
  const action = useAction();
  const avantDemarrage = !ctx.groupe.cycleStarted;

  const apres = () => {
    recharger();
    ctx.rafraichir();
  };

  return (
    <div className="pile">
      {peut(ctx.roles, "member.invite") ? <Invitations ctx={ctx} /> : null}
      <Carte titre={tx("td.membres")}>
        <Retour erreur={action.erreur} succes={action.succes} />
        <Charge etat={etat} recharger={recharger}>
          {(membres) => (
            <ul className="liste">
              {membres.map((m) => (
                <li key={m.membershipId} className="liste__ligne liste__ligne--haute">
                  <div>
                    <strong>
                      {m.displayName}
                      {m.isMe ? ` (${tx("mb.moi")})` : ""}
                    </strong>
                    <span className="aide-champ">
                      {m.roles.map((r) => dyn(`role.${r}`)).join(" · ")}
                      {m.login ? ` · ${m.login}` : ""}
                      {m.offline ? ` · ${tx("mb.sansSmartphone")}` : ""}
                      {m.shares > 1 ? ` · ${tx("mb.parts")} : ${m.shares}` : ""}
                      {m.sharePartnerMembershipId ? ` · ${tx("mb.partageAvec", { nom: membres.find((x) => x.membershipId === m.sharePartnerMembershipId)?.displayName ?? "" })}` : ""}
                      {m.state !== "active" && m.state !== "pending" ? ` · ${dyn(`mb.etat.${m.state}`)}` : ""}
                    </span>
                    {m.state === "pending" ? <Pastille ton="attente">{tx("mb.attente")}</Pastille> : null}
                    {m.isMe && m.pendingRoles.length
                      ? m.pendingRoles.map((r) => (
                          <button
                            key={r}
                            type="button"
                            className="bouton bouton-compact"
                            disabled={action.enCours}
                            onClick={() => void action.lancer(() => tontines.accepterRole(ctx.session, gid, r)).then(apres)}
                          >
                            {tx("mb.accepterRole", { role: dyn(`role.${r}`) })}
                          </button>
                        ))
                      : null}
                    {!m.isMe && m.pendingRoles.length ? (
                      <span className="aide-champ">
                        {m.pendingRoles.map((r) => dyn(`role.${r}`)).join(" · ")} — {tx("mb.attente")}
                      </span>
                    ) : null}
                  </div>
                  <div className="liste__actions">
                    {m.state === "pending" && peut(ctx.roles, "member.admit") ? (
                      <>
                        <button
                          type="button"
                          className="bouton bouton-compact bouton-avec-icone"
                          disabled={action.enCours}
                          onClick={() => void action.lancer(() => tontines.admission(ctx.session, gid, m.membershipId, "admit")).then(apres)}
                         title={tx("mb.admettre")}>
                          <Icone nom="coche" taille={18} />
                          <span className="bouton-libelle">{tx("mb.admettre")}</span>
                        </button>
                        <button
                          type="button"
                          className="bouton bouton-secondaire bouton-compact bouton-avec-icone"
                          disabled={action.enCours}
                          onClick={() => void action.lancer(() => tontines.admission(ctx.session, gid, m.membershipId, "reject")).then(apres)}
                         title={tx("mb.refuser")}>
                          <Icone nom="fermer" taille={18} />
                          <span className="bouton-libelle">{tx("mb.refuser")}</span>
                        </button>
                      </>
                    ) : null}
                    {m.state === "active" && avantDemarrage && peut(ctx.roles, "group.manage") ? (
                      <>
                        {!m.sharePartnerMembershipId ? (
                          <label className="champ-inline">
                            {tx("mb.parts")}
                            <select
                              value={m.shares}
                              onChange={(e) => void action.lancer(() => tontines.parts(ctx.session, gid, m.membershipId, Number(e.target.value))).then(apres)}
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label className="champ-inline">
                          {tx("mb.partage")}
                          <select
                            value={m.sharePartnerMembershipId ?? ""}
                            onChange={(e) => void action.lancer(() => tontines.partager(ctx.session, gid, m.membershipId, e.target.value || null)).then(apres)}
                          >
                            <option value="">{tx("mb.personne")}</option>
                            {membres
                              .filter((x) => x.state === "active" && x.membershipId !== m.membershipId && (!x.sharePartnerMembershipId || x.sharePartnerMembershipId === m.membershipId))
                              .map((x) => (
                                <option key={x.membershipId} value={x.membershipId}>
                                  {x.displayName}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Charge>
      </Carte>
      {etat.statut === "ok" && peut(ctx.roles, "role.assign") ? <Nomination ctx={ctx} membres={etat.donnees} onFini={apres} /> : null}
      {etat.statut === "ok" && peut(ctx.roles, "group.manage") ? <MembreSansSmartphone ctx={ctx} membres={etat.donnees} onFini={apres} /> : null}
    </div>
  );
}

function Invitations({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => tontines.invitations(ctx.session, gid), [gid]);
  const action = useAction();
  const [copie, setCopie] = useState<string | null>(null);
  const [copieEchec, setCopieEchec] = useState(false);
  const [uses, setUses] = useState("");
  const [jours, setJours] = useState("");

  const nUses = uses.trim() === "" ? undefined : Number(uses);
  const nJours = jours.trim() === "" ? undefined : Number(jours);
  const formulaireValide =
    (nUses === undefined || (Number.isInteger(nUses) && nUses >= 1 && nUses <= 100)) &&
    (nJours === undefined || (Number.isInteger(nJours) && nJours >= 1 && nJours <= 30));

  const creer = () => {
    if (!formulaireValide || action.enCours) return;
    void action.lancer(() => tontines.creerInvitation(ctx.session, gid, nUses, nJours)).then(recharger);
  };

  const copier = async (inv: InvitationView) => {
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopie(inv.invitationId);
      setCopieEchec(false);
    } catch {
      setCopie(null);
      setCopieEchec(true);
    }
  };

  return (
    <Carte titre={tx("mb.inviter")}>
      <form
        className="pile"
        onSubmit={(e) => {
          e.preventDefault();
          creer();
        }}
      >
        <Retour erreur={action.erreur} succes={action.succes} />
        <Champ id="inv-uses" libelle={tx("mb.invUses")}>
          <input id="inv-uses" inputMode="numeric" value={uses} placeholder="30" onChange={(e) => setUses(e.target.value)} />
        </Champ>
        <Champ id="inv-jours" libelle={tx("mb.invJours")} aide={tx("mb.invDefauts")}>
          <input id="inv-jours" inputMode="numeric" value={jours} placeholder="14" onChange={(e) => setJours(e.target.value)} />
        </Champ>
        <button type="submit" className="bouton bouton-compact bouton-avec-icone bouton-icone-seule" disabled={action.enCours || !formulaireValide} title={tx("mb.creerLien")}>
          <Icone nom="inviter" taille={18} />
          <span className="bouton-libelle">{tx("mb.creerLien")}</span>
        </button>
        {copieEchec ? <p className="aide-champ">{tx("mb.copieEchec")}</p> : null}
      </form>
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p>{tx("app.vide")}</p>
          ) : (
            <ul className="liste">
              {liste.map((inv) => (
                <li key={inv.invitationId} className="liste__ligne liste__ligne--haute">
                  <div>
                    <strong className="code-invitation">{tx("mb.code", { code: inv.code })}</strong>
                    <span className="aide-champ">{tx("mb.expire", { date: date(inv.expiresAt), used: inv.usedCount, max: inv.maxUses })}</span>
                    {inv.revoked ? <Pastille ton="neutre">{tx("mb.revoque")}</Pastille> : null}
                  </div>
                  {inv.revoked ? null : (
                    <div className="liste__actions">
                      <a className="bouton bouton-compact" href={`https://wa.me/?text=${encodeURIComponent(inv.whatsappText)}`} target="_blank" rel="noopener noreferrer">
                        {tx("mb.partagerWhatsapp")}
                      </a>
                      <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => void copier(inv)}>
                        {copie === inv.invitationId ? tx("mb.copie") : tx("mb.copier")}
                      </button>
                      <button
                        type="button"
                        className="bouton bouton-secondaire bouton-compact"
                        disabled={action.enCours}
                        onClick={() => void action.lancer(() => tontines.revoquerInvitation(ctx.session, gid, inv.invitationId)).then(recharger)}
                      >
                        {tx("mb.revoquer")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </Charge>
    </Carte>
  );
}

function Nomination({ ctx, membres, onFini }: { readonly ctx: ContexteGroupe; readonly membres: readonly MemberView[]; readonly onFini: () => void }) {
  const { tx, dyn } = useTextes();
  const actifs = membres.filter((m) => m.state === "active");
  const [qui, setQui] = useState(actifs[0]?.membershipId ?? "");
  const [role, setRole] = useState<GroupRole>("treasurer");
  const action = useAction();
  return (
    <Carte titre={tx("mb.nommer")}>
      <div className="grille-champs">
        <Champ id="nom-qui" libelle={tx("td.membres")}>
          <select id="nom-qui" value={qui} onChange={(e) => setQui(e.target.value)}>
            {actifs.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Champ>
        <Champ id="nom-role" libelle={tx("mb.role")}>
          <select id="nom-role" value={role} onChange={(e) => setRole(e.target.value as GroupRole)}>
            {ROLES_NOMMABLES.map((r) => (
              <option key={r} value={r}>
                {dyn(`role.${r}`)}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <Retour erreur={action.erreur} succes={action.succes} />
      <button
        type="button"
        className="bouton"
        disabled={action.enCours || !qui}
        onClick={() => void action.lancer(() => tontines.proposerRole(ctx.session, ctx.groupe.groupId, qui, role), "✓").then(onFini)}
      >
        {tx("mb.nommerBouton")}
      </button>
    </Carte>
  );
}

function MembreSansSmartphone({ ctx, membres, onFini }: { readonly ctx: ContexteGroupe; readonly membres: readonly MemberView[]; readonly onFini: () => void }) {
  const { tx } = useTextes();
  const actifs = membres.filter((m) => m.state === "active" && !m.offline);
  const [nom, setNom] = useState("");
  const [proxy, setProxy] = useState(actifs[0]?.membershipId ?? "");
  const action = useAction();
  return (
    <Carte titre={tx("mb.horsLigne")}>
      <p className="aide-champ">{tx("mb.horsLigneAide")}</p>
      <div className="grille-champs">
        <Champ id="hl-nom" libelle={tx("cx.nom")}>
          <input id="hl-nom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} />
        </Champ>
        <Champ id="hl-proxy" libelle={tx("mb.representant")}>
          <select id="hl-proxy" value={proxy} onChange={(e) => setProxy(e.target.value)}>
            {actifs.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <Retour erreur={action.erreur} succes={action.succes} />
      <button
        type="button"
        className="bouton"
        disabled={action.enCours || nom.trim().length < 2 || !proxy}
        onClick={() =>
          void action.lancer(() => tontines.ajouterHorsLigne(ctx.session, ctx.groupe.groupId, nom.trim(), proxy)).then((r) => {
            if (r) {
              setNom("");
              onFini();
            }
          })
        }
      >
        {tx("mb.horsLigne")}
      </button>
    </Carte>
  );
}
