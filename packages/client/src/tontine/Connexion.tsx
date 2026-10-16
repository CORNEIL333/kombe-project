/* KÓMBE — connexion (L-01, I-20), maquette « Connectez-vous » (oct. 2026) :
   à gauche, la promesse sur photo lumineuse et six atouts ; à droite, la
   carte de connexion. Numéro +237 (SMS, WhatsApp en option) ou e-mail ; code
   à 6 chiffres. Le serveur ne dit jamais si le compte existe : le premier
   code vérifié crée le compte. À la première connexion, on demande le nom. */

import { useEffect, useState, type FormEvent } from "react";
import { acces, memoriserSession, type Session } from "./api.js";
import { Champ, Retour, useAction } from "./ui.js";
import { useTextes } from "./textes.js";
import { LogoCompose, SymboleKombe } from "../composants/Marque.js";
import { Icone, type NomIcone } from "../composants/Icones.js";
import { useLangue } from "../i18n/ContexteLangue.js";
import type { CleI18n } from "../i18n/dictionnaires.js";

/* Atouts : chacun renvoie vers la page du site qui le détaille. */
const ATOUTS: ReadonlyArray<{ readonly icone: NomIcone; readonly titre: CleI18n; readonly texte: CleI18n; readonly lien: string }> = [
  { icone: "bouclier-plein", titre: "atout.verifiees.titre", texte: "atout.verifiees.texte", lien: "/site/securite/" },
  { icone: "personnes", titre: "atout.registre.titre", texte: "atout.registre.texte", lien: "/site/#gestes" },
  { icone: "appareil", titre: "atout.horsLigne.titre", texte: "atout.horsLigne.texte", lien: "/site/aide/#guides" },
  { icone: "cadenas", titre: "atout.securise.titre", texte: "atout.securise.texte", lien: "/site/securite/" },
  { icone: "historique", titre: "atout.historique.titre", texte: "atout.historique.texte", lien: "/site/securite/" },
  { icone: "equipe", titre: "atout.trace.titre", texte: "atout.trace.texte", lien: "/site/securite/" },
];

function PanneauMarque() {
  const { t } = useLangue();
  return (
    <div className="cx-promesse">
      <p className="cx-promesse__surtitre">{t("cx2.surtitre")}</p>
      <h1 className="cx-promesse__titre">
        <span>{t("connexion.headlinePlain")}</span> <em>{t("connexion.headlineAccent")}</em>
      </h1>
      <p className="cx-promesse__lead">
        <b>KÓMBE</b> {t("cx2.lead")}
      </p>
    </div>
  );
}

function Atouts() {
  const { t } = useLangue();
  return (
    <div className="cx-bas">
      <ul className="cx-atouts">
        {ATOUTS.map((a, i) => (
          <li key={a.titre} style={{ animationDelay: `${260 + i * 70}ms` }}>
            <a href={a.lien}>
              <span className="cx-atouts__icone">
                <Icone nom={a.icone} taille={26} />
              </span>
              <strong>{t(a.titre)}</strong>
              <span className="cx-atouts__texte">{t(a.texte)}</span>
              <span className="cx-atouts__fleche">
                <Icone nom="fleche" taille={16} />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="cx-promesse__signature">{t("connexion.signature")}</p>
    </div>
  );
}

type Voie = "sms" | "whatsapp" | "email";

export function ConnexionTelephone({ onConnecte }: { readonly onConnecte: (s: Session) => void }) {
  const { tx } = useTextes();
  const { t } = useLangue();
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

  // Deux grandes voies (maquette) : e-mail ou téléphone ; si le téléphone
  // offre SMS et WhatsApp, un second choix apparaît.
  const telephones = canaux.filter((v): v is "sms" | "whatsapp" => v !== "email");
  const parEmail = voie === "email";

  return (
    <div className="ecran-cx">
      <div className="ecran-cx__photo" aria-hidden="true">
        <img src="/brand/photos/connexion-scene.webp" alt="" width="537" height="650" decoding="async" />
      </div>
      <span className="ecran-cx__arc ecran-cx__arc--g" aria-hidden="true">
        <SymboleKombe taille={300} />
      </span>
      <span className="ecran-cx__arc ecran-cx__arc--d" aria-hidden="true">
        <SymboleKombe taille={300} />
      </span>
      <PanneauMarque />
      <Atouts />

      <section className="cx-carte" aria-labelledby="cx-titre">
        <LogoCompose symbole={64} mot={40} signature={12.5} ecart={17} className="cx-carte__logo" />
        <h2 id="cx-titre" className="cx-carte__titre">
          {inscription ? tx("cx.inscriptionTitre") : t("cx2.titre")}
        </h2>
        <p className="cx-carte__sous-titre">{inscription ? tx("cx.inscriptionAide") : t("cx2.sousTitre")}</p>
        {inscription && !session ? <p className="cx-carte__note">{tx("cx.dejaCompte")}</p> : null}

        {session ? (
          <form onSubmit={enregistrerNom} className="pile">
            <p>{tx("cx.bienvenue")}</p>
            <Champ id="cx-nom" libelle={tx("cx.nom")} aide={tx("cx.nomAide")}>
              <input id="cx-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} autoComplete="name" required />
            </Champ>
            <Retour erreur={action.erreur} succes={action.succes} />
            <button className="bouton cx-carte__envoyer" type="submit" disabled={action.enCours || nom.trim().length < 2}>
              {action.enCours ? tx("app.envoi") : tx("cx.continuer")}
              <Icone nom="fleche" taille={18} />
            </button>
          </form>
        ) : loginEnvoye ? (
          <form onSubmit={verifier} className="pile">
            <p role="status">{tx("cx.codeEnvoye", { login: loginEnvoye })}</p>
            {codeTest ? <p className="msg msg--info">{tx("cx.codeTest", { code: codeTest })}</p> : null}
            <Champ id="cx-code" libelle={tx("cx.code")}>
              <input
                id="cx-code"
                className="cx-code"
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
            <button className="bouton cx-carte__envoyer" type="submit" disabled={action.enCours || code.length !== 6}>
              {action.enCours ? tx("app.envoi") : tx("cx.valider")}
              <Icone nom="fleche" taille={18} />
            </button>
            <button type="button" className="bouton bouton-secondaire" onClick={() => (setLoginEnvoye(null), action.effacer())}>
              {tx("cx.changer")}
            </button>
          </form>
        ) : (
          <form onSubmit={envoyer} className="pile">
            <fieldset className="cx-voies">
              <legend className="visuellement-cache">{tx("cx.titre")}</legend>
              {canaux.includes("email") ? (
                <label className={parEmail ? "cx-voie is-actif" : "cx-voie"}>
                  <input type="radio" name="voie" value="email" checked={parEmail} onChange={() => setVoie("email")} />
                  <Icone nom="courriel" taille={21} />
                  {tx("cx.parEmail")}
                </label>
              ) : null}
              <label className={!parEmail ? "cx-voie is-actif" : "cx-voie"}>
                <input type="radio" name="voie" value="telephone" checked={!parEmail} onChange={() => setVoie((telephones[0] ?? "sms") as Voie)} />
                <Icone nom="telephone" taille={21} />
                {t("cx2.parTelephone")}
              </label>
            </fieldset>
            {!parEmail && telephones.length > 1 ? (
              <fieldset className="cx-sous-voies">
                <legend className="visuellement-cache">{t("cx2.parTelephone")}</legend>
                {telephones.map((v) => (
                  <label key={v} className={voie === v ? "cx-sous-voie is-actif" : "cx-sous-voie"}>
                    <input type="radio" name="sous-voie" value={v} checked={voie === v} onChange={() => setVoie(v)} />
                    {tx(v === "sms" ? "cx.parSms" : "cx.parWhatsapp")}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {parEmail ? (
              <Champ id="cx-login" libelle={tx("cx.email")} aide={tx("cx.emailAide")}>
                <div className="cx-champ">
                  <Icone nom="courriel" taille={20} className="cx-champ__icone" />
                  <input id="cx-login" type="email" autoComplete="email" placeholder="votre@email.com" value={login} onChange={(e) => setLogin(e.target.value)} required />
                </div>
              </Champ>
            ) : (
              <Champ id="cx-login" libelle={tx("cx.telephone")} aide={tx("cx.telephoneAide")}>
                <div className="cx-champ cx-champ--tel">
                  <span className="cx-champ__prefixe" aria-hidden="true">+237</span>
                  <input
                    id="cx-login"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="6 77 12 34 56"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    aria-describedby="cx-login-aide"
                    required
                  />
                </div>
              </Champ>
            )}
            {!parEmail && !telephones.length ? <p className="msg msg--info">{t("cx2.telIndispo")}</p> : null}
            <Retour erreur={action.erreur} succes={action.succes} />
            <button className="bouton cx-carte__envoyer" type="submit" disabled={action.enCours || (!parEmail && !telephones.length)}>
              {action.enCours ? tx("app.envoi") : tx("cx.envoyer")}
              <Icone nom="fleche" taille={18} />
            </button>
          </form>
        )}
        <p className="cx-carte__pied">
          <Icone nom="bouclier-plein" taille={15} />
          {t("cx2.protege")}
        </p>
      </section>
    </div>
  );
}
