import { copyFile, mkdir } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';

/**
 * The bundle embeds the Kubernetes icon pack (Apache-2.0), whose license must
 * travel with every redistribution, npm included.
 */
function thirdPartyLicenses(): Plugin {
  return {
    name: 'markasso-third-party-licenses',
    async writeBundle() {
      await mkdir('dist/licenses', { recursive: true });
      await copyFile(
        '../src/libraries/kubernetes/LICENSE',
        'dist/licenses/kubernetes-icons-LICENSE',
      );
    },
  };
}

/**
 * Builds the MCP server as a Node ESM script. Markasso's own core (src/) is
 * bundled in; the MCP SDK, zod and resvg (native) stay external and resolve from this
 * package's node_modules.
 */
export default defineConfig({
  plugins: [thirdPartyLicenses()],
  build: {
    ssr: 'src/server.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      external: [
        /^@modelcontextprotocol\/sdk/,
        /^@resvg\/resvg-js/,
        /^zod/,
        /^node:/,
      ],
      output: {
        entryFileNames: 'markasso-mcp.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
