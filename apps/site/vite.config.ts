import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { logoSvg, orbiteSvg, symboleSvg, type Variante } from '../../packages/brand/icons/logo-svg';
import { svgIcone, type NomIcone } from '../../packages/brand/icons/icons';

/* Site multi-pages : chaque dossier contenant un index.html est une page
   (/site/aide/, /site/legal/cookies/…). En-tête, pied de page et balises
   communes sont injectés à la compilation, ainsi que le logo de la charte,
   l'Orbite et les icônes en SVG statique : HTML complet, lisible sans
   JavaScript, sans dépendre d'une police pour la marque.
   Marqueurs : <!--@logo[:variante[:classe]]-->, <!--@logo-signe[:variante[:classe]]-->,
   <!--@symbole[:variante[:classe]]-->, <!--@orbite:n:courant:classe-->, <!--@i:nom--> */
const root = dirname(fileURLToPath(import.meta.url));

function pages(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'public', 'src', 'partials', 'scripts'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) Object.assign(out, pages(p));
    else if (name === 'index.html') out[relative(root, dir).replace(/\\/g, '/') || 'main'] = p;
  }
  return out;
}

const partial = (n: string): string => readFileSync(resolve(root, 'partials', `${n}.html`), 'utf8');
const variante = (v?: string): Variante => (v === 'inverse' || v === 'mono' ? v : 'couleur');

function chrome(): Plugin {
  return {
    name: 'kombe-site-chrome',
    transformIndexHtml(html) {
      return html
        .replace('<!--@head-->', partial('head'))
        .replace('<!--@header-->', partial('header'))
        .replace('<!--@footer-->', partial('footer'))
        .replace(/<!--@logo-signe(?::([a-z]+))?(?::([a-z_ -]+))?-->/g, (_m, v?: string, c?: string) => logoSvg({ variante: variante(v), classe: c ?? '' }))
        .replace(/<!--@logo(?::([a-z]+))?(?::([a-z_ -]+))?-->/g, (_m, v?: string, c?: string) => logoSvg({ variante: variante(v), signature: false, classe: c ?? '' }))
        .replace(/<!--@symbole(?::([a-z]+))?(?::([a-z_ -]+))?-->/g, (_m, v?: string, c?: string) => symboleSvg({ variante: variante(v), classe: c ?? '' }))
        .replace(/<!--@orbite:(\d+):(-?\d+):([a-z_ -]*)-->/g, (_m, n: string, c: string, cl: string) => orbiteSvg({ n: +n, courant: +c, classe: cl }))
        .replace(/<!--@i:([a-z-]+)-->/g, (_m, n: string) => svgIcone(n as NomIcone, 24));
    },
  };
}

export default defineConfig({
  plugins: [chrome()],
  build: {
    target: ['es2020', 'chrome67', 'safari14', 'firefox68', 'edge79'],
    sourcemap: false, // site public : les sources ne partent pas avec le bundle
    cssCodeSplit: false,
    rollupOptions: { input: pages(root) },
  },
  server: { host: '127.0.0.1', port: 5180 },
});
