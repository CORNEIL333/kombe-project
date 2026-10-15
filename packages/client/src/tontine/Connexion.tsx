/* KÓMBE — connexion par téléphone (L-01, I-20) : numéro +237, code à 6
   chiffres par SMS (WhatsApp en option), e-mail en seconde voie pour qui n'a
   pas de réseau SMS. Le serveur ne dit jamais si le compte existe : le premier
   code vérifié crée le compte. À la première connexion, on demande le nom. */

import { useEffect, useState, type FormEvent } from "react";
import { acces, memoriserSession, type Session } from "./api.js";
import { Champ, Retour, useAction } from "./ui.js";
import { useTextes } from "./textes.js";
import { LogoKombe } from "../composants/Marque.js";
import { Orbite } from "../composants/Orbite.js";
import { urlPhoto } from "../composants/Scene.js";
import { Icone, type NomIcone } from "../composants/Icones.js";
import { useLangue } from "../i18n/ContexteLangue.js";
import type { CleI18n } from "../i18n/dictionnaires.js";

const ATOUTS: ReadonlyArray<{ readonly icone: NomIcone; readonly titre: CleI18n; readonly texte: CleI18n }> = [
  { icone: "validation", titre: "atout.verifie.titre", texte: "atout.verifie.texte" },
  { icone: "registre", titre: "atout.registre.titre", texte: "atout.registre.texte" },
  { icone: "horsLigne", titre: "atout.horsLigne.titre", texte: "atout.horsLigne.texte" },
  { icone: "trace", titre: "atout.trace.titre", texte: "atout.trace.texte" },
];

function PanneauMarque() {
  const { t } = useLangue();
  return (
    <aside className="panneau-marque">
      <img className="panneau-marque__photo" src={urlPhoto("hero-cercle")} alt="" aria-hidden="true" decoding="async" />
      <span className="panneau-marque__voile" aria-hidden="true" />
      <div className="panneau-marque__marque">
        <LogoKombe hauteur={22} />
        <small>{t("marque.tagline")}</small>
      </div>
      <Orbite className="panneau-marque__orbite" total={8} courant={3} variante="marque" photo={urlPhoto("onboarding-portrait")} taille={340} />
      <div className="panneau-marque__corps">
        <h1>
          {t("connexion.headlinePlain")} <em>{t("connexion.headlineAccent")}</em>
        </h1>
        <p>{t("connexion.sousAccroche")}</p>
        <ul className="panneau-marque__atouts">
          {ATOUTS.map((a) => (
            <li key={a.titre}>
              <span className="icone" aria-hidden="true">
                <Icone nom={a.icone} />
              </span>
              <span>
                <strong>{t(a.titre)}</strong>
                <span>{t(a.texte)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="panneau-marque__signature">{t("connexion.signature")}</p>
    </aside>
  );
}

type Voie = "sms" | "whatsapp" | "email";

export function ConnexionTelephone({ onConnecte }: { readonly onConnecte: (s: Session) => void }) {
  const { tx } = useTextes();
  const [voie, setVoie] = useState<Voie>("sms");
  const [login, setLogin] = useState("");
  const [loginEnvoye, setLoginEnvoye] = useState<string | null>(null);
  const [codeTest, setCodeTest] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [nom, setNom] = useState("");
  const action = useAction();
  // Lien « Créer un compte » du site (#/inscription) : même parcours par code,
  // le premier code vérifié crée le compte ; seul le message d'accueil change.
  const inscription = typeof window !== "undefined" && window.location.hash.indexOf("#/inscription") === 0;
  // Canaux réellement ouverts sur ce déploiement (ex. pas encore de compte SMS :
  // seule la connexion par e-mail est proposée). En cas d'échec : tous affichés.
  const [canaux, setCanaux] = useState<readonly Voie[]>(["sms", "whatsapp", "email"]);
  useEffect(() => {
    let actif = true;
    acces.canaux().then(
      (c) => {
        if (!actif) return;
        const ouverts = (["sms", "whatsapp", "email"] as const).filter((v) => c[v]);
        if (ouverts.length) {
          setCanaux(ouverts);
          setVoie((v) => (ouverts.includes(v) ? v : (ouverts[0] as Voie)));
        }
      },
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, []);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const r = await action.lancer(() => acces.demanderCode(login.trim(), voie));
    if (r) {
      setLoginEnvoye(r.login);
      // Double garde-fou : le serveur n'envoie devCode qu'en développement,
      // l'UI refuse de l'afficher dans un build de production.
      setCodeTest(import.meta.env.DEV ? (r.devCode ?? null) : null);
      setCode("");
    }
  };

  const verifier = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginEnvoye) return;
    const r = await action.lancer(async () => {
      // E-mail via Neon Auth (ADR-0040) : relayé par l'API, aucun appel tiers ici.
      const res = await acces.verifierCode(loginEnvoye, code);
      const s: Session = { sessionId: res.sessionId, identityId: res.identityId, expiresAt: res.expiresAt };
      const moi = await acces.moi(s);
      return { s, moi };
    });
    if (!r) return;
    memoriserSession(r.s);
    if (r.moi.displayName) onConnecte(r.s);
    else setSession(r.s);
  };

  const enregistrerNom = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const ok = await action.lancer(() => acces.majMoi(session, { displayName: nom.trim() }));
    if (ok) onConnecte(session);
  };

  return (
    <div className="ecran-connexion">
      <PanneauMarque />
      <section className="panneau-formulaire" aria-labelledby="cx-titre">
        <div className="panneau-formulaire__interieur">
          <header className="panneau-formulaire__entete">
            <LogoKombe hauteur={26} />
            <h2 id="cx-titre">
              {inscription ? tx("cx.inscriptionTitre") : (
                <>
                  {tx("cx.accroche")} <em>{tx("cx.accent")}</em>
                </>
              )}
            </h2>
            <p className="aide-champ">{tx("app.positionnement")}</p>
          </header>
          {inscription && !session ? (
            <div className="mode-inscription" role="note">
              <strong>{tx("cx.inscriptionTitre")}</strong>
              <span>{tx("cx.inscriptionAide")}</span>
              <small>{tx("cx.dejaCompte")}</small>
            </div>
          ) : null}

          {session ? (
            <form onSubmit={enregistrerNom} className="pile">
              <p>{tx("cx.bienvenue")}</p>
              <Champ id="cx-nom" libelle={tx("cx.nom")} aide={tx("cx.nomAide")}>
                <input id="cx-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} autoComplete="name" required />
              </Champ>
              <Retour erreur={action.erreur} succes={action.succes} />
              <button className="bouton" type="submit" disabled={action.enCours || nom.trim().length < 2}>
                {action.enCours ? tx("app.envoi") : tx("cx.continuer")}
              </button>
            </form>
          ) : loginEnvoye ? (
            <form onSubmit={verifier} className="pile">
              <p role="status">{tx("cx.codeEnvoye", { login: loginEnvoye })}</p>
              {codeTest ? <p className="msg msg--info">{tx("cx.codeTest", { code: codeTest })}</p> : null}
              <Champ id="cx-code" libelle={tx("cx.code")}>
                <input
                  id="cx-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </Champ>
              <Retour erreur={action.erreur} succes={action.succes} />
              <button className="bouton" type="submit" disabled={action.enCours || code.length !== 6}>
                {action.enCours ? tx("app.envoi") : tx("cx.valider")}
              </button>
              <button type="button" className="bouton bouton-secondaire" onClick={() => (setLoginEnvoye(null), action.effacer())}>
                {tx("cx.changer")}
              </button>
            </form>
          ) : (
            <form onSubmit={envoyer} className="pile">
              <fieldset className="choix-segment">
                <legend className="visuellement-cache">{tx("cx.titre")}</legend>
                {canaux.map((v) => (
                  <label key={v} className={voie === v ? "segment segment--actif" : "segment"}>
                    <input type="radio" name="voie" value={v} checked={voie === v} onChange={() => setVoie(v)} />
                    {tx(v === "sms" ? "cx.parSms" : v === "whatsapp" ? "cx.parWhatsapp" : "cx.parEmail")}
                  </label>
                ))}
              </fieldset>
              {voie === "email" ? (
                <Champ id="cx-login" libelle={tx("cx.email")} aide={tx("cx.emailAide")}>
                  <input id="cx-login" type="email" autoComplete="email" value={login} onChange={(e) => setLogin(e.target.value)} required />
                </Champ>
              ) : (
                <Champ id="cx-login" libelle={tx("cx.telephone")} aide={tx("cx.telephoneAide")}>
                  <div className="champ-tel">
                    <span aria-hidden="true">+237</span>
                    <input
                      id="cx-login"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      aria-describedby="cx-login-aide"
                      required
                    />
                  </div>
                </Champ>
              )}
              <Retour erreur={action.erreur} succes={action.succes} />
              <button className="bouton" type="submit" disabled={action.enCours || login.trim().length < 6}>
                {action.enCours ? tx("app.envoi") : tx("cx.envoyer")}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
