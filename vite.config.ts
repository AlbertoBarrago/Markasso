import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  root: '.',
  plugins: [],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
