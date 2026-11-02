import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Published at /shanghaisurvival/, not the domain root.
  base: './',
  build: {
    rollupOptions: {
      input: {
        // The game is the site root; survival.html (public/) only redirects old links here.
        main: entry('./index.html'),
        street: entry('./street.html'),
        stress: entry('./stress.html'),
      },
    },
  },
});
