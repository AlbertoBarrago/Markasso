import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  root: '.',
  plugins: [cloudflare()],
  environments: {
    client: {
      build: {
        rollupOptions: {
          // The /cloud licence page is built only with the cloud on (VITE_CLOUD_ENABLED, src/config/features.ts):
          // until the service opens, production has no such page. Read from the build's shell environment
          // (`pnpm build:nightly` sets it): a `.env` file is loaded after this config.
          input:
            process.env.VITE_CLOUD_ENABLED === 'true'
              ? { app: 'index.html', cloud: 'cloud/index.html' }
              : { app: 'index.html' },
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
