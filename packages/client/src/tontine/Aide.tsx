/* KÓMBE — centre d'aide du PWA : gestes essentiels, questions fréquentes et
   contact. Le centre complet vit sur le site (/site/aide/). */

import { useTextes, type CleTexte } from "./textes.js";
import { Carte } from "./ui.js";
import { Icone, type NomIcone } from "../composants/Icones.js";

const GESTES: { icone: NomIcone; titre: CleTexte; texte: CleTexte }[] = [
  { icone: "declarer", titre: "ai.g1", texte: "ai.g1t" },
  { icone: "confirmer", titre: "ai.g2", texte: "ai.g2t" },
  { icone: "cycle", titre: "ai.g3", texte: "ai.g3t" },
  { icone: "cagnotte", titre: "ai.g4", texte: "ai.g4t" },
  { icone: "hors-ligne", titre: "ai.g5", texte: "ai.g5t" },
  { icone: "bureau", titre: "ai.g6", texte: "ai.g6t" },
];
const QUESTIONS: { q: CleTexte; r: CleTexte }[] = [
  { q: "ai.q1", r: "ai.r1" },
  { q: "ai.q2", r: "ai.r2" },
  { q: "ai.q3", r: "ai.r3" },
  { q: "ai.q4", r: "ai.r4" },
  { q: "ai.q5", r: "ai.r5" },
];

export function Aide() {
  const { tx } = useTextes();
  return (
    <div className="pile ecran">
      <header className="ecran-titre">
        <span className="ecran-titre__icone" aria-hidden="true">
          <Icone nom="aide" taille={26} />
        </span>
        <div>
          <h1>{tx("pf.centreAide")}</h1>
          <p className="aide-champ">{tx("ai.intro")}</p>
        </div>
      </header>
      <ul className="aide-gestes">
        {GESTES.map((g) => (
          <li key={g.titre}>
            <span className="aide-gestes__icone">
              <Icone nom={g.icone} taille={22} />
            </span>
            <strong>{tx(g.titre)}</strong>
            <span className="aide-champ">{tx(g.texte)}</span>
          </li>
        ))}
      </ul>
      <Carte titre={tx("ai.faq")}>
        <div className="aide-faq">
          {QUESTIONS.map((x) => (
            <details key={x.q}>
              <summary>
                {tx(x.q)}
                <Icone nom="chevron-bas" taille={18} />
              </summary>
              <p>{tx(x.r)}</p>
            </details>
          ))}
        </div>
      </Carte>
      <Carte titre={tx("pf.contact")}>
        <p className="aide-champ">{tx("ai.contactTexte")}</p>
        <div className="actions-formulaire">
          <a className="bouton" href="/site/aide/#contact">
            <Icone nom="contact" taille={18} />
            {tx("pf.contact")}
          </a>
          <a className="bouton bouton-secondaire" href="/site/aide/">
            <Icone nom="monde" taille={18} />
            {tx("ai.centreComplet")}
          </a>
        </div>
      </Carte>
    </div>
  );
}
