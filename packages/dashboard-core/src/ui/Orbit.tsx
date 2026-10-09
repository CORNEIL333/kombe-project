import { useId, type CSSProperties, type ReactNode } from 'react';

/* KÓMBE — grammaire du cercle de confiance (voir docs/brand/KOMBE_VISUAL_LANGUAGE.md).
 * CERCLE = groupe · NŒUD = tour/membre · ARC = progression · NŒUD OR = tour courant.
 * Tous les paramètres viennent d'une réponse serveur réelle : ce composant ne
 * fabrique jamais un nombre de tours ni une position. */

export interface CycleOrbitProps {
  /** Nombre réel de tours du cycle (≥ 1). */
  readonly total: number;
  /** Tour courant, 1-indexé. 0 = cycle pas encore démarré (aucun arc). total+1 = cycle terminé. */
  readonly current: number;
  readonly size?: number;
  /** Libellé accessible complet (ex. « Cycle de 12 tours, tour 4 en cours »). */
  readonly label: string;
  /** Contenu centré dans l'anneau (chiffre clé + légende). */
  readonly center?: ReactNode;
  /** Sélection d'un tour (1-indexé). Rend les nœuds focusables. */
  readonly onSelect?: (round: number) => void;
  readonly selected?: number;
  /** Variante sombre (sur surface forêt). */
  readonly inverse?: boolean;
}

export function CycleOrbit(p: CycleOrbitProps) {
  const id = useId();
  const total = Math.max(1, Math.floor(p.total));
  const current = Math.max(0, Math.min(total + 1, Math.floor(p.current)));
  const size = p.size ?? 280;
  const c = size / 2;
  const nodeR = Math.max(5, Math.min(size * 0.05, (Math.PI * (c - 20)) / total / 2.4));
  const stroke = Math.max(3, size * 0.032);
  // Réserve la place du halo du tour courant (≈ 2.25 × nodeR) : jamais rogné.
  const r = c - nodeR * 2.3;
  const circ = 2 * Math.PI * r;
  const frac = current <= 1 ? 0 : Math.min(1, (current - 1) / total);
  const angle = (i: number) => ((-90 + (i * 360) / total) * Math.PI) / 180;
  return (
    <div className={`k-orbit${p.inverse ? ' k-orbit--inverse' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{p.label}</title>
        <circle className="k-orbit__ring" cx={c} cy={c} r={r} strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            className="k-orbit__arc"
            cx={c}
            cy={c}
            r={r}
            strokeWidth={stroke}
            transform={`rotate(-90 ${c} ${c})`}
            strokeDasharray={circ}
            style={{ ['--k-arc-from' as string]: circ, ['--k-arc-to' as string]: circ * (1 - frac) } as CSSProperties}
            strokeDashoffset={circ * (1 - frac)}
          />
        )}
        {Array.from({ length: total }, (_, i) => {
          const round = i + 1;
          const x = c + r * Math.cos(angle(i));
          const y = c + r * Math.sin(angle(i));
          const state = round < current ? 'past' : round === current ? 'current' : 'future';
          const rr = state === 'current' ? nodeR * 1.18 : nodeR;
          const node = (
            <g
              key={round}
              className={`k-orbit__node k-orbit__node--${state}${p.selected === round ? ' is-selected' : ''}`}
              style={{ ['--k-i' as string]: i, transform: `translate(${x}px, ${y}px)` } as CSSProperties}
            >
              {state === 'current' && <circle className="k-orbit__halo" r={rr * 1.9} />}
              <circle r={rr} />
            </g>
          );
          if (!p.onSelect) return node;
          return (
            <a
              key={round}
              href={`#tour-${round}`}
              role="button"
              aria-label={`Tour ${round} sur ${total}${state === 'past' ? ', échu' : state === 'current' ? ', en cours' : ', à venir'}`}
              aria-pressed={p.selected === round}
              onClick={(e) => {
                e.preventDefault();
                p.onSelect?.(round);
              }}
            >
              {node}
            </a>
          );
        })}
      </svg>
      {p.center && <div className="k-orbit__center">{p.center}</div>}
    </div>
  );
}

export type StatusKind = 'draft' | 'pending' | 'confirmed' | 'disputed' | 'offline' | 'syncing' | 'neutral';

/** Statut par la FORME (arc ouvert / anneau fermé / chemin rompu…), doublé
 *  d'un libellé texte toujours visible — jamais la couleur seule. */
export function StatusRing(p: { readonly kind: StatusKind; readonly label: string; readonly size?: number }) {
  const s = p.size ?? 18;
  return (
    <span className={`k-status k-status--${p.kind}`}>
      <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
        {p.kind === 'confirmed' && (
          <>
            <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" />
            <path d="M8 12.4l2.8 2.8L16.2 9.6" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {p.kind === 'pending' && (
          <>
            <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" className="k-status__track" />
            <path d="M12 3a9 9 0 1 1-7.8 13.5" fill="none" strokeWidth="3" strokeLinecap="round" />
          </>
        )}
        {p.kind === 'draft' && <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" strokeDasharray="3 3.1" />}
        {p.kind === 'disputed' && (
          <>
            <path d="M12 3a9 9 0 0 1 8.3 5.5" fill="none" strokeWidth="3" strokeLinecap="round" />
            <path d="M20.8 13.6A9 9 0 0 1 6 18.7" fill="none" strokeWidth="3" strokeLinecap="round" />
            <path d="M3.5 15A9 9 0 0 1 7.4 4.3" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 4" />
          </>
        )}
        {p.kind === 'offline' && <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2.4" strokeDasharray="1.5 4" strokeLinecap="round" />}
        {p.kind === 'syncing' && (
          <g className="k-status__spin">
            <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" className="k-status__track" />
            <path d="M12 3a9 9 0 0 1 9 9" fill="none" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}
        {p.kind === 'neutral' && <circle cx="12" cy="12" r="4" />}
      </svg>
      <span>{p.label}</span>
    </span>
  );
}

/** Signe KÓMBE vectoriel : anneau à quatre nœuds (charte 01/08). */
export function KombeMark(p: { readonly size?: number; readonly inverse?: boolean; readonly title?: string }) {
  const s = p.size ?? 32;
  const gap = p.inverse ? '#103C32' : '#FBF8F1';
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" role={p.title ? 'img' : undefined} aria-hidden={p.title ? undefined : true} aria-label={p.title}>
      <circle cx="50" cy="50" r="34" fill="none" stroke={p.inverse ? '#2A8A68' : '#103C32'} strokeWidth="12" />
      <path d="M16 50A34 34 0 0 1 50 16" fill="none" stroke="#C7922E" strokeWidth="12" />
      {!p.inverse && <path d="M50 16A34 34 0 0 1 84 50" fill="none" stroke="#176B52" strokeWidth="12" />}
      <g stroke={gap} strokeWidth="4">
        <circle cx="50" cy="16" r="12" fill="#F3ECDD" />
        <circle cx="16" cy="50" r="12" fill="#C7922E" />
        <circle cx="84" cy="50" r="12" fill={p.inverse ? '#FBF8F1' : '#176B52'} />
        <circle cx="50" cy="84" r="12" fill="#F3ECDD" />
      </g>
    </svg>
  );
}
