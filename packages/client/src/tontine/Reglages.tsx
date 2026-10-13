/* KÓMBE — règlement du groupe : modifiable par le bureau tant que le cycle
   n'a pas démarré, lisible ensuite (les règles ne sont jamais rétroactives). */

import { Creation } from "./Creation.js";
import type { ContexteGroupe } from "./Groupe.js";

export function Reglages({ ctx }: { readonly ctx: ContexteGroupe }) {
  const g = ctx.groupe;
  return (
    <Creation
      session={ctx.session}
      edition={{ groupId: g.groupId, name: g.name, settings: g.settings, verrouille: g.cycleStarted }}
      onCree={() => ctx.rafraichir()}
      onAnnuler={() => ctx.rafraichir()}
    />
  );
}
