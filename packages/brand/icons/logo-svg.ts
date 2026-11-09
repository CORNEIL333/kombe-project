/* KÓMBE — logo et Orbite de données en SVG (charte visuelle 01/08 et 03/08).
   Langage de formes de la charte : cercle = groupe, arc = progression,
   nœud = membre, anneau = confiance. Le logo est dessiné depuis la géométrie
   générée (marks/kombe-logo.json) : aucune police requise, chaque partie
   porte une classe pour l'animation de marque (kombe-v3.css). */

import { LOGO } from "./logo";

export type Variante = "couleur" | "inverse" | "mono";
const rad = (d: number): number => (d * Math.PI) / 180;
const pt = (a: number, r: number = LOGO.ring.r): [number, number] => [LOGO.ring.cx + r * Math.cos(rad(a)), LOGO.ring.cy + r * Math.sin(rad(a))];
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Parties du symbole (sans balise <svg>), repère 100 × 100. */
export function symboleParties(v: Variante = "couleur"): string {
  const col = LOGO.variants[v] as Record<string, string>;
  const { r, stroke, node, halo } = LOGO.ring;
  const arcs = LOGO.arcs.map(([a0, a1, role], i) => {
    const [x0, y0] = pt(a0 as number);
    const [x1, y1] = pt(a1 as number);
    return `<path class="k-arc" style="--i:${i}" pathLength="1" d="M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${col[role as string]}" stroke-width="${stroke}"/>`;
  });
  const nodes = LOGO.nodes.map(([a, role], i) => {
    const [x, y] = pt(a as number);
    return `<circle class="k-noeud" style="--i:${i}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${node}" fill="${col[role as string]}" stroke="${col.fond}" stroke-width="${halo}"/>`;
  });
  return `<g class="k-symbole__arcs">${arcs.join("")}</g><g class="k-symbole__noeuds">${nodes.join("")}</g>`;
}

export function symboleSvg(o: { readonly variante?: Variante; readonly anime?: boolean; readonly classe?: string; readonly titre?: string } = {}): string {
  const a11y = o.titre ? `role="img" aria-label="${esc(o.titre)}"` : 'aria-hidden="true"';
  return `<svg class="k-symbole${o.anime ? " k-anime" : ""} ${o.classe ?? ""}" viewBox="2 2 96 96" ${a11y} focusable="false">${symboleParties(o.variante)}</svg>`;
}

/** Logotype horizontal (symbole + KÓMBE + signature facultative). */
export function logoSvg(o: { readonly variante?: Variante; readonly anime?: boolean; readonly signature?: boolean; readonly classe?: string; readonly titre?: string } = {}): string {
  const v = o.variante ?? "couleur";
  const col = LOGO.variants[v] as Record<string, string>;
  const w = LOGO.wordmark;
  const sig = o.signature !== false;
  const [vx, vy, vw, vh] = w.viewBox;
  // Sans signature, le cadre se resserre autour du symbole et du mot.
  const h = sig ? vh : Math.round(w.symbolY + w.symbolSize - vy + w.capHeight * 0.05);
  const width = sig ? vw : Math.round(w.wordX + w.width);
  const s = w.symbolSize / 100;
  return (
    `<svg class="k-logo${o.anime ? " k-anime" : ""} ${o.classe ?? ""}" viewBox="${vx} ${vy} ${width} ${h}" role="img" aria-label="${esc(o.titre ?? "KÓMBE — Votre tontine, plus claire.")}" focusable="false">` +
    `<g class="k-logo__symbole" transform="translate(0 ${w.symbolY}) scale(${s.toFixed(4)})">${symboleParties(v)}</g>` +
    // Le groupe porte l'animation (transformation CSS) ; le tracé garde sa position.
    `<g class="k-logo__mot"><path transform="translate(${w.wordX} 0)" d="${w.d}" fill="${col.texte}"/></g>` +
    (sig ? `<g class="k-logo__signature"><path transform="translate(${w.wordX} ${w.signatureY}) scale(${w.signatureScale})" d="${w.signature}" fill="${col.signature}"/></g>` : "") +
    `</svg>`
  );
}

export interface OptionsOrbite {
  /** Nombre réel de membres / tours. */
  readonly n: number;
  /** Tour courant 0-based (nœud or) ; -1 = cycle non démarré. */
  readonly courant: number;
  /** Photos d'illustration posées dans certains nœuds : index → URL. */
  readonly photos?: Readonly<Record<number, string>>;
  readonly classe?: string;
  readonly libelle?: string;
  /** Rayon des nœuds simples (repère 100) ; par défaut selon n. */
  readonly rayonNoeud?: number;
}

/** Orbite de données (charte 03/08) : cercle = groupe, arc forêt = progression,
    nœuds = membres (faits : vert ; courant : or avec halo ; à venir : clairs). */
export function orbiteSvg(o: OptionsOrbite): string {
  const n = Math.max(1, Math.floor(o.n));
  const R = 40;
  const rn = o.rayonNoeud ?? (n > 16 ? 2.6 : n > 10 ? 3.4 : 4.4);
  const rp = 8.5;
  const ang = (i: number): number => -90 + (i * 360) / n;
  const p = (i: number): [number, number] => [50 + R * Math.cos(rad(ang(i))), 50 + R * Math.sin(rad(ang(i)))];
  const circ = 2 * Math.PI * R;
  const frac = o.courant < 0 ? 0 : o.courant / n;
  const defs: string[] = [];
  const nodes: string[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = p(i);
    const etat = i === o.courant ? "courant" : i < o.courant ? "fait" : "avenir";
    const photo = o.photos?.[i];
    if (photo) {
      defs.push(`<clipPath id="kp${i}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rp}"/></clipPath>`);
      nodes.push(`<g class="k-on k-on--${etat} k-on--photo" style="--i:${i}"><circle class="k-on__halo" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rp + 1.6}"/><image href="${esc(photo)}" x="${(x - rp).toFixed(2)}" y="${(y - rp).toFixed(2)}" width="${rp * 2}" height="${rp * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#kp${i})"/></g>`);
    } else {
      nodes.push(`<circle class="k-on k-on--${etat}" style="--i:${i}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rn}"/>`);
    }
  }
  const a11y = o.libelle ? `role="img" aria-label="${esc(o.libelle)}"` : 'aria-hidden="true"';
  return (
    `<svg class="k-orbite ${o.classe ?? ""}" viewBox="-4 -4 108 108" ${a11y} focusable="false">` +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    `<circle class="k-orbite__piste" cx="50" cy="50" r="${R}"/>` +
    `<circle class="k-orbite__arc" cx="50" cy="50" r="${R}" transform="rotate(-90 50 50)" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ * (1 - frac)).toFixed(2)}" style="--c:${circ.toFixed(2)}"/>` +
    nodes.join("") +
    `</svg>`
  );
}

/** Met à jour l'état d'une orbite déjà affichée (animation de l'arc et des nœuds). */
export function majOrbite(svg: Element, courant: number): void {
  const nodes = svg.querySelectorAll(".k-on");
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const el = nodes[i];
    if (!el) continue;
    const etat = i === courant ? "courant" : i < courant ? "fait" : "avenir";
    const photo = el.classList.contains("k-on--photo") ? " k-on--photo" : "";
    el.setAttribute("class", `k-on k-on--${etat}${photo}`);
  }
  const arc = svg.querySelector<SVGCircleElement>(".k-orbite__arc");
  if (arc) {
    const c = parseFloat(arc.getAttribute("stroke-dasharray") ?? "0");
    arc.setAttribute("stroke-dashoffset", (c * (1 - Math.max(0, courant) / Math.max(1, n))).toFixed(2));
  }
}
