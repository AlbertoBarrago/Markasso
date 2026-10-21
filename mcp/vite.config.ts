import { defineConfig } from 'vite';

/**
 * Builds the MCP server as a Node ESM script. Markasso's own core (src/) is
 * bundled in; the MCP SDK and zod stay external and resolve from this
 * package's node_modules.
 */
export default defineConfig({
  build: {
    ssr: 'src/server.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      external: [/^@modelcontextprotocol\/sdk/, /^zod/, /^node:/],
      output: {
        entryFileNames: 'markasso-mcp.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
