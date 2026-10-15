import '@kombe/brand/kombe.css';
import './site.css';
import { createOrbit, reducedMotion, type OrbitHandle } from './orbit';
import { initChrome } from './chrome';

document.documentElement.classList.add('js');
initChrome();
const reduce = reducedMotion();
const P = '/brand/photos/';

/* Titre du héros : chaque mot arrive l'un après l'autre (le texte reste
   lisible et sélectionnable ; sans JS il s'affiche tel quel). */
document.querySelectorAll<HTMLElement>('[data-split]').forEach((h) => {
  let i = 0;
  const walk = (node: Node): void => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent && child.textContent.trim()) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement('span');
          s.className = 'w';
          s.style.transitionDelay = `${120 + i++ * 70}ms`;
          s.textContent = part;
          frag.appendChild(s);
        });
        child.parentNode?.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName !== 'BR') {
        walk(child);
      }
    });
  };
  walk(h);
});

/* 01 — L'orbite du héros : 10 membres, 4 visages, tour 4 en cours. */
const heroHost = document.getElementById('hero-orbit');
if (heroHost) {
  const hero = createOrbit(heroHost, {
    n: 10, current: 4, size: 620, nodeR: 11, stroke: 3, converge: true, photoR: 40,
    photos: { 1: `${P}tresoriere.webp`, 3: `${P}onboarding-portrait.webp`, 6: `${P}generations.webp`, 8: `${P}tour-beneficiaire.webp` },
    label: 'Un cercle de 10 membres ; le tour 4 est en cours.',
  });
  hero.play();
}
window.requestAnimationFrame(() => document.documentElement.classList.add('is-ready'));

/* Lumière du héros : suit doucement le pointeur (bureau seulement). */
const heroSec = document.getElementById('hero');
if (heroSec && !reduce && window.matchMedia('(pointer: fine)').matches) {
  let raf = 0;
  heroSec.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      const b = heroSec.getBoundingClientRect();
      heroSec.style.setProperty('--mx', `${((e.clientX - b.left) / b.width) * 100}%`);
      heroSec.style.setProperty('--my', `${((e.clientY - b.top) / b.height) * 100}%`);
    });
  });
}


/* 02 → 03 — la scène s'ordonne au défilement : du désordre au registre. */
const chaos = document.getElementById('avant');
const crowdHost = document.getElementById('chaos-crowd');
const crowd: OrbitHandle | null = crowdHost
  ? createOrbit(crowdHost, { n: 9, current: 0, size: 760, figures: true, nodeR: 26, inverse: true, label: 'Neuf personnes qui forment un groupe' })
  : null;
crowd?.disperse(true);
const onChaos = (): void => {
  if (!chaos) return;
  const box = chaos.getBoundingClientRect();
  const span = Math.max(1, box.height - window.innerHeight);
  const clear = -box.top / span > 0.42;
  if (clear !== chaos.classList.contains('is-clear')) crowd?.disperse(!clear);
  chaos.classList.toggle('is-clear', clear);
};

/* Parallaxe légère des écrans (téléphones, portable). */
const tilts = Array.prototype.slice.call(document.querySelectorAll<HTMLElement>('[data-depth]')) as HTMLElement[];
const onTilt = (): void => {
  if (reduce) return;
  const vh = window.innerHeight;
  tilts.forEach((el) => {
    const b = el.getBoundingClientRect();
    const t = (b.top + b.height / 2 - vh / 2) / vh; // -1 … 1
    const depth = Number(el.dataset.depth ?? 1);
    const base = el.classList.contains('phone--l') ? ' rotateY(14deg)' : el.classList.contains('phone--r') ? ' rotateY(-14deg)' : '';
    el.style.transform = `translateY(${(t * -40 * depth).toFixed(1)}px)${base}`;
  });
};

let ticking = false;
const onScroll = (): void => {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => { ticking = false; onChaos(); onTilt(); });
};
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

/* 04 — cycle interactif (clavier + tactile). */
const cycleHost = document.getElementById('cycle-orbit');
const cycleText = document.getElementById('cycle-text');
if (cycleHost && cycleText) {
  const n = 8;
  let round = 3;
  const cycle = createOrbit(cycleHost, { n, current: round, size: 520, figures: true, nodeR: 22, stroke: 5, label: `Cycle de ${n} membres` });
  const render = (): void => {
    cycle.setCurrent(round);
    cycleText.innerHTML = `<b>Tour ${round} sur ${n}</b> · le membre ${round} reçoit le pot, les autres cotisent.`;
  };
  document.getElementById('prev')?.addEventListener('click', () => { round = round <= 1 ? n : round - 1; render(); });
  document.getElementById('next')?.addEventListener('click', () => { round = round >= n ? 1 : round + 1; render(); });
  render();
}

/* Orbites des écrans d'exemple (téléphone « Cycle », bureau). */
const phoneOrbit = document.getElementById('phone-orbit');
if (phoneOrbit) createOrbit(phoneOrbit, { n: 12, current: 4, size: 170, nodeR: 6, stroke: 4, label: 'Cycle de 12 tours, tour 4' });
const deskOrbit = document.getElementById('desk-orbit');
if (deskOrbit) createOrbit(deskOrbit, { n: 12, current: 4, size: 110, nodeR: 4.5, stroke: 3, label: 'Cycle de 12 tours, tour 4' });

/* 06 — décision : le groupe se réunit, la moitié lève la main. */
const decisionHost = document.getElementById('decision-orbit');
const gatherBtn = document.getElementById('gather');
if (decisionHost && gatherBtn) {
  const d = createOrbit(decisionHost, { n: 10, current: 0, size: 460, inverse: true, figures: true, nodeR: 20, stroke: 3, label: 'Dix membres réunis autour d’une décision' });
  let on = false;
  gatherBtn.addEventListener('click', () => {
    on = !on;
    d.gather(on);
    gatherBtn.setAttribute('aria-pressed', String(on));
    gatherBtn.textContent = on ? 'Revenir au cercle' : 'Voir le groupe voter';
  });
}

/* Final : grande orbite calme, cycle terminé (anneau fermé). */
const finalHost = document.getElementById('final-orbit');
if (finalHost) createOrbit(finalHost, { n: 12, current: 13, size: 900, nodeR: 9, stroke: 2, inverse: true, label: '' });

/* Révélations à l'entrée dans le viewport (une seule fois). */
const targets = Array.prototype.slice.call(document.querySelectorAll('.reveal, .decision')) as Element[];
if (!reduce && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((t) => io.observe(t));
} else {
  targets.forEach((t) => t.classList.add('is-in'));
}
