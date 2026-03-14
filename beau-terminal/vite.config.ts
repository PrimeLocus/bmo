import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { hmrRecovery } from './vite-hmr-recovery.js';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), hmrRecovery()],
  server: {
    port: 4242,
    strictPort: true,
    open: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    watch: {
      ignored: ['**/data/**'],
    },
  },
});
