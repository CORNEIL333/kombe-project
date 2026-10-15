/* Bandeau des opérations gardées sur ce téléphone (mode séance, L-05).
   Envoi automatique au retour du réseau ; jamais présentées comme
   transmises ; un refus du serveur reste affiché jusqu'au retrait. */

import { useCallback, useEffect, useState } from "react";
import { envoyerEnAttente, type Session } from "./api.js";
import { lireFile, retirerDeFile, surChangementFile, type OperationEnAttente } from "./fileAttenteMoteur.js";
import { useTextes } from "./textes.js";

export function FileAttente({ session, enLigne }: { readonly session: Session; readonly enLigne: boolean }) {
  const { tx } = useTextes();
  const [ops, setOps] = useState<OperationEnAttente[]>(() => lireFile());
  const [envoi, setEnvoi] = useState(false);
  const [bilan, setBilan] = useState<string | null>(null);
  useEffect(() => surChangementFile(() => setOps(lireFile())), []);

  const envoyer = useCallback(async () => {
    if (envoi || lireFile().every((o) => o.erreur)) return;
    setEnvoi(true);
    try {
      const r = await envoyerEnAttente(session);
      if (r.envoyees > 0) setBilan(tx("fa.envoyees", { n: String(r.envoyees) }));
    } finally {
      setEnvoi(false);
      setOps(lireFile());
    }
  }, [envoi, session, tx]);

  // Au retour du réseau (et à l'ouverture), on envoie sans attendre de clic.
  useEffect(() => {
    if (enLigne && lireFile().some((o) => !o.erreur)) void envoyer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLigne]);

  if (ops.length === 0) {
    return bilan ? (
      <p className="bandeau bandeau--succes" role="status">
        {bilan}
      </p>
    ) : null;
  }
  const enAttente = ops.filter((o) => !o.erreur);
  const refusees = ops.filter((o) => o.erreur);
  return (
    <div className="bandeau bandeau--file" role="status">
      {enAttente.length > 0 ? (
        <p>
          {tx("fa.titre", { n: String(enAttente.length) })}{" "}
          {enLigne ? (
            <button type="button" className="bouton bouton-compact" disabled={envoi} onClick={() => void envoyer()}>
              {envoi ? tx("app.envoi") : tx("fa.envoyer")}
            </button>
          ) : null}
        </p>
      ) : null}
      {enAttente.length > 0 ? (
        <ul className="file-liste">
          {enAttente.map((o) => (
            <li key={o.id}>{o.libelle}</li>
          ))}
        </ul>
      ) : null}
      {refusees.map((o) => (
        <p key={o.id} className="msg msg--erreur">
          {o.libelle} — {tx("fa.refus", { motif: o.erreur ?? "" })}{" "}
          <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => retirerDeFile(o.id)}>
            {tx("fa.retirer")}
          </button>
        </p>
      ))}
    </div>
  );
}
