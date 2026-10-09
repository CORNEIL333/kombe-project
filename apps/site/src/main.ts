import '@kombe/brand/kombe.css';
import './site.css';
import { createOrbit, reducedMotion } from './orbit';

/* ACTE 01 — les nœuds dispersés rejoignent l'anneau : le groupe se forme. */
const heroHost = document.getElementById('hero-orbit');
if (heroHost) {
  const hero = createOrbit(heroHost, { n: 12, current: 4, size: 880, nodeR: 24, stroke: 16, converge: true, label: 'Un cercle de 12 membres : le tour 4 est en cours.' });
  hero.play();
}
document.documentElement.classList.add('is-ready');

/* ACTES 02→03 — la même scène s'ordonne au défilement : du désordre au registre. */
const chaos = document.getElementById('acte-2');
// Illustration de fond : des personnes isolées qui, au moment où le registre apparaît, forment un cercle.
const crowdHost = document.getElementById('chaos-crowd');
const crowd = crowdHost ? createOrbit(crowdHost, { n: 9, current: 0, size: 760, figures: true, nodeR: 26, inverse: true, label: 'Neuf personnes qui forment un groupe' }) : null;
crowd?.disperse(true);
if (chaos) {
  let ticking = false;
  const update = (): void => {
    ticking = false;
    const box = chaos.getBoundingClientRect();
    const span = Math.max(1, box.height - window.innerHeight);
    const p = Math.min(1, Math.max(0, -box.top / span));
    const clear = p > 0.42;
    if (clear !== chaos.classList.contains('is-clear')) crowd?.disperse(!clear);
    chaos.classList.toggle('is-clear', clear);
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

/* ACTE 04 — cycle interactif (clavier + tactile). */
const cycleHost = document.getElementById('cycle-orbit');
const text = document.getElementById('cycle-text');
if (cycleHost && text) {
  const n = 8;
  let round = 3;
  const cycle = createOrbit(cycleHost, { n, current: round, size: 520, figures: true, nodeR: 22, label: `Cycle de ${n} membres` });
  const render = (): void => {
    cycle.setCurrent(round);
    text.innerHTML = `<b>Tour ${round} sur ${n}</b> · le membre ${round} reçoit le pot, les autres cotisent.`;
  };
  document.getElementById('prev')?.addEventListener('click', () => { round = round <= 1 ? n : round - 1; render(); });
  document.getElementById('next')?.addEventListener('click', () => { round = round >= n ? 1 : round + 1; render(); });
  render();
}

/* ACTE 06 — décision : les nœuds convergent (le groupe se réunit pour voter). */
const decisionHost = document.getElementById('decision-orbit');
const gatherBtn = document.getElementById('gather');
if (decisionHost && gatherBtn) {
  const d = createOrbit(decisionHost, { n: 10, current: 0, size: 460, inverse: true, figures: true, nodeR: 20, label: 'Dix membres réunis autour d’une décision' });
  let on = false;
  gatherBtn.addEventListener('click', () => {
    on = !on;
    d.gather(on);
    gatherBtn.setAttribute('aria-pressed', String(on));
    gatherBtn.textContent = on ? 'Revenir au cercle' : 'Voir le groupe se réunir';
  });
}

/* Révélations à l'entrée dans le viewport (une fois, sans bloquer la lecture). */
if (!reducedMotion() && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.2 });
  document.querySelectorAll('.act:not(.act--hero)').forEach((s) => { s.classList.add('will-reveal'); io.observe(s); });
}

/* Lien vers l'application : seulement si une URL réelle est configurée au build. */
const appUrl = import.meta.env.VITE_KOMBE_APP_URL as string | undefined;
const appLink = document.getElementById('app-link') as HTMLAnchorElement | null;
if (appLink && appUrl) { appLink.href = appUrl; appLink.hidden = false; }
