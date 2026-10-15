/* KÓMBE — création d'une tontine (I-02 à I-05, L-03, L-07 à L-09, L-18).
   Étapes : Groupe, Rythme, Cotisation, Ordre, Bureau, Règlement, Récapitulatif.
   Le formulaire ne propose que ce que le serveur sait faire ; les bornes
   (2 à 60 membres) sont celles du serveur. La création appelle réellement
   POST /v1/tontines puis ouvre le groupe créé. */

import { useMemo, useState } from "react";
import type { AidEvent, Cadence, TontineSettings, Weekday } from "@kombe/domain";
import { cycle, tontines, type Session, type Simulation } from "./api.js";
import { Carte, Champ, ChampMontant, Retour, aujourdhui, useAction } from "./ui.js";
import { useTextes, type CleTexte } from "./textes.js";

export const BORNES_MEMBRES = { min: 2, max: 60 } as const;

const AID_DEFAUT: { event: AidEvent; amount: string; maxPerYear: number }[] = [
  { event: "death_member", amount: "100000", maxPerYear: 1 },
  { event: "death_spouse", amount: "50000", maxPerYear: 1 },
  { event: "death_parent", amount: "30000", maxPerYear: 2 },
  { event: "death_child", amount: "30000", maxPerYear: 2 },
  { event: "birth", amount: "15000", maxPerYear: 2 },
  { event: "marriage", amount: "20000", maxPerYear: 1 },
  { event: "illness", amount: "20000", maxPerYear: 2 },
];

/** Règlement par défaut : mêmes valeurs que `defaultSettings` côté serveur. */
export function reglementParDefaut(jour: string): TontineSettings {
  return {
    contributionPerShare: "10000",
    cadence: { kind: "weekly", weekday: 0 },
    firstMeetingDate: jour,
    deadlineTime: "18:00",
    meetingPlace: null,
    maxMembers: 12,
    transparency: "all_members",
    feeBearer: "member",
    payoutPolicy: "full_with_advance",
    newcomersLast: true,
    guarantorRequired: false,
    payoutWitnesses: 2,
    fines: {
      lateContributionFixed: "0",
      lateContributionPerDay: "0",
      lateContributionCap: "0",
      meetingLate: "0",
      meetingAbsence: "0",
      indisciplineCap: "0",
      graceDays: 2,
    },
    solidarity: { enabled: true, perMeeting: "1000", scale: AID_DEFAUT },
    operating: { enabled: true, perMeeting: "500" },
    yearEndReserve: { enabled: false, perMeeting: "0" },
  };
}

/** Écart moyen en jours entre deux séances (estimation affichée, pas une règle). */
export function joursEntreSeances(c: Cadence): number {
  switch (c.kind) {
    case "daily":
      return 7 / Math.max(1, 7 - (c.excludedWeekdays?.length ?? 0));
    case "every_n_days":
      return c.n;
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    default:
      return 30.4;
  }
}

/** Première date conforme au rythme à partir de la date choisie (même règle que le serveur). */
export function premiereSeance(c: Cadence, depart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(depart);
  if (!m) return depart;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const jour = 86_400_000;
  for (let i = 0; i < 62; i++) {
    const t = new Date(d.getTime() + i * jour);
    const wd = t.getUTCDay();
    if (c.kind === "weekly" || c.kind === "biweekly") {
      if (wd === c.weekday) return iso(t);
    } else if (c.kind === "monthly_day") {
      const dernier = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      if (t.getUTCDate() === Math.min(c.day, dernier)) return iso(t);
    } else if (c.kind === "monthly_nth_weekday") {
      if (wd !== c.weekday) continue;
      const rang = Math.floor((t.getUTCDate() - 1) / 7) + 1;
      const dernierDuMois = new Date(t.getTime() + 7 * jour).getUTCMonth() !== t.getUTCMonth();
      if (c.nth === -1 ? dernierDuMois : rang === c.nth) return iso(t);
    } else if (c.kind === "daily") {
      if (!(c.excludedWeekdays ?? []).includes(wd as Weekday)) return iso(t);
    } else {
      return iso(t);
    }
  }
  return depart;
}

export function dureeLisible(jours: number, langue: "fr" | "en" | "pcm"): string {
  if (jours < 60) {
    const s = Math.max(1, Math.round(jours / 7));
    return langue !== "fr" ? `${s} week${s > 1 ? "s" : ""}` : `${s} semaine${s > 1 ? "s" : ""}`;
  }
  const m = Math.round(jours / 30.4);
  return langue !== "fr" ? `${m} months` : `${m} mois`;
}

const ETAPES: CleTexte[] = ["cr.e.groupe", "cr.e.rythme", "cr.e.cotisation", "cr.e.ordre", "cr.e.bureau", "cr.e.reglement", "cr.e.recap"];
const JOURS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export interface Edition {
  readonly groupId: string;
  readonly name: string;
  readonly settings: TontineSettings;
  /** Cycle démarré : le règlement se lit, il ne se modifie plus. */
  readonly verrouille: boolean;
}

export function Creation({
  session,
  onCree,
  onAnnuler,
  edition,
}: {
  readonly session: Session;
  readonly onCree: (groupId: string) => void;
  readonly onAnnuler: () => void;
  readonly edition?: Edition;
}) {
  const { tx, dyn, xaf, langue, date } = useTextes();
  const [etape, setEtape] = useState(edition?.verrouille ? 6 : 0);
  const [nom, setNom] = useState(edition?.name ?? "");
  const [monNom, setMonNom] = useState("");
  const [r, setR] = useState<TontineSettings>(() => {
    const base = edition?.settings ?? reglementParDefaut(aujourdhui());
    // Le montant par part est un paramètre d'admin : en création il n'est
    // JAMAIS pré-rempli à la place du bureau (l'étape Cotisation l'exige).
    return edition ? base : { ...base, contributionPerShare: "" };
  });
  const action = useAction();
  const maj = (p: Partial<TontineSettings>) => setR((x) => ({ ...x, ...p }));

  const parts = r.maxMembers;
  const cagnotte = (BigInt(r.contributionPerShare || "0") * BigInt(parts)).toString();
  const duree = dureeLisible(joursEntreSeances(r.cadence) * parts, langue);

  const etapeValide = useMemo(() => {
    switch (etape) {
      case 0:
        return nom.trim().length >= 2 && (edition !== undefined || monNom.trim().length >= 2);
      case 1:
        return /^\d{4}-\d{2}-\d{2}$/.test(r.firstMeetingDate) && /^\d{2}:\d{2}$/.test(r.deadlineTime);
      case 2:
        return BigInt(r.contributionPerShare || "0") > 0n && r.maxMembers >= BORNES_MEMBRES.min && r.maxMembers <= BORNES_MEMBRES.max;
      default:
        return true;
    }
  }, [etape, nom, monNom, r, edition]);

  const creer = async () => {
    const d = await action.lancer(() =>
      edition
        ? tontines.majReglement(session, edition.groupId, nom.trim(), r)
        : tontines.creer(session, { name: nom.trim(), founderDisplayName: monNom.trim(), settings: r }),
    );
    if (d) onCree(d.groupId);
  };

  const changerCadence = (kind: Cadence["kind"]) => {
    const wd = "weekday" in r.cadence ? r.cadence.weekday : 0;
    const c: Cadence =
      kind === "daily"
        ? { kind, excludedWeekdays: [0] }
        : kind === "every_n_days"
          ? { kind, n: 8 }
          : kind === "monthly_day"
            ? { kind, day: Number(r.firstMeetingDate.slice(8, 10)) || 1 }
            : kind === "monthly_nth_weekday"
              ? { kind, nth: 2, weekday: wd }
              : { kind, weekday: wd };
    maj({ cadence: c });
  };

  return (
    <Carte titre={edition ? tx("td.reglages") : tx("cr.titre")} id="cr-titre">
      <ol className="etapes-creation" aria-label={tx("cr.etape", { n: etape + 1, total: ETAPES.length })}>
        {ETAPES.map((cle, i) => (
          <li key={cle} aria-current={i === etape ? "step" : undefined} className={i < etape ? "fait" : i === etape ? "courant" : ""}>
            {tx(cle)}
          </li>
        ))}
      </ol>
      <p className="aide-champ">{tx("cr.etape", { n: etape + 1, total: ETAPES.length })}</p>

      <div className="pile">
        {etape === 0 ? (
          <>
            <Champ id="cr-nom" libelle={tx("cr.nom")} aide={tx("cr.nomAide")}>
              <input id="cr-nom" value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} aria-describedby="cr-nom-aide" />
            </Champ>
            {edition ? null : (
              <Champ id="cr-monnom" libelle={tx("cr.monNom")} aide={tx("cr.monNomAide")}>
                <input id="cr-monnom" value={monNom} maxLength={80} onChange={(e) => setMonNom(e.target.value)} aria-describedby="cr-monnom-aide" />
              </Champ>
            )}
          </>
        ) : null}

        {etape === 1 ? (
          <>
            <Champ id="cr-cadence" libelle={tx("cr.cadence")}>
              <select id="cr-cadence" value={r.cadence.kind} onChange={(e) => changerCadence(e.target.value as Cadence["kind"])}>
                {(["weekly", "biweekly", "every_n_days", "monthly_day", "monthly_nth_weekday", "daily"] as const).map((k) => (
                  <option key={k} value={k}>
                    {tx(`cr.c.${k}` as CleTexte)}
                  </option>
                ))}
              </select>
            </Champ>
            {r.cadence.kind === "every_n_days" ? (
              <Champ id="cr-n" libelle={tx("cr.n")}>
                <input
                  id="cr-n"
                  type="number"
                  min={2}
                  max={31}
                  value={r.cadence.n}
                  onChange={(e) => maj({ cadence: { kind: "every_n_days", n: Math.min(31, Math.max(2, Number(e.target.value) || 2)) } })}
                />
              </Champ>
            ) : null}
            {r.cadence.kind === "monthly_day" ? (
              <Champ id="cr-jourmois" libelle={tx("cr.quantieme")}>
                <input
                  id="cr-jourmois"
                  type="number"
                  min={1}
                  max={31}
                  value={r.cadence.day}
                  onChange={(e) => maj({ cadence: { kind: "monthly_day", day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) } })}
                />
              </Champ>
            ) : null}
            {r.cadence.kind === "monthly_nth_weekday" ? (
              <Champ id="cr-rang" libelle={tx("cr.rang")}>
                <select
                  id="cr-rang"
                  value={r.cadence.nth}
                  onChange={(e) => r.cadence.kind === "monthly_nth_weekday" && maj({ cadence: { ...r.cadence, nth: Number(e.target.value) as 1 | 2 | 3 | 4 | -1 } })}
                >
                  {([1, 2, 3, 4, -1] as const).map((n) => (
                    <option key={n} value={n}>
                      {tx(`cr.rang.${n}` as CleTexte)}
                    </option>
                  ))}
                </select>
              </Champ>
            ) : null}
            {"weekday" in r.cadence ? (
              <Champ id="cr-jour" libelle={tx("cr.jour")}>
                <select
                  id="cr-jour"
                  value={r.cadence.weekday}
                  onChange={(e) => {
                    const weekday = Number(e.target.value) as Weekday;
                    if ("weekday" in r.cadence) maj({ cadence: { ...r.cadence, weekday } as Cadence });
                  }}
                >
                  {JOURS.map((j) => (
                    <option key={j} value={j}>
                      {dyn(`jour.${j}`)}
                    </option>
                  ))}
                </select>
              </Champ>
            ) : null}
            {r.cadence.kind === "daily" ? (
              <fieldset className="champ">
                <legend>{tx("cr.jour")}</legend>
                <div className="cases">
                  {JOURS.map((j) => {
                    const exclus = r.cadence.kind === "daily" ? (r.cadence.excludedWeekdays ?? []) : [];
                    const actif = !exclus.includes(j);
                    return (
                      <label key={j} className="case">
                        <input
                          type="checkbox"
                          checked={actif}
                          onChange={() => {
                            const suivant = actif ? [...exclus, j] : exclus.filter((x) => x !== j);
                            if (suivant.length <= 6) maj({ cadence: { kind: "daily", excludedWeekdays: suivant } });
                          }}
                        />
                        {dyn(`jour.${j}`)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            <Champ id="cr-premiere" libelle={tx("cr.premiere")}>
              <input id="cr-premiere" type="date" value={r.firstMeetingDate} min={aujourdhui()} onChange={(e) => maj({ firstMeetingDate: e.target.value })} />
            </Champ>
            <p className="msg msg--info">{tx("cr.premiereReelle", { date: date(premiereSeance(r.cadence, r.firstMeetingDate)) })}</p>
            <Champ id="cr-heure" libelle={tx("cr.heure")}>
              <input id="cr-heure" type="time" value={r.deadlineTime} onChange={(e) => maj({ deadlineTime: e.target.value })} />
            </Champ>
            <Champ id="cr-lieu" libelle={tx("cr.lieu")}>
              <input id="cr-lieu" value={r.meetingPlace ?? ""} maxLength={120} onChange={(e) => maj({ meetingPlace: e.target.value.trim() ? e.target.value : null })} />
            </Champ>
          </>
        ) : null}

        {etape === 2 ? (
          <>
            <ChampMontant id="cr-montant" libelle={tx("cr.montant")} aide={tx("cr.montantAide")} valeur={r.contributionPerShare} onChange={(v) => maj({ contributionPerShare: v })} />
            <Champ id="cr-max" libelle={tx("cr.maxMembres", BORNES_MEMBRES)}>
              <input
                id="cr-max"
                type="number"
                min={BORNES_MEMBRES.min}
                max={BORNES_MEMBRES.max}
                value={r.maxMembers}
                onChange={(e) => maj({ maxMembers: Math.min(BORNES_MEMBRES.max, Math.max(BORNES_MEMBRES.min, Number(e.target.value) || BORNES_MEMBRES.min)) })}
              />
            </Champ>
            <p className="msg msg--info">{tx("cr.cagnotte", { montant: xaf(cagnotte), n: parts })}</p>
            <p className="msg msg--info">{tx("cr.duree", { n: parts, duree })}</p>
          </>
        ) : null}

        {etape === 3 ? (
          <>
            <p>{tx("cr.ordreAide")}</p>
            <label className="case">
              <input type="checkbox" checked={r.newcomersLast} onChange={(e) => maj({ newcomersLast: e.target.checked })} />
              {tx("cr.nouveauxDerniers")}
            </label>
            <Champ id="cr-politique" libelle={tx("cr.remise")}>
              <select id="cr-politique" value={r.payoutPolicy} onChange={(e) => maj({ payoutPolicy: e.target.value as TontineSettings["payoutPolicy"] })}>
                {(["full_with_advance", "reduced", "wait"] as const).map((p) => (
                  <option key={p} value={p}>
                    {tx(`cr.p.${p}` as CleTexte)}
                  </option>
                ))}
              </select>
            </Champ>
          </>
        ) : null}

        {etape === 4 ? (
          <>
            <label className="case">
              <input type="checkbox" checked={r.guarantorRequired} onChange={(e) => maj({ guarantorRequired: e.target.checked })} />
              {tx("cr.avaliseur")}
            </label>
            <Champ id="cr-temoins" libelle={tx("cr.temoins")}>
              <input id="cr-temoins" type="number" min={0} max={5} value={r.payoutWitnesses} onChange={(e) => maj({ payoutWitnesses: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })} />
            </Champ>
            <Champ id="cr-transparence" libelle={tx("cr.transparence")}>
              <select id="cr-transparence" value={r.transparency} onChange={(e) => maj({ transparency: e.target.value as TontineSettings["transparency"] })}>
                {(["all_members", "bureau_only", "anonymized"] as const).map((v) => (
                  <option key={v} value={v}>
                    {tx(`cr.t.${v}` as CleTexte)}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ id="cr-frais" libelle={tx("cr.frais")}>
              <select id="cr-frais" value={r.feeBearer} onChange={(e) => maj({ feeBearer: e.target.value as TontineSettings["feeBearer"] })}>
                {(["member", "beneficiary", "fund"] as const).map((v) => (
                  <option key={v} value={v}>
                    {tx(`cr.f.${v}` as CleTexte)}
                  </option>
                ))}
              </select>
            </Champ>
          </>
        ) : null}

        {etape === 5 ? (
          <>
            <CaisseAnnexe
              id="cr-secours"
              libelle={tx("cr.secours")}
              actif={r.solidarity.enabled}
              montant={r.solidarity.perMeeting}
              onChange={(enabled, perMeeting) => maj({ solidarity: { ...r.solidarity, enabled, perMeeting } })}
            />
            {r.solidarity.enabled ? (
              <fieldset className="champ">
                <legend>{tx("cr.bareme")}</legend>
                {r.solidarity.scale.map((l, i) => (
                  <div key={l.event} className="ligne-bareme">
                    <span>{dyn(`di.ev.${l.event}`)}</span>
                    <input
                      aria-label={`${dyn(`di.ev.${l.event}`)} — FCFA`}
                      inputMode="numeric"
                      value={l.amount}
                      onChange={(e) => {
                        const scale = r.solidarity.scale.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/\D/g, "").slice(0, 10) || "0" } : x));
                        maj({ solidarity: { ...r.solidarity, scale } });
                      }}
                    />
                    <input
                      aria-label={`${dyn(`di.ev.${l.event}`)} — ${tx("cr.parAn")}`}
                      type="number"
                      min={0}
                      max={52}
                      value={l.maxPerYear}
                      onChange={(e) => {
                        const scale = r.solidarity.scale.map((x, j) => (j === i ? { ...x, maxPerYear: Math.min(52, Math.max(0, Number(e.target.value) || 0)) } : x));
                        maj({ solidarity: { ...r.solidarity, scale } });
                      }}
                    />
                    <span className="aide-champ">{tx("cr.parAn")}</span>
                  </div>
                ))}
              </fieldset>
            ) : null}
            <CaisseAnnexe
              id="cr-fonct"
              libelle={tx("cr.fonctionnement")}
              actif={r.operating.enabled}
              montant={r.operating.perMeeting}
              onChange={(enabled, perMeeting) => maj({ operating: { enabled, perMeeting } })}
            />
            <CaisseAnnexe
              id="cr-reserve"
              libelle={tx("cr.reserve")}
              actif={r.yearEndReserve.enabled}
              montant={r.yearEndReserve.perMeeting}
              onChange={(enabled, perMeeting) => maj({ yearEndReserve: { enabled, perMeeting } })}
            />
            <fieldset className="champ">
              <legend>{tx("cr.amendes")}</legend>
              {(["lateContributionFixed", "lateContributionPerDay", "lateContributionCap", "meetingLate", "meetingAbsence", "indisciplineCap"] as const).map((k) => (
                <ChampMontant
                  key={k}
                  id={`cr-a-${k}`}
                  libelle={tx(`cr.a.${k}` as CleTexte)}
                  valeur={r.fines[k]}
                  onChange={(v) => maj({ fines: { ...r.fines, [k]: v || "0" } })}
                />
              ))}
              <Champ id="cr-grace" libelle={tx("cr.a.graceDays")}>
                <input
                  id="cr-grace"
                  type="number"
                  min={0}
                  max={30}
                  value={r.fines.graceDays}
                  onChange={(e) => maj({ fines: { ...r.fines, graceDays: Math.min(30, Math.max(0, Number(e.target.value) || 0)) } })}
                />
              </Champ>
            </fieldset>
          </>
        ) : null}

        {etape === 6 ? (
          <>
            {edition?.verrouille ? null : <p>{tx("cr.verifiez")}</p>}
            <dl className="recap">
              <dt>{tx("cr.nom")}</dt>
              <dd>{nom}</dd>
              <dt>{tx("cr.cadence")}</dt>
              <dd>
                {tx(`cr.c.${r.cadence.kind}` as CleTexte)}
                {"weekday" in r.cadence ? ` — ${dyn(`jour.${r.cadence.weekday}`)}` : ""} · {r.deadlineTime}
              </dd>
              <dt>{tx("cr.premiere")}</dt>
              <dd>{r.firstMeetingDate}</dd>
              <dt>{tx("cr.montant")}</dt>
              <dd>{xaf(r.contributionPerShare)}</dd>
              <dt>{tx("cr.maxMembres", BORNES_MEMBRES)}</dt>
              <dd>{r.maxMembers}</dd>
              <dt>{tx("cr.remise")}</dt>
              <dd>{tx(`cr.p.${r.payoutPolicy}` as CleTexte)}</dd>
              <dt>{tx("cr.transparence")}</dt>
              <dd>{tx(`cr.t.${r.transparency}` as CleTexte)}</dd>
              <dt>{tx("cr.secours")}</dt>
              <dd>{r.solidarity.enabled ? xaf(r.solidarity.perMeeting) : "—"}</dd>
              <dt>{tx("cr.fonctionnement")}</dt>
              <dd>{r.operating.enabled ? xaf(r.operating.perMeeting) : "—"}</dd>
              <dt>{tx("cr.reserve")}</dt>
              <dd>{r.yearEndReserve.enabled ? xaf(r.yearEndReserve.perMeeting) : "—"}</dd>
            </dl>
            <p className="msg msg--info">{tx("cr.cagnotte", { montant: xaf(cagnotte), n: parts })}</p>
            {edition?.verrouille ? null : <Simulateur session={session} reglement={r} />}
          </>
        ) : null}

        <Retour erreur={action.erreur} succes={action.succes} />
        {edition?.verrouille ? null : (
        <div className="actions-formulaire">
          {etape === 0 ? (
            <button type="button" className="bouton bouton-secondaire" onClick={onAnnuler}>
              {tx("app.annuler")}
            </button>
          ) : (
            <button type="button" className="bouton bouton-secondaire" onClick={() => setEtape((e) => e - 1)}>
              {tx("cr.precedent")}
            </button>
          )}
          {etape < ETAPES.length - 1 ? (
            <button type="button" className="bouton" disabled={!etapeValide} onClick={() => setEtape((e) => e + 1)}>
              {tx("cr.suivant")}
            </button>
          ) : (
            <button type="button" className="bouton" disabled={action.enCours} onClick={() => void creer()}>
              {action.enCours ? tx("app.envoi") : edition ? tx("app.enregistrer") : tx("cr.creer")}
            </button>
          )}
        </div>
        )}
      </div>
    </Carte>
  );
}

function CaisseAnnexe({
  id,
  libelle,
  actif,
  montant,
  onChange,
}: {
  readonly id: string;
  readonly libelle: string;
  readonly actif: boolean;
  readonly montant: string;
  readonly onChange: (enabled: boolean, perMeeting: string) => void;
}) {
  const { tx } = useTextes();
  return (
    <div className="caisse-annexe">
      <label className="case">
        <input type="checkbox" checked={actif} onChange={(e) => onChange(e.target.checked, e.target.checked ? montant : "0")} />
        {libelle}
      </label>
      {actif ? <ChampMontant id={id} libelle={tx("cr.parSeance")} valeur={montant} onChange={(v) => onChange(true, v || "0")} /> : null}
    </div>
  );
}

/** Simulateur (ADR-0039) : les vraies dates de chaque séance avant de créer. */
function Simulateur({ session, reglement: r }: { readonly session: Session; readonly reglement: TontineSettings }) {
  const { tx, date } = useTextes();
  const [sim, setSim] = useState<Simulation | null>(null);
  const action = useAction();
  const annexes = [r.solidarity, r.operating, r.yearEndReserve].reduce((t, f) => (f.enabled ? t + BigInt(f.perMeeting || "0") : t), 0n);
  const simuler = async () => {
    const out = await action.lancer(() =>
      cycle.simuler(session, {
        cadence: r.cadence,
        firstMeetingDate: r.firstMeetingDate,
        shares: Math.max(2, Math.min(60, r.maxMembers)),
        contributionPerShare: r.contributionPerShare,
        ...(annexes > 0n ? { sidePerMeeting: annexes.toString() } : {}),
      }),
    );
    if (out) setSim(out);
  };
  return (
    <Carte titre={tx("cr.simulation")}>
      <Retour erreur={action.erreur} />
      {sim ? (
        <>
          <p>{sim.summary}</p>
          <ol className="liste liste--ordre">
            {sim.dates.map((d, i) => (
              <li key={d} className="liste__ligne">
                <span>
                  {i + 1}. {date(d)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <button type="button" className="bouton bouton-secondaire" disabled={action.enCours} onClick={() => void simuler()}>
          {tx("cr.simuler")}
        </button>
      )}
    </Carte>
  );
}
