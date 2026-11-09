/* Pages secondaires du site (aide, sécurité, à propos, télécharger, légal). */
import '@kombe/brand/v3.css';
import './site.css';
import './pages.css';
import { initChrome, initReveals } from './chrome';

document.documentElement.classList.add('js');
initChrome();
initReveals(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
window.requestAnimationFrame(() => document.documentElement.classList.add('is-ready'));

/* Sommaire des pages légales : met en évidence la section lue. */
const toc = Array.prototype.slice.call(document.querySelectorAll<HTMLAnchorElement>('.toc a')) as HTMLAnchorElement[];
if (toc.length && 'IntersectionObserver' in window) {
  const byId = new Map(toc.map((a) => [a.getAttribute('href')?.slice(1) ?? '', a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      toc.forEach((a) => a.removeAttribute('aria-current'));
      byId.get(e.target.id)?.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  byId.forEach((_a, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}
