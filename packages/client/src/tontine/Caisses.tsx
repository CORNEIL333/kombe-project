/* KÓMBE — caisses et cotisations du groupe.
   Les caisses du règlement (cagnotte, secours, réserve…) suivent les statuts ;
   le bureau ouvre en plus les caisses propres à la tontine (projet, fête,
   achat groupé, urgences…), chacune avec sa règle : à chaque séance, une
   seule fois, ou libre. Une règle ne vaut jamais pour les séances passées :
   un nouveau montant prend effet à une date d'aujourd'hui ou plus tard. */

import { useState } from "react";
import { argent, type CreateFundInput, type DueView, type FundView } from "./api.js";
import { peut } from "./droits.js";
import { Carte, Champ, ChampMontant, Pastille, Retour, useAction } from "./ui.js";
import { Icone } from "../composants/Icones.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

type Mode = CreateFundInput["mode"];
const MODES: readonly Mode[] = ["each_meeting", "one_time", "free"];

/** Date du jour à Douala (UTC+1), comme le serveur. */
function aujourdhui(): string {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}

/** Nom d'une caisse : celui choisi par la tontine, ou le libellé du règlement. */
export function useNomCaisse() {
  const { dyn } = useTextes();
  return (f: Pick<FundView, "kind" | "name"> | Pick<DueView, "fundKind" | "fundName">): string =>
    "kind" in f ? (f.kind === "custom" ? f.name : dyn(`caisse.${f.kind}`)) : f.fundKind === "custom" ? f.fundName : dyn(`caisse.${f.fundKind}`);
}

function RegleCaisse({ f }: { readonly f: FundView }) {
  const { tx, xaf, date } = useTextes();
  const c = f.custom;
  if (!c) return <span className="aide-champ">{BigInt(f.perMeeting) > 0n ? tx("cs.parSeance", { montant: xaf(f.perMeeting) }) : tx("cs.reglement")}</span>;
  const futur = c.schedule.filter((st) => st.from > aujourdhui());
  return (
    <>
      <span className="aide-champ">
        {c.mode === "free" ? tx("cs.libre") : c.mode === "one_time" ? tx("cs.uneFois", { montant: xaf(c.currentAmount) }) : tx("cs.parSeance", { montant: xaf(c.currentAmount) })}
        {futur.map((st) => ` · ${tx("cs.aVenir", { montant: xaf(st.amount), date: date(st.from) })}`).join("")}
      </span>
      {c.purpose ? <span className="aide-champ">{c.purpose}</span> : null}
    </>
  );
}

function Progression({ f }: { readonly f: FundView }) {
  const { tx, xaf } = useTextes();
  const cible = f.custom?.target;
  if (!cible) return null;
  const actuel = BigInt(f.confirmedBalance);
  const pct = Math.max(0, Math.min(100, Number((actuel * 100n) / BigInt(cible))));
  return (
    <div className="caisse-objectif">
      <div className="caisse-objectif__barre" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="aide-champ">{tx("cs.progression", { actuel: xaf(actuel), cible: xaf(cible) })}</span>
    </div>
  );
}

function NouvelleCaisse({ ctx, onFini }: { readonly ctx: ContexteGroupe; readonly onFini: () => void }) {
  const { tx, dyn } = useTextes();
  const [nom, setNom] = useState("");
  const [mode, setMode] = useState<Mode>("each_meeting");
  const [montant, setMontant] = useState("");
  const [depuis, setDepuis] = useState(aujourdhui());
  const [objet, setObjet] = useState("");
  const [objectif, setObjectif] = useState("");
  const action = useAction();
  const montantRequis = mode !== "free";
  const valide = nom.trim().length >= 2 && (!montantRequis || BigInt(montant || "0") > 0n) && depuis >= aujourdhui();

  const envoyer = async () => {
    const r = await action.lancer(
      () =>
        argent.creerCaisse(ctx.session, ctx.groupe.groupId, {
          name: nom.trim(),
          mode,
          ...(montantRequis ? { amount: montant, from: depuis } : {}),
          ...(objet.trim() ? { purpose: objet.trim() } : {}),
          ...(objectif && BigInt(objectif) > 0n ? { target: objectif } : {}),
        }),
      tx("cs.cree"),
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
      <h4>{tx("cs.nouvelle")}</h4>
      <Champ id="cs-nom" libelle={tx("cs.nom")} aide={tx("cs.nomAide")}>
        <input id="cs-nom" value={nom} maxLength={80} required onChange={(e) => setNom(e.target.value)} aria-describedby="cs-nom-aide" />
      </Champ>
      <fieldset className="choix-regle">
        <legend>{tx("cs.mode")}</legend>
        {MODES.map((m) => (
          <label key={m} className={`choix-regle__option${mode === m ? " choix-regle__option--actif" : ""}`}>
            <input type="radio" name="cs-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
            <strong>{dyn(`cs.mode.${m}`)}</strong>
            <span className="aide-champ">{dyn(`cs.modeAide.${m}`)}</span>
          </label>
        ))}
      </fieldset>
      {montantRequis ? (
        <>
          <ChampMontant id="cs-montant" libelle={tx("cs.montant")} valeur={montant} onChange={setMontant} />
          <Champ id="cs-depuis" libelle={tx("cs.depuis")} aide={tx("cs.depuisAide")}>
            <input id="cs-depuis" type="date" value={depuis} min={aujourdhui()} onChange={(e) => setDepuis(e.target.value)} aria-describedby="cs-depuis-aide" />
          </Champ>
        </>
      ) : null}
      <Champ id="cs-objet" libelle={tx("cs.objet")}>
        <input id="cs-objet" value={objet} maxLength={280} onChange={(e) => setObjet(e.target.value)} />
      </Champ>
      <ChampMontant id="cs-objectif" libelle={tx("cs.objectif")} valeur={objectif} onChange={setObjectif} />
      <Retour erreur={action.erreur} succes={action.succes} />
      <div className="actions-formulaire">
        <button type="button" className="bouton bouton-secondaire" onClick={onFini}>
          {tx("app.annuler")}
        </button>
        <button type="submit" className="bouton" disabled={action.enCours || !valide}>
          {action.enCours ? tx("app.envoi") : tx("cs.creer")}
        </button>
      </div>
    </form>
  );
}

function ModifierCaisse({ ctx, f, onFini }: { readonly ctx: ContexteGroupe; readonly f: FundView; readonly onFini: () => void }) {
  const { tx } = useTextes();
  const c = f.custom;
  const [nom, setNom] = useState(f.name);
  const [objet, setObjet] = useState(c?.purpose ?? "");
  const [objectif, setObjectif] = useState(c?.target ?? "");
  const [montant, setMontant] = useState("");
  const [depuis, setDepuis] = useState(aujourdhui());
  const [clore, setClore] = useState(false);
  const action = useAction();
  if (!c) return null;
  const montantModifiable = c.mode === "each_meeting";

  const enregistrer = async () => {
    const r = await action.lancer(
      () =>
        argent.modifierCaisse(ctx.session, ctx.groupe.groupId, f.fundId, {
          ...(nom.trim() !== f.name ? { name: nom.trim() } : {}),
          ...(objet.trim() !== (c.purpose ?? "") ? { purpose: objet.trim() || null } : {}),
          ...(objectif !== (c.target ?? "") ? { target: objectif && BigInt(objectif) > 0n ? objectif : null } : {}),
          ...(montantModifiable && montant && BigInt(montant) > 0n ? { amount: montant, from: depuis } : {}),
        }),
      tx("cs.enregistre"),
    );
    if (r) setTimeout(onFini, 900);
  };
  const cloturer = async () => {
    const r = await action.lancer(() => argent.modifierCaisse(ctx.session, ctx.groupe.groupId, f.fundId, { close: true }), tx("cs.enregistre"));
    if (r) setTimeout(onFini, 900);
  };

  return (
    <form
      className="pile formulaire-encart"
      onSubmit={(e) => {
        e.preventDefault();
        void enregistrer();
      }}
    >
      <h4>{tx("cs.modifier")}</h4>
      <Champ id={`csm-nom-${f.fundId}`} libelle={tx("cs.nom")}>
        <input id={`csm-nom-${f.fundId}`} value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} />
      </Champ>
      {montantModifiable ? (
        <>
          <ChampMontant id={`csm-montant-${f.fundId}`} libelle={tx("cs.nouveauMontant")} valeur={montant} onChange={setMontant} />
          {montant ? (
            <Champ id={`csm-depuis-${f.fundId}`} libelle={tx("cs.depuis")} aide={tx("cs.depuisAide")}>
              <input id={`csm-depuis-${f.fundId}`} type="date" value={depuis} min={aujourdhui()} onChange={(e) => setDepuis(e.target.value)} />
            </Champ>
          ) : null}
        </>
      ) : null}
      <Champ id={`csm-objet-${f.fundId}`} libelle={tx("cs.objet")}>
        <input id={`csm-objet-${f.fundId}`} value={objet} maxLength={280} onChange={(e) => setObjet(e.target.value)} />
      </Champ>
      <ChampMontant id={`csm-objectif-${f.fundId}`} libelle={tx("cs.objectif")} valeur={objectif} onChange={setObjectif} />
      <Retour erreur={action.erreur} succes={action.succes} />
      <div className="actions-formulaire">
        <button type="button" className="bouton bouton-secondaire" onClick={onFini}>
          {tx("app.annuler")}
        </button>
        <button type="submit" className="bouton" disabled={action.enCours || nom.trim().length < 2 || depuis < aujourdhui()}>
          {action.enCours ? tx("app.envoi") : tx("cs.enregistrer")}
        </button>
      </div>
      <div className="zone-cloture">
        <p className="aide-champ">{tx("cs.cloreAide")}</p>
        {clore ? (
          <button type="button" className="bouton bouton-danger" disabled={action.enCours} onClick={() => void cloturer()}>
            {tx("cs.cloreConfirmer")}
          </button>
        ) : (
          <button type="button" className="bouton bouton-secondaire" onClick={() => setClore(true)}>
            {tx("cs.clore")}
          </button>
        )}
      </div>
    </form>
  );
}

export function Caisses({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, xaf, date } = useTextes();
  const nomCaisse = useNomCaisse();
  const [creer, setCreer] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const bureau = peut(ctx.roles, "fund.manage");
  const g = ctx.groupe;
  const apres = () => {
    setCreer(false);
    setEdition(null);
    ctx.rafraichir();
  };

  return (
    <Carte
      titre={tx("cs.titre")}
      actions={
        bureau && !creer ? (
          <button type="button" className="bouton bouton-compact bouton-avec-icone bouton-icone-seule" onClick={() => setCreer(true)} title={tx("cs.nouvelle")}>
            <Icone nom="plus" taille={18} />
            <span className="bouton-libelle">{tx("cs.nouvelle")}</span>
          </button>
        ) : null
      }
    >
      <p className="aide-champ">{tx("cs.intro")}</p>
      <p className="aide-champ">{tx("td.caisseTenue")}</p>
      {creer ? <NouvelleCaisse ctx={ctx} onFini={apres} /> : null}
      <ul className="liste">
        {g.funds
          .filter((f) => f.kind !== "loan" && f.kind !== "collector")
          .map((f) => (
            <li key={f.fundId} className="liste__ligne liste__ligne--haute">
              <div>
                <strong>{nomCaisse(f)}</strong>
                <RegleCaisse f={f} />
                <span className="aide-champ">
                  {tx("td.confirme")} : {xaf(f.confirmedBalance)}
                  {BigInt(f.pendingIn) > 0n ? ` · ${tx("td.enAttente")} : ${xaf(f.pendingIn)}` : ""}
                </span>
                <Progression f={f} />
                {f.custom?.closedOn ? (
                  <Pastille ton="neutre">{tx("cs.close", { date: date(f.custom.closedOn) })}</Pastille>
                ) : f.custom ? (
                  <Pastille ton="ok">{tx("cs.propre")}</Pastille>
                ) : null}
                {edition === f.fundId ? <ModifierCaisse ctx={ctx} f={f} onFini={apres} /> : null}
              </div>
              {bureau && f.custom && !f.custom.closedOn && edition !== f.fundId ? (
                <div className="liste__actions">
                  <button type="button" className="bouton bouton-secondaire bouton-compact bouton-avec-icone bouton-icone-seule" onClick={() => setEdition(f.fundId)} title={tx("cs.modifier")}>
                    <Icone nom="modifier" taille={18} />
                    <span className="bouton-libelle">{tx("cs.modifier")}</span>
                  </button>
                </div>
              ) : null}
            </li>
          ))}
      </ul>
      {!bureau ? <p className="aide-champ">{tx("cs.bureauSeul")}</p> : null}
    </Carte>
  );
}
