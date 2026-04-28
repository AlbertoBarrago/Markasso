import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/core/**',
        'src/engine/**',
        'src/io/mermaid.ts',
        'src/io/presets.ts',
        'src/io/share.ts',
        'src/rendering/connector_geometry.ts',
        'src/rendering/draw_selection.ts',
        'src/tools/**',
      ],
      exclude: [
        'src/tools/text_tool.ts',
        'src/tools/sticky_tool.ts',
        'src/tools/select_tool.ts',
        'src/core/clipboard.ts',
      ],
    },
  },
});
