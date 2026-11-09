/* KÓMBE — votes libres (0041) : tout membre actif pose une question au
   groupe, avec ses propres réponses (et, s'il le veut, une réponse libre).
   Un vote libre éclaire le groupe : il ne décide rien tout seul. Chacun peut
   changer sa réponse tant que le vote est ouvert. */

import { useState } from "react";
import { votes, type OuvertureVote, type PollView } from "./api.js";
import { Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { Icone } from "../composants/Icones.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

const TON: Record<PollView["state"], "attente" | "ok" | "neutre"> = { open: "attente", closed: "ok", cancelled: "neutre" };

export function VotesLibres({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx } = useTextes();
  const gid = ctx.groupe.groupId;
  const liste = useDonnees(() => votes.liste(ctx.session, gid), [gid]);
  const [ouvrir, setOuvrir] = useState(false);
  const [voirClos, setVoirClos] = useState(false);
  return (
    <Carte
      titre={tx("vl.titre")}
      actions={
        !ouvrir ? (
          <button type="button" className="bouton bouton-compact bouton-avec-icone" onClick={() => setOuvrir(true)}>
            <Icone nom="plus" taille={18} />
            <span className="bouton-libelle">{tx("vl.nouveau")}</span>
          </button>
        ) : null
      }
    >
      <p className="aide-champ">{tx("vl.regle")}</p>
      {ouvrir ? (
        <FormulaireVote
          ctx={ctx}
          onFini={(ok) => {
            setOuvrir(false);
            if (ok) liste.recharger();
          }}
        />
      ) : null}
      <Charge etat={liste.etat} recharger={liste.recharger}>
        {(items) => {
          const ouverts = items.filter((p) => p.state === "open");
          const clos = items.filter((p) => p.state !== "open");
          return (
            <div className="pile">
              {ouverts.length === 0 ? <p className="etat-vide-ligne">{tx("vl.aucunOuvert")}</p> : null}
              <ul className="liste">
                {ouverts.map((p) => (
                  <LigneVote key={p.pollId} ctx={ctx} p={p} onFini={liste.recharger} />
                ))}
              </ul>
              {clos.length > 0 ? (
                <>
                  <button type="button" className="bouton bouton-secondaire bouton-compact" aria-expanded={voirClos} onClick={() => setVoirClos((v) => !v)}>
                    {voirClos ? tx("vl.masquerClos") : tx("vl.voirClos", { n: clos.length })}
                  </button>
                  {voirClos ? (
                    <ul className="liste">
                      {clos.map((p) => (
                        <LigneVote key={p.pollId} ctx={ctx} p={p} onFini={liste.recharger} />
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        }}
      </Charge>
    </Carte>
  );
}

function LigneVote({ ctx, p, onFini }: { readonly ctx: ContexteGroupe; readonly p: PollView; readonly onFini: () => void }) {
  const { tx, dyn, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const action = useAction();
  const [choix, setChoix] = useState<number[]>(() => [...(p.myBallot?.choices ?? [])]);
  const [libre, setLibre] = useState(p.myBallot?.freeAnswer ?? "");
  const [detail, setDetail] = useState(false);
  const ouvert = p.state === "open";
  const total = Math.max(1, p.ballotCount);
  const basculer = (i: number) =>
    setChoix((c) => (p.multiple ? (c.includes(i) ? c.filter((x) => x !== i) : [...c, i].sort((a, b) => a - b)) : c.includes(i) ? [] : [i]));
  const pret = choix.length > 0 || libre.trim().length > 0;
  const lancer = (fn: () => Promise<unknown>) => void action.lancer(fn).then((r) => r && onFini());
  return (
    <li className="liste__ligne liste__ligne--haute vote-libre">
      <div className="pile">
        <strong>{p.question}</strong>
        <span className="aide-champ">
          {tx("vl.par", { nom: p.createdByName, date: date(p.createdAt) })}
          {p.closesAt && ouvert ? ` · ${tx("vl.jusqua", { date: date(p.closesAt) })}` : ""}
          {p.anonymous ? ` · ${tx("vl.anonyme")}` : ""}
        </span>
        {p.details ? <p className="aide-champ">{p.details}</p> : null}
        <Pastille ton={TON[p.state]}>{dyn(`vl.e.${p.state}`)}</Pastille>
        <fieldset className="vote-libre__options" disabled={!ouvert || action.enCours}>
          <legend className="visuellement-cache">{p.question}</legend>
          {p.options.map((o, i) => {
            const n = p.counts[i] ?? 0;
            const pct = Math.round((n * 100) / total);
            return (
              <label key={i} className={choix.includes(i) ? "vote-libre__option vote-libre__option--choisie" : "vote-libre__option"}>
                <input type={p.multiple ? "checkbox" : "radio"} name={`vl-${p.pollId}`} checked={choix.includes(i)} onChange={() => basculer(i)} />
                <span className="vote-libre__texte">{o}</span>
                <span className="vote-libre__compte">{tx("vl.voix", { n })}</span>
                <span className="vote-libre__barre" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </span>
              </label>
            );
          })}
          {p.allowFreeAnswer && ouvert ? (
            <Champ id={`vl-libre-${p.pollId}`} libelle={p.options.length ? tx("vl.autre") : tx("vl.reponse")}>
              <input id={`vl-libre-${p.pollId}`} value={libre} maxLength={300} onChange={(e) => setLibre(e.target.value)} />
            </Champ>
          ) : null}
        </fieldset>
        <span className="aide-champ">{tx("vl.participation", { n: p.ballotCount, total: p.electorate })}</span>
        {p.freeAnswers.length > 0 || (p.voters && p.voters.length > 0) ? (
          <button type="button" className="bouton-lien" aria-expanded={detail} onClick={() => setDetail((d) => !d)}>
            {detail ? tx("vl.masquerReponses") : tx("vl.voirReponses")}
          </button>
        ) : null}
        {detail ? (
          <ul className="vote-libre__reponses">
            {p.voters?.map((v) => (
              <li key={v.membershipId}>
                {v.name} : {v.choices.map((c) => p.options[c]).join(", ") || "—"}
              </li>
            ))}
            {p.freeAnswers.map((f, i) => (
              <li key={`f${i}`}>
                « {f.text} »{f.name ? ` — ${f.name}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <Retour erreur={action.erreur} succes={action.succes} />
      </div>
      <div className="liste__actions">
        {ouvert ? (
          <button
            type="button"
            className="bouton bouton-compact"
            disabled={action.enCours || !pret}
            onClick={() => lancer(() => votes.repondre(ctx.session, gid, p.pollId, choix, libre.trim() || undefined))}
          >
            {p.myBallot ? tx("vl.changer") : tx("vl.repondre")}
          </button>
        ) : null}
        {ouvert && p.canManage ? (
          <>
            <button type="button" className="bouton bouton-secondaire bouton-compact" disabled={action.enCours} onClick={() => lancer(() => votes.clore(ctx.session, gid, p.pollId))}>
              {tx("vl.clore")}
            </button>
            <button type="button" className="bouton bouton-secondaire bouton-compact bouton-icone-seule" title={tx("vl.annuler")} disabled={action.enCours} onClick={() => lancer(() => votes.annuler(ctx.session, gid, p.pollId))}>
              <Icone nom="fermer" taille={18} />
              <span className="bouton-libelle">{tx("vl.annuler")}</span>
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function FormulaireVote({ ctx, onFini }: { readonly ctx: ContexteGroupe; readonly onFini: (ok: boolean) => void }) {
  const { tx } = useTextes();
  const action = useAction();
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [libre, setLibre] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [anonyme, setAnonyme] = useState(false);
  const [duree, setDuree] = useState(0);
  const remplies = options.map((o) => o.trim()).filter(Boolean);
  const pret = question.trim().length >= 3 && (remplies.length >= 2 || (remplies.length === 0 && libre));
  const corps = (): OuvertureVote => ({
    question: question.trim(),
    ...(details.trim() ? { details: details.trim() } : {}),
    options: remplies,
    allowFreeAnswer: libre,
    multiple: multiple && remplies.length >= 2,
    anonymous: anonyme,
    ...(duree > 0 ? { hours: duree } : {}),
  });
  return (
    <div className="formulaire-encart pile">
      <Retour erreur={action.erreur} succes={action.succes} />
      <Champ id="vl-question" libelle={tx("vl.question")}>
        <input id="vl-question" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} placeholder={tx("vl.questionEx")} />
      </Champ>
      <Champ id="vl-details" libelle={tx("vl.details")}>
        <textarea id="vl-details" value={details} maxLength={2000} rows={2} onChange={(e) => setDetails(e.target.value)} />
      </Champ>
      <fieldset className="pile">
        <legend>{tx("vl.reponses")}</legend>
        {options.map((o, i) => (
          <div key={i} className="vote-libre__ligne">
            <input aria-label={tx("vl.reponseN", { n: i + 1 })} value={o} maxLength={120} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            {options.length > 2 ? (
              <button type="button" className="bouton bouton-secondaire bouton-compact bouton-icone-seule" title={tx("vl.retirer")} onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                <Icone nom="fermer" taille={16} />
                <span className="bouton-libelle">{tx("vl.retirer")}</span>
              </button>
            ) : null}
          </div>
        ))}
        {options.length < 10 ? (
          <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => setOptions([...options, ""])}>
            {tx("vl.ajouterReponse")}
          </button>
        ) : null}
      </fieldset>
      <label className="case">
        <input type="checkbox" checked={libre} onChange={(e) => setLibre(e.target.checked)} /> {tx("vl.optLibre")}
      </label>
      <label className="case">
        <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> {tx("vl.optMultiple")}
      </label>
      <label className="case">
        <input type="checkbox" checked={anonyme} onChange={(e) => setAnonyme(e.target.checked)} /> {tx("vl.optAnonyme")}
      </label>
      <Champ id="vl-duree" libelle={tx("vl.duree")}>
        <select id="vl-duree" value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
          <option value={0}>{tx("vl.dureeLibre")}</option>
          <option value={24}>{tx("vl.heures", { n: 24 })}</option>
          <option value={72}>{tx("vl.heures", { n: 72 })}</option>
          <option value={168}>{tx("vl.semaine")}</option>
        </select>
      </Champ>
      <div className="actions-formulaire">
        <button type="button" className="bouton bouton-secondaire" onClick={() => onFini(false)}>
          {tx("app.annuler")}
        </button>
        <button type="button" className="bouton" disabled={action.enCours || !pret} onClick={() => void action.lancer(() => votes.ouvrir(ctx.session, ctx.groupe.groupId, corps())).then((r) => r && onFini(true))}>
          {tx("vl.ouvrir")}
        </button>
      </div>
    </div>
  );
}
