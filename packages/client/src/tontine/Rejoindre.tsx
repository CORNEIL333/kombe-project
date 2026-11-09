/* KÓMBE — rejoindre une tontine par code ou lien WhatsApp (I-14, L-15).
   L'adhésion reste « en attente » jusqu'à son admission par le bureau. */

import { useEffect, useState, type FormEvent } from "react";
import { acces, tontines, type InvitationPreview, type Session } from "./api.js";
import { Carte, Champ, Retour, useAction } from "./ui.js";
import { useTextes } from "./textes.js";

export function Rejoindre({ session, codeInitial, onFini }: { readonly session: Session; readonly codeInitial?: string; readonly onFini: () => void }) {
  const { tx } = useTextes();
  const [code, setCode] = useState(codeInitial ?? "");
  const [apercu, setApercu] = useState<InvitationPreview | null>(null);
  const [nom, setNom] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const action = useAction();

  const verifier = async (e?: FormEvent) => {
    e?.preventDefault();
    const r = await action.lancer(() => tontines.apercuInvitation(session, code.trim().toUpperCase()));
    if (r) setApercu(r);
  };

  // Lien d'invitation : le code est vérifié d'office et le nom déjà connu est proposé.
  useEffect(() => {
    if (codeInitial && codeInitial.length >= 4) void verifier();
    void acces.moi(session).then(
      (m) => setNom((n) => n || (m.displayName ?? "")),
      () => undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rejoindre = async (e: FormEvent) => {
    e.preventDefault();
    if (!apercu) return;
    const r = await action.lancer(() => tontines.rejoindre(session, apercu.code, nom.trim()));
    if (r) setEnvoye(true);
  };

  return (
    <Carte titre={tx("rej.titre")} id="rej-titre">
      {envoye ? (
        <div className="pile">
          <p className="msg msg--succes" role="status">
            {tx("rej.envoye")}
          </p>
          <p className="aide-champ">{tx("rej.ensuite")}</p>
          <button type="button" className="bouton" onClick={onFini}>
            {tx("app.accueil")}
          </button>
        </div>
      ) : !apercu ? (
        <form onSubmit={verifier} className="pile">
          <Champ id="rej-code" libelle={tx("rej.code")} aide={tx("rej.codeAide")}>
            <input
              id="rej-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8))}
              autoCapitalize="characters"
              autoComplete="off"
              aria-describedby="rej-code-aide"
              required
            />
          </Champ>
          <Retour erreur={action.erreur} succes={action.succes} />
          <button type="submit" className="bouton" disabled={action.enCours || code.trim().length < 4}>
            {tx("rej.verifier")}
          </button>
        </form>
      ) : (
        <form onSubmit={rejoindre} className="pile">
          <p>
            <strong>{tx("rej.groupe", { nom: apercu.groupName })}</strong>
          </p>
          {apercu.alreadyMember ? (
            <>
              <p className="msg msg--info">{tx("rej.dejaMembre")}</p>
              <button type="button" className="bouton" onClick={onFini}>
                {tx("rej.voirMesTontines")}
              </button>
            </>
          ) : !apercu.usable ? (
            <p className="msg msg--erreur">{tx("rej.inutilisable")}</p>
          ) : (
            <>
              <Champ id="rej-nom" libelle={tx("rej.nom")}>
                <input id="rej-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} required />
              </Champ>
              <Retour erreur={action.erreur} succes={action.succes} />
              <button type="submit" className="bouton" disabled={action.enCours || nom.trim().length < 2}>
                {action.enCours ? tx("app.envoi") : tx("rej.envoyer")}
              </button>
            </>
          )}
          <button type="button" className="bouton bouton-secondaire" onClick={() => setApercu(null)}>
            {tx("app.retour")}
          </button>
        </form>
      )}
    </Carte>
  );
}
