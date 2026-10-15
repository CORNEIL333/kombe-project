import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/* Site multi-pages : chaque dossier contenant un index.html est une page
   (/site/aide/, /site/legal/cookies/…). En-tête, pied de page et balises
   communes sont injectés à la compilation (`<!--@header-->`, `<!--@footer-->`,
   `<!--@head-->`) : HTML statique complet, lisible sans JavaScript. */
const root = dirname(fileURLToPath(import.meta.url));

function pages(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'public', 'src', 'partials'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) Object.assign(out, pages(p));
    else if (name === 'index.html') out[relative(root, dir).replace(/\\/g, '/') || 'main'] = p;
  }
  return out;
}

const partial = (n: string): string => readFileSync(resolve(root, 'partials', `${n}.html`), 'utf8');

function chrome(): Plugin {
  return {
    name: 'kombe-site-chrome',
    transformIndexHtml(html) {
      return html.replace('<!--@head-->', partial('head')).replace('<!--@header-->', partial('header')).replace('<!--@footer-->', partial('footer'));
    },
  };
}

export default defineConfig({
  plugins: [chrome()],
  build: {
    target: ['es2020', 'chrome67', 'safari14', 'firefox68', 'edge79'],
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: { input: pages(root) },
  },
  server: { host: '127.0.0.1', port: 5180 },
});
