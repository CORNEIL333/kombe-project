import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
// Espace bureau : ouvert par les trésoriers et secrétaires sur des téléphones
// parfois anciens — mêmes cibles que la PWA (voir packages/client/vite.config.ts).
const CIBLES_TERRAIN = ['chrome >= 67', 'and_chr >= 67', 'safari >= 14', 'ios_saf >= 14', 'samsung >= 9', 'firefox >= 68', 'edge >= 79', 'opera >= 54'];
export default defineConfig({plugins:[react(), legacy({renderLegacyChunks: false, modernTargets: CIBLES_TERRAIN, modernPolyfills: true})],build:{sourcemap:true},server:{host:'127.0.0.1',port:5173}});
