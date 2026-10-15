/* KÓMBE — l'Orbite, version site (couche A, direction v2 « L'Orbite »).
   Même grammaire que la PWA (composants/Orbite.tsx) et l'app mobile :
     cercle = groupe · nœud = membre · arc forêt = progression ·
     nœud or + l'Accent (trait or tangent) = « c'est à cette personne ».
   Ici l'intensité est maximale : convergence au chargement, photos de membres
   dans certains nœuds, rotation lente. Compatible Chrome 67 / Safari 14 :
   uniquement SVG 1.1 + transitions CSS. */

const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
export const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let uid = 0;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(node);
  return node;
}

/** Pseudo-aléa déterministe : même dispersion à chaque visite. */
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
  /** Silhouettes (tête + épaules) à la place des points. */
  readonly figures?: boolean;
  /** Photos placées dans certains nœuds : index (0-based) → URL. */
  readonly photos?: Readonly<Record<number, string>>;
  /** Rayon des nœuds-photos (défaut : 2,4 × nodeR). */
  readonly photoR?: number;
}

export interface OrbitHandle {
  readonly svg: SVGSVGElement;
  setCurrent(round: number): void;
  play(): void;
  /** Les nœuds convergent vers le centre (décision collective). */
  gather(on: boolean): void;
  /** Individus dispersés mais visibles (« avant » le groupe). */
  disperse(on: boolean): void;
}

export function createOrbit(host: HTMLElement, o: OrbitOptions): OrbitHandle {
  const { n, size } = o;
  const c = size / 2;
  const nodeR = o.nodeR ?? Math.min(size * 0.05, (Math.PI * (c - 20)) / n / 2.3);
  const photoR = o.photoR ?? nodeR * 2.4;
  const stroke = o.stroke ?? size * 0.012;
  const maxR = o.photos && Object.keys(o.photos).length ? photoR : nodeR * 2.3;
  const r = c - maxR - 8;
  const circ = 2 * Math.PI * r;
  const angle = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pos = (i: number): [number, number] => [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))];
  const id = `orb${++uid}`;

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', class: `orbit${o.inverse ? ' orbit--inverse' : ''}` });
  el('title', {}, svg).textContent = o.label;
  const defs = el('defs', {}, svg);
  const ring = el('circle', { cx: c, cy: c, r, class: 'orbit__ring', 'stroke-width': stroke }, svg);
  const arc = el('circle', {
    cx: c, cy: c, r, class: 'orbit__arc', 'stroke-width': stroke * 1.6,
    transform: `rotate(-90 ${c} ${c})`, 'stroke-dasharray': circ, 'stroke-dashoffset': circ,
  }, svg);
  // L'Accent : trait or tangent, à l'extérieur du nœud courant.
  const accent = el('line', { class: 'orbit__accent', 'stroke-width': Math.max(3, stroke * 2.2), 'stroke-linecap': 'round', x1: 0, y1: 0, x2: 0, y2: 0 }, svg);

  const nodes = Array.from({ length: n }, (_, i) => {
    const g = el('g', { class: 'orbit__node' }, svg);
    const photo = o.photos?.[i];
    if (photo) {
      const clip = el('clipPath', { id: `${id}-c${i}` }, defs);
      el('circle', { r: photoR }, clip);
      el('circle', { r: photoR + 4, class: 'orbit__photo-ring' }, g);
      const img = el('image', { x: -photoR, y: -photoR, width: photoR * 2, height: photoR * 2, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id}-c${i})` }, g);
      img.setAttributeNS(XLINK, 'href', photo);
      img.setAttribute('href', photo);
      g.classList.add('orbit__node--photo');
    } else if (o.figures) {
      const R = nodeR * 1.25;
      el('path', { class: 'orbit__arm', d: `M ${R * 0.55} ${R * 0.1} L ${R * 0.95} ${-R * 1.05}`, 'stroke-width': R * 0.32 }, g);
      el('path', { class: 'orbit__dot orbit__body', d: `M ${-R} ${R * 0.9} Q ${-R} ${-R * 0.05} 0 ${-R * 0.05} Q ${R} ${-R * 0.05} ${R} ${R * 0.9} Z`, 'stroke-width': 1.5 }, g);
      el('circle', { class: 'orbit__dot orbit__head', cy: -R * 0.62, r: R * 0.44, 'stroke-width': 1.5 }, g);
    } else {
      el('circle', { r: nodeR * 2, class: 'orbit__halo' }, g);
      el('circle', { r: nodeR, class: 'orbit__dot', 'stroke-width': Math.max(1.5, stroke) }, g);
    }
    const [x, y] = pos(i);
    const sx = c + (seeded(i + 1) - 0.5) * size * 1.3;
    const sy = c + (seeded(i + 7) - 0.5) * size * 1.3;
    g.style.transitionDelay = `${i * 55}ms`;
    return { g, x, y, sx, sy };
  });
  host.appendChild(svg);

  let current = o.current;
  const placeAccent = (): void => {
    if (current < 1 || current > n) { accent.style.opacity = '0'; return; }
    const a = angle(current - 1);
    const off = (o.photos?.[current - 1] ? photoR : nodeR * 1.4) + 10;
    const ax = c + (r + off) * Math.cos(a);
    const ay = c + (r + off) * Math.sin(a);
    const tx = -Math.sin(a) * 9;
    const ty = Math.cos(a) * 9;
    accent.setAttribute('x1', String(ax - tx));
    accent.setAttribute('y1', String(ay - ty));
    accent.setAttribute('x2', String(ax + tx));
    accent.setAttribute('y2', String(ay + ty));
    accent.style.opacity = '1';
  };
  const paint = (): void => {
    nodes.forEach(({ g }, i) => {
      const round = i + 1;
      g.classList.toggle('is-past', round < current);
      g.classList.toggle('is-current', round === current);
      g.classList.toggle('is-future', round > current);
    });
    const frac = current <= 1 ? 0 : Math.min(1, (current - 1) / n);
    arc.setAttribute('stroke-dashoffset', String(circ * (1 - frac)));
    placeAccent();
  };
  const place = (scatter: boolean, toCenter = false, visible = false): void => {
    nodes.forEach(({ g, x, y, sx, sy }) => {
      const k = o.figures ? 0.66 : 0.3;
      const tx = toCenter ? c + (x - c) * k : scatter ? sx : x;
      const ty = toCenter ? c + (y - c) * k : scatter ? sy : y;
      // Propriété CSS (et non attribut SVG) : seule une propriété CSS se transitionne.
      g.style.transform = `translate(${tx}px, ${ty}px)`;
      g.style.opacity = scatter && !visible ? '0' : '1';
    });
    ring.style.opacity = scatter || toCenter ? '0' : '1';
    arc.style.opacity = toCenter ? '0' : '1';
    if (scatter || toCenter) accent.style.opacity = '0';
  };

  const startScattered = o.converge === true && !reducedMotion();
  place(startScattered);
  if (!startScattered) paint();

  return {
    svg,
    setCurrent(round: number) { current = round; paint(); },
    play() {
      if (!startScattered) return;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        svg.classList.add('is-playing');
        place(false);
        window.setTimeout(paint, 700 + n * 55);
      }));
    },
    gather(on: boolean) { place(false, on); svg.classList.toggle('is-voting', on); if (!on) paint(); },
    disperse(on: boolean) { place(on, false, true); if (!on) paint(); },
  };
}
