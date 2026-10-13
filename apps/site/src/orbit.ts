/* KÓMBE — orbite de confiance, version site (couche A).
   Même géométrie que CycleOrbit (React) et KombeCycleOrbit (Flutter) :
   anneau = groupe, nœud = membre/tour, arc = progression, nœud or = tour courant.
   Ici l'intensité est maximale : convergence des nœuds dispersés au chargement. */

const NS = 'http://www.w3.org/2000/svg';
export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** Pseudo-aléa déterministe : même dispersion à chaque visite (pas de saut de mise en page). */
const seeded = (i: number): number => {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

export interface OrbitOptions {
  readonly n: number;
  /** Tour courant 1-indexé ; 0 = aucun arc. */
  current: number;
  readonly size: number;
  readonly label: string;
  readonly converge?: boolean;
  readonly stroke?: number;
  readonly nodeR?: number;
  readonly inverse?: boolean;
  /** Illustration : chaque nœud devient une silhouette (tête + épaules). Même grammaire, version humaine. */
  readonly figures?: boolean;
}

export interface OrbitHandle {
  readonly svg: SVGSVGElement;
  setCurrent(round: number): void;
  play(): void;
  /** Les nœuds convergent vers le centre (décision collective). */
  gather(on: boolean): void;
  /** Individus dispersés mais visibles (« avant » le groupe) ; false = ils rejoignent l'anneau. */
  disperse(on: boolean): void;
}

export function createOrbit(host: HTMLElement, o: OrbitOptions): OrbitHandle {
  const { n, size } = o;
  const c = size / 2;
  const nodeR = o.nodeR ?? Math.min(size * 0.055, (Math.PI * (c - 20)) / n / 2.3);
  const stroke = o.stroke ?? size * 0.03;
  const r = c - nodeR * 2.3;
  const circ = 2 * Math.PI * r;
  const angle = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pos = (i: number): [number, number] => [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))];

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', class: `orbit${o.inverse ? ' orbit--inverse' : ''}` });
  el('title', {}, svg).textContent = o.label;
  const ring = el('circle', { cx: c, cy: c, r, class: 'orbit__ring', 'stroke-width': stroke }, svg);
  const arc = el('circle', {
    cx: c, cy: c, r, class: 'orbit__arc', 'stroke-width': stroke,
    transform: `rotate(-90 ${c} ${c})`, 'stroke-dasharray': circ, 'stroke-dashoffset': circ,
  }, svg);
  const nodes = Array.from({ length: n }, (_, i) => {
    const g = el('g', { class: 'orbit__node' }, svg);
    el('circle', { r: nodeR * 2, class: 'orbit__halo' }, g);
    if (o.figures) {
      // Silhouette : épaules (demi-ellipse) + tête, posées sur le nœud ; un bras levé n'apparaît qu'au vote.
      const R = nodeR * 1.25;
      el('path', { class: 'orbit__arm', d: `M ${R * 0.55} ${R * 0.1} L ${R * 0.95} ${-R * 1.05}`, 'stroke-width': R * 0.32 }, g);
      el('path', { class: 'orbit__dot orbit__body', d: `M ${-R} ${R * 0.9} Q ${-R} ${-R * 0.05} 0 ${-R * 0.05} Q ${R} ${-R * 0.05} ${R} ${R * 0.9} Z`, 'stroke-width': Math.max(1.5, stroke * 0.35) }, g);
      el('circle', { class: 'orbit__dot orbit__head', cy: -R * 0.62, r: R * 0.44, 'stroke-width': Math.max(1.5, stroke * 0.35) }, g);
    } else {
      el('circle', { r: nodeR, class: 'orbit__dot', 'stroke-width': Math.max(2, stroke * 0.5) }, g);
    }
    const [x, y] = pos(i);
    const sx = c + (seeded(i + 1) - 0.5) * size * 1.4;
    const sy = c + (seeded(i + 7) - 0.5) * size * 1.4;
    g.style.setProperty('--d', `${i * 50}ms`);
    return { g, x, y, sx, sy };
  });
  host.appendChild(svg);

  let current = o.current;
  const paint = (): void => {
    nodes.forEach(({ g }, i) => {
      const round = i + 1;
      g.classList.toggle('is-past', round < current);
      g.classList.toggle('is-current', round === current);
      g.classList.toggle('is-future', round > current);
    });
    const frac = current <= 1 ? 0 : Math.min(1, (current - 1) / n);
    arc.setAttribute('stroke-dashoffset', String(circ * (1 - frac)));
  };
  const place = (scatter: boolean, toCenter = false, visible = false): void => {
    nodes.forEach(({ g, x, y, sx, sy }) => {
      const k = o.figures ? 0.66 : 0.18;
      const [tx, ty] = toCenter ? [c + (x - c) * k, c + (y - c) * k] : scatter ? [sx, sy] : [x, y];
      g.style.transform = `translate(${tx}px, ${ty}px)`;
      g.style.opacity = scatter && !visible ? '0' : '1';
    });
    ring.style.opacity = scatter || toCenter ? '0' : '1';
    arc.style.opacity = toCenter ? '0' : '1';
  };

  const startScattered = o.converge === true && !reducedMotion();
  place(startScattered);
  if (!startScattered) paint();

  return {
    svg,
    setCurrent(round: number) { current = round; paint(); },
    play() {
      if (!startScattered) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        svg.classList.add('is-playing');
        place(false);
        window.setTimeout(paint, 650 + n * 50);
      }));
    },
    disperse(on: boolean) { place(on, false, true); if (!on) paint(); },
    gather(on: boolean) { place(false, on); svg.classList.toggle('is-voting', on); if (!on) paint(); },
  };
}
