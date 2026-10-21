/* KÓMBE — règlement du groupe : modifiable par le bureau avant le premier
   cycle et ENTRE deux saisons ; lisible pendant un cycle. Les tours déjà
   plantés gardent leur règlement (jamais rétroactif). */

import { Creation } from "./Creation.js";
import type { ContexteGroupe } from "./Groupe.js";
import { useTextes } from "./textes.js";

export function Reglages({ ctx }: { readonly ctx: ContexteGroupe }) {
  const g = ctx.groupe;
  const { tx } = useTextes();
  const enCours = g.cycleStarted && !g.cycle?.finished;
  return (
    <>
    <p className="msg msg--info">{enCours ? tx("rg.enCours") : g.cycleStarted ? tx("rg.entreSaisons") : tx("rg.avant")}</p>
    <Creation
      session={ctx.session}
      edition={{ groupId: g.groupId, name: g.name, settings: g.settings, verrouille: enCours }}
      onCree={() => ctx.rafraichir()}
      onAnnuler={() => ctx.rafraichir()}
    />
    </>
  );
}
