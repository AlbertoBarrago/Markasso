import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The /cloud licence page is built only with the cloud on (VITE_CLOUD_ENABLED,
  // src/config/features.ts). The shell wins,
  // otherwise `.env.production` turns it on for production builds. `loadEnv`
  // is needed because Vite loads `.env` files into the app after this config,
  // not into `process.env`.
  const cloudEnabled =
    (process.env.VITE_CLOUD_ENABLED ??
      loadEnv(mode, process.cwd(), 'VITE_').VITE_CLOUD_ENABLED) === 'true';
  return {
    base: '/',
    root: '.',
    plugins: [cloudflare()],
    environments: {
      client: {
        build: {
          rollupOptions: {
            input: {
              app: 'index.html',
              mac: 'mac/index.html',
              ...(cloudEnabled ? { cloud: 'cloud/index.html' } : {}),
            },
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
  };
});
