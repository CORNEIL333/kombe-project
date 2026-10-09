import type { ReactNode } from 'react';

/** Carte statistique du haut de page (mockups direction/ops/engineering) :
 *  icône, libellé, grande valeur, variation optionnelle. `trend` n'affiche
 *  JAMAIS un signe sans texte — le sens (hausse/baisse) est explicite en
 *  texte, jamais la seule couleur (accessibilité, même règle que la PWA). */
export interface StatCardProps {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly trend?: { readonly direction: 'up' | 'down'; readonly text: string };
  readonly hint?: string;
  readonly tone?: 'ok' | 'warn' | 'danger' | 'neutral';
}
export function StatCard(p: StatCardProps) {
  return (
    <article className="k-stat">
      {p.icon && <span className={`k-stat-icon k-stat-icon-${p.tone ?? 'neutral'}`} aria-hidden="true">{p.icon}</span>}
      <div className="k-stat-body">
        <span className="k-stat-label">{p.label}</span>
        <strong className="k-stat-value">{p.value}</strong>
        {p.trend && (
          <small className={`k-stat-trend k-stat-trend-${p.trend.direction}`}>
            {p.trend.direction === 'up' ? '↑' : '↓'} {p.trend.text}
          </small>
        )}
        {p.hint && <small className="k-stat-hint">{p.hint}</small>}
      </div>
    </article>
  );
}

/** Frise de progression numérotée (« Round 2/12 », mockup groupe-admin) :
 *  chaque étape est un texte + état (fait/en cours/à venir) — jamais une
 *  seule pastille de couleur sans équivalent textuel accessible. */
export interface ProgressTrackProps {
  readonly total: number;
  readonly completed: number;
  readonly label: string;
  readonly caption?: string;
}
export function ProgressTrack(p: ProgressTrackProps) {
  const steps = Array.from({ length: p.total }, (_, i) => i + 1);
  const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
  return (
    <div className="k-progress-track">
      <div className="k-progress-steps" role="list" aria-label={p.label}>
        {steps.map((n) => {
          const done = n <= p.completed;
          return (
            <span
              key={n}
              role="listitem"
              className={done ? 'k-progress-step k-progress-step-done' : 'k-progress-step'}
              aria-label={`Étape ${n} sur ${p.total}${done ? ', terminée' : ', à venir'}`}
            >
              {done ? '✓' : n}
            </span>
          );
        })}
      </div>
      <div className="k-progress-summary">
        <strong>
          {p.completed}/{p.total} {p.label}
        </strong>
        <span>{pct}%</span>
      </div>
      {p.caption && <p className="k-progress-caption">{p.caption}</p>}
    </div>
  );
}

/** Pastille d'initiales — jamais une photo fabriquée : seules les lettres
 *  réellement tirées de l'identifiant/nom servent de contenu visuel. */
export function Avatar(p: { readonly label: string; readonly size?: number }) {
  const initials = p.label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?';
  return (
    <span className="k-avatar" style={p.size ? { width: p.size, height: p.size } : undefined} aria-hidden="true">
      {initials}
    </span>
  );
}

export interface ActivityItemData {
  readonly id: string;
  readonly text: ReactNode;
  readonly meta?: string;
  readonly tone?: 'ok' | 'warn' | 'danger' | 'neutral';
}
export function ActivityList(p: { readonly title: string; readonly items: readonly ActivityItemData[]; readonly empty?: string }) {
  return (
    <div className="k-activity">
      <h3 className="k-activity-title">{p.title}</h3>
      {p.items.length === 0 ? (
        <p className="k-activity-empty">{p.empty ?? 'Aucune activité.'}</p>
      ) : (
        <ul className="k-activity-list">
          {p.items.map((item) => (
            <li key={item.id} className="k-activity-item">
              <span className={`k-activity-dot k-activity-dot-${item.tone ?? 'neutral'}`} aria-hidden="true" />
              <span className="k-activity-text">{item.text}</span>
              {item.meta && <span className="k-activity-meta">{item.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface QuickActionData {
  readonly key: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onClick: () => void;
  readonly tone?: 'primary' | 'neutral';
}
export function QuickActions(p: { readonly title: string; readonly actions: readonly QuickActionData[] }) {
  return (
    <div className="k-quick-actions">
      <h3 className="k-activity-title">{p.title}</h3>
      <div className="k-quick-actions-list">
        {p.actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className={a.tone === 'primary' ? 'k-quick-action k-quick-action-primary' : 'k-quick-action'}
            onClick={a.onClick}
          >
            {a.icon && <span className="k-quick-action-icon" aria-hidden="true">{a.icon}</span>}
            <span className="k-quick-action-label">{a.label}</span>
            <span aria-hidden="true" className="k-quick-action-chevron">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Champ de recherche de la barre supérieure — purement cosmétique tant
 *  qu'aucun contrat de recherche serveur n'existe (`onSubmit` optionnel,
 *  jamais un filtrage local qui fabriquerait un résultat). */
export function TopSearch(p: { readonly placeholder: string; readonly value: string; readonly onChange: (v: string) => void }) {
  return (
    <label className="k-top-search">
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        placeholder={p.placeholder}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        aria-label={p.placeholder}
      />
    </label>
  );
}

export function UserBadge(p: { readonly name: string; readonly role: string }) {
  return (
    <div className="k-user-badge">
      <Avatar label={p.name} />
      <span className="k-user-badge-text">
        <strong>{p.name}</strong>
        <small>{p.role}</small>
      </span>
    </div>
  );
}
