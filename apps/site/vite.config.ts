import { defineConfig } from 'vite';
export default defineConfig({ build: { target: 'es2022', sourcemap: true, cssCodeSplit: false }, server: { host: '127.0.0.1', port: 5180 } });
