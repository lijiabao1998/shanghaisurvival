import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Published at /shanghaisurvival/, not the domain root.
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: entry('./index.html'),
        survival: entry('./survival.html'),
        stress: entry('./stress.html'),
      },
    },
  },
});
