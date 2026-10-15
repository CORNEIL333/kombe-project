import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],build:{target:['es2020','chrome67','safari14','firefox68','edge79'],sourcemap:true},server:{host:'127.0.0.1',port:5173}});
