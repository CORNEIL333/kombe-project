/* KÓMBE — accueil du site : mouvement (charte : le mouvement explique, il
   ne distrait jamais ; durées 150–560 ms ; coupé sous prefers-reduced-motion).
   1. Titre révélé mot à mot.
   2. Orbite des membres (photos d'illustration) : le tour avance toutes les
      2,8 s, la puce « Tour N » suit.
   3. Manifeste : les mots s'allument au défilement.
   4. Cycle : 12 tours pilotés par le défilement, registre synchronisé. */
import '@kombe/brand/v3.css';
import './site.css';
import { majOrbite, orbiteSvg } from '@kombe/brand/logo';
import { initChrome, initReveals } from './chrome';

const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const P = '/brand/photos/';
document.documentElement.classList.add('js');
initChrome();

/* Découpe un élément en mots animables (le texte reste lu d'un bloc). */
function mots(el: HTMLElement, classe: string, delai?: (i: number) => number): HTMLElement[] {
  el.setAttribute('aria-label', (el.textContent ?? '').replace(/\s+/g, ' ').trim());
  const out: HTMLElement[] = [];
  const walk = (node: Node): void => {
    Array.prototype.slice.call(node.childNodes).forEach((child: Node) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent && child.textContent.trim()) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement('span');
          s.className = classe;
          s.setAttribute('aria-hidden', 'true');
          if (delai) s.style.transitionDelay = `${delai(out.length)}ms`;
          s.textContent = part;
          frag.appendChild(s);
          out.push(s);
        });
        child.parentNode?.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    });
  };
  walk(el);
  return out;
}

const titre = document.querySelector<HTMLElement>('[data-mots]');
if (titre) mots(titre, 'mot', (i) => 120 + i * 90);
window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.documentElement.classList.add('is-ready')));

/* 2 — orbite du héros */
const heroHost = document.getElementById('hero-orbite');
if (heroHost) {
  const n = 10;
  heroHost.innerHTML = orbiteSvg({
    n, courant: 3, classe: 'k-orbite--trace', rayonNoeud: 2.6,
    photos: { 1: `${P}tresoriere.webp`, 3: `${P}onboarding-portrait.webp`, 6: `${P}generations.webp`, 8: `${P}tour-beneficiaire.webp` },
  });
  const svg = heroHost.querySelector('svg');
  const tour = document.getElementById('hero-tour');
  const benef = document.getElementById('hero-benef');
  const noms = ['Paul A.', 'Linda M.', 'Serge N.', 'Marie A.', 'Éric K.', 'Joëlle B.', 'Didier F.', 'Rose E.', 'Alain M.', 'Grâce O.'];
  let t = 3;
  if (svg && !reduce) {
    window.setInterval(() => {
      t = (t + 1) % n;
      majOrbite(svg, t);
      if (tour) tour.textContent = String(t + 1);
      if (benef) benef.textContent = `Tour ${t + 1} · ${noms[t] ?? ''}`;
    }, 2800);
  }
}

/* 3 — manifeste mot à mot */
const manif = document.querySelector<HTMLElement>('[data-defile]');
const motsManif = manif ? mots(manif, 'mt') : [];
if (reduce) motsManif.forEach((w) => w.classList.add('is-on'));
const onMots = (): void => {
  if (!manif || reduce) return;
  const b = manif.getBoundingClientRect();
  const vh = window.innerHeight;
  const p = Math.min(1, Math.max(0, (vh * 0.88 - b.top) / (b.height + vh * 0.4)));
  const k = Math.round(p * motsManif.length);
  for (let i = 0; i < motsManif.length; i++) motsManif[i]?.classList.toggle('is-on', i < k);
};

/* 4 — cycle piloté par le défilement (données d'exemple) */
const cycle = document.getElementById('cycle');
const cycleSvg = document.querySelector('#cycle-orbite svg');
const el = (id: string): HTMLElement | null => document.getElementById(id);
const N = 12;
let dernier = '';
const rendreCycle = (step: number, frac: number): void => {
  if (!cycleSvg) return;
  const conf = Math.min(N - 1, Math.floor(frac * 1.3 * (N - 1)));
  const cle = `${step}:${conf}`;
  if (cle === dernier) return;
  if (!dernier.startsWith(`${step}:`)) majOrbite(cycleSvg, step);
  dernier = cle;
  const tour = String(step + 1).padStart(2, '0');
  const set = (id: string, v: string): void => { const e = el(id); if (e) e.textContent = v; };
  set('cy-grand', tour);
  set('cy-tour', `${tour} / ${N}`);
  set('cy-benef', `Membre ${tour}`);
  set('cy-conf', `${String(conf).padStart(2, '0')} / ${N - 1}`);
  const jauge = el('cy-jauge');
  if (jauge) jauge.style.width = `${((conf / (N - 1)) * 100).toFixed(0)}%`;
  const etat = el('cy-etat');
  if (etat) etat.innerHTML = conf < N - 1
    ? '<span class="k-statut k-statut--attente">Collecte en cours</span>'
    : step === N - 1 ? '<span class="k-statut k-statut--ok">Cycle complet</span>' : '<span class="k-statut k-statut--ok">Remis au bénéficiaire</span>';
};
const onCycle = (): void => {
  if (!cycle || !cycleSvg) return;
  const b = cycle.getBoundingClientRect();
  const span = Math.max(1, b.height - window.innerHeight);
  const p = Math.min(0.9999, Math.max(0, -b.top / span));
  const step = Math.floor(p * N);
  rendreCycle(step, p * N - step);
  const barre = el('cy-barre');
  if (barre) barre.style.width = `${(p * 100).toFixed(1)}%`;
};
rendreCycle(0, 0);

/* Parallaxe douce des téléphones */
const tels = Array.prototype.slice.call(document.querySelectorAll<HTMLElement>('[data-profondeur]')) as HTMLElement[];
const onTels = (): void => {
  if (reduce || window.innerWidth < 900) return;
  const vh = window.innerHeight;
  tels.forEach((t) => {
    const r = t.getBoundingClientRect();
    const k = (r.top + r.height / 2 - vh / 2) / vh;
    t.style.transform = `translateY(${(k * -56 * Number(t.dataset.profondeur ?? 1)).toFixed(1)}px)`;
  });
};

let attente = false;
const onScroll = (): void => {
  if (attente) return;
  attente = true;
  window.requestAnimationFrame(() => { attente = false; onMots(); onCycle(); onTels(); });
};
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();
initReveals(reduce);
