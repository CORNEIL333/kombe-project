/* En-tête commun du site : menus déroulants (clic, clavier, survol sur
   ordinateur), menu mobile plein écran, en-tête plein au défilement.
   Sans JavaScript, la navigation reste accessible : les liens sont des <a>
   et les panneaux s'ouvrent au survol / au focus (CSS :focus-within). */

export function initChrome(): void {
  const top = document.getElementById('top');
  const nav = document.getElementById('top-nav');
  const burger = top?.querySelector<HTMLButtonElement>('.burger') ?? null;
  const menus = Array.prototype.slice.call(document.querySelectorAll<HTMLElement>('.menu')) as HTMLElement[];

  const closeMenus = (except?: HTMLElement): void => {
    menus.forEach((m) => {
      if (m === except) return;
      m.classList.remove('is-open');
      m.querySelector('.menu__btn')?.setAttribute('aria-expanded', 'false');
    });
  };
  menus.forEach((m) => {
    const btn = m.querySelector<HTMLButtonElement>('.menu__btn');
    btn?.addEventListener('click', () => {
      const open = !m.classList.contains('is-open');
      closeMenus(m);
      m.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  const setNav = (open: boolean): void => {
    nav?.classList.toggle('is-open', open);
    document.documentElement.classList.toggle('nav-open', open);
    burger?.setAttribute('aria-expanded', String(open));
    burger?.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  };
  burger?.addEventListener('click', () => setNav(!nav?.classList.contains('is-open')));
  nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { setNav(false); closeMenus(); }));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeMenus();
    if (nav?.classList.contains('is-open')) { setNav(false); burger?.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Node)) return;
    if (!menus.some((m) => m.contains(e.target as Node))) closeMenus();
  });

  const onScroll = (): void => { top?.classList.toggle('is-solid', window.scrollY > 40 || !document.body.classList.contains('page-home')); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/** Révélations à l'entrée dans le viewport (une seule fois). */
export function initReveals(reduce: boolean): void {
  const targets = Array.prototype.slice.call(document.querySelectorAll('.reveal, .revele')) as Element[];
  if (reduce || !('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((t) => io.observe(t));
}
