/* KÓMBE — préférences de notification hors application (ADR-0044) :
   SMS et e-mail désactivés par défaut (consentement explicite), heures de
   silence en heure du Cameroun. Le serveur valide tout et n'ouvre que les
   canaux possibles pour CE compte (SMS : numéro ; e-mail : adresse). */

import { useEffect, useState } from "react";
import { acces, type PreferencesNotif, type PreferencesNotifSaisie, type Session } from "./api.js";
import { Carte, Charge, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import { activerPushWeb, desactiverPushWeb, etatPushWeb, type EtatPushWeb } from "./pushWeb.js";

const HEURES = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

function saisieDe(p: PreferencesNotif): PreferencesNotifSaisie {
  return { pushEnabled: p.pushEnabled, smsEnabled: p.smsEnabled, emailEnabled: p.emailEnabled, quietStart: p.quietStart, quietEnd: p.quietEnd, mutedKinds: p.mutedKinds };
}

export function PreferencesNotifications({ session }: { readonly session: Session }) {
  const { tx, dyn } = useTextes();
  const prefs = useDonnees(() => acces.preferencesNotif(session), [session.sessionId]);
  const action = useAction();
  const [saisie, setSaisie] = useState<PreferencesNotifSaisie | null>(null);
  useEffect(() => {
    if (prefs.etat.statut === "ok") setSaisie(saisieDe(prefs.etat.donnees));
  }, [prefs.etat]);

  const enregistrer = async (maj: Partial<PreferencesNotifSaisie>) => {
    if (!saisie) return;
    const suivante = { ...saisie, ...maj };
    setSaisie(suivante);
    const r = await action.lancer(() => acces.majPreferencesNotif(session, suivante), tx("pn.enregistre"));
    if (!r) prefs.recharger(); // refus du serveur : on revient à l'état réel
  };

  return (
    <Carte titre={tx("pn.titre")}>
      <Charge etat={prefs.etat} recharger={prefs.recharger}>
        {(p) =>
          saisie ? (
            <div className="pile">
              <p className="aide">{tx("pn.intro")}</p>
              <label className="case pn-case">
                <input type="checkbox" checked={saisie.pushEnabled} disabled={action.enCours} onChange={(e) => void enregistrer({ pushEnabled: e.target.checked })} />
                <span>
                  {tx("pn.push")}
                  <br />
                  <small className="aide">{dyn("pn.pushAide", { n: p.devices })}</small>
                </span>
              </label>
              <PushNavigateur session={session} apres={prefs.recharger} />
              {p.available.sms ? (
                <label className="case pn-case">
                  <input type="checkbox" checked={saisie.smsEnabled} disabled={action.enCours} onChange={(e) => void enregistrer({ smsEnabled: e.target.checked })} />
                  <span>
                    {tx("pn.sms")}
                    <br />
                    <small className="aide">{tx("pn.smsAide")}</small>
                  </span>
                </label>
              ) : null}
              {p.available.email ? (
                <label className="case pn-case">
                  <input type="checkbox" checked={saisie.emailEnabled} disabled={action.enCours} onChange={(e) => void enregistrer({ emailEnabled: e.target.checked })} />
                  <span>
                    {tx("pn.email")}
                    <br />
                    <small className="aide">{tx("pn.emailAide")}</small>
                  </span>
                </label>
              ) : null}
              <fieldset className="pn-silence">
                <legend>{tx("pn.silence")}</legend>
                <p className="aide">{tx("pn.silenceAide")}</p>
                <label className="case">
                  <input
                    type="checkbox"
                    checked={saisie.quietStart === null}
                    disabled={action.enCours}
                    onChange={(e) => void enregistrer(e.target.checked ? { quietStart: null, quietEnd: null } : { quietStart: "21:00", quietEnd: "07:00" })}
                  />
                  {tx("pn.sansSilence")}
                </label>
                {saisie.quietStart !== null ? (
                  <div className="pn-plage">
                    <label>
                      {tx("pn.de")}{" "}
                      <select value={saisie.quietStart} disabled={action.enCours} onChange={(e) => void enregistrer({ quietStart: e.target.value })}>
                        {HEURES.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                    <label>
                      {tx("pn.a")}{" "}
                      <select value={saisie.quietEnd ?? "07:00"} disabled={action.enCours} onChange={(e) => void enregistrer({ quietEnd: e.target.value })}>
                        {HEURES.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  </div>
                ) : null}
              </fieldset>
              <Retour erreur={action.erreur} succes={action.succes} />
            </div>
          ) : null
        }
      </Charge>
    </Carte>
  );
}

/** Push Web : proposé seulement si le navigateur et le serveur le permettent. */
function PushNavigateur({ session, apres }: { readonly session: Session; readonly apres: () => void }) {
  const { tx } = useTextes();
  const [etat, setEtat] = useState<EtatPushWeb>("indisponible");
  const [cle, setCle] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);
  useEffect(() => {
    let vivant = true;
    void etatPushWeb().then((e) => {
      if (!vivant) return;
      setEtat(e.etat);
      setCle(e.cle);
    });
    return () => {
      vivant = false;
    };
  }, []);
  if (etat === "indisponible") return null;
  const basculer = async () => {
    setEnCours(true);
    setEchec(false);
    try {
      setEtat(etat === "actif" ? await desactiverPushWeb(session) : await activerPushWeb(session, cle ?? ""));
      apres();
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <div className="pn-case pn-navigateur">
      <strong>{tx("pn.nav")}</strong>
      <p className="aide">{tx("pn.navAide")}</p>
      {etat === "refuse" ? <p className="aide" role="status">{tx("pn.navRefuse")}</p> : null}
      {etat === "actif" ? <p className="aide" role="status">{tx("pn.navActif")}</p> : null}
      {echec ? <p className="erreur" role="alert">{tx("pn.navEchec")}</p> : null}
      {etat !== "refuse" ? (
        <button type="button" className="bouton bouton-secondaire" disabled={enCours} onClick={() => void basculer()}>
          {etat === "actif" ? tx("pn.navDesactiver") : tx("pn.navActiver")}
        </button>
      ) : null}
    </div>
  );
}
