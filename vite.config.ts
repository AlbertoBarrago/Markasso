import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Stamps every build with an id: compiled into the app as `__BUILD_ID__` and
 * served as `/version.json`. An open tab compares the two to notice a newer
 * deploy (src/ui/update_banner.ts). A timestamp is enough: every deploy is a
 * new build, and the id is only ever compared for equality.
 */
function buildId(): Plugin {
  const id = Date.now().toString(36);
  return {
    name: 'markasso-build-id',
    config: () => ({ define: { __BUILD_ID__: JSON.stringify(id) } }),
    applyToEnvironment: (env) => env.name === 'client',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: id }),
      });
    },
  };
}

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
    plugins: [cloudflare(), buildId()],
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
