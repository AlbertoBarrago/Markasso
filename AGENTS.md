# Contributing to Markasso

Markasso is a browser-based whiteboard app with a zero-dependency core, built with TypeScript and Canvas 2D.

## Setup

```bash
pnpm install
pnpm dev        # Dev server at http://localhost:5173
```

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Type-check + production build → dist/
pnpm typecheck    # TypeScript validation only
pnpm test         # Run unit tests once
pnpm test:watch   # Run tests in watch mode
pnpm preview      # Preview production build
```

A pre-commit hook runs `pnpm typecheck && pnpm test` automatically.

## Architecture

Markasso follows a Redux-style unidirectional data flow:

```
User Event → Tool → Command → History.dispatch → reducer(Scene, Command) → Scene → render
```

### Key invariants

- All coordinates are in CSS pixels; the canvas buffer is scaled by `devicePixelRatio`
- `Scene` objects are immutable — new reference on change, same reference if unchanged
- Ephemeral operations (pan, zoom, select, tool changes) are excluded from the undo stack
- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- Exhaustive `switch` on discriminated unions — all cases must be handled

### Module layers (`src/`)

| Module | Responsibility |
|--------|----------------|
| `core/` | `Scene`, `AppState` (active tool, colors, grid), `Viewport` (pan/zoom math), layered auto layout, canvas-free text metrics (`text_metrics.ts`, tables from `scripts/build-font-metrics.mjs`) shared by renderer, export and MCP |
| `elements/` | Discriminated union of all drawable element types (rectangle, ellipse, rhombus, flowchart `shape`, `stencil` icon, line, arrow, curve, polygon, freehand, text, image); flowchart outlines (`shapes.ts`) and icon sets/registry (`stencils/`) |
| `commands/` | Discriminated union of all state-mutating commands |
| `engine/` | Pure `reducer(scene, command) → scene` + `History` (undo/redo + pub/sub) |
| `io/` | `.markasso` format (JSON save/load), localStorage auto-save/restore, share links, realtime, Mermaid import, vendor icon pack import (ZIP reader, IndexedDB store) |
| `libraries/` | Bundled icon packs loaded as lazy chunks (generated, e.g. `kubernetes/` via `scripts/build-k8s-icons.mjs`) |
| `rendering/` | Canvas 2D renderer, per-element draw dispatch, grid, selection handles, connector geometry (ports, elbow routing, arrowheads), connector label placement, shape geometry, PNG/SVG export (kept in parity with the canvas, see `tests/export_parity.test.ts`) |
| `tools/` | Select, hand, eraser, rectangle, rhombus, ellipse, flowchart shape, line (arrowheads are a line style), pen, text, sticky note |
| `ui/` | DOM init, canvas event hub, toolbar, context panel, library sidebar, command palette, keyboard shortcuts |

### Data flow detail

1. `canvas_view.ts` captures DOM pointer events, converts to world coordinates, dispatches to the active tool
2. Tool handlers call `history.dispatch(command)`
3. `History` applies the command via `reducer`, manages the undo stack, notifies subscribers
4. The renderer re-renders on the next `requestAnimationFrame`

## Tests

Tests live in `tests/` and cover pure logic only: reducer commands, undo/redo stack, viewport math, hit detection. No browser APIs required — Vitest runs in Node.

When adding a new element type or command, add corresponding tests.

## Guidelines

- Keep the core (`core/`, `elements/`, `commands/`, `engine/`, `rendering/`, `tools/`) zero-dependency: no runtime npm packages there
- A runtime dependency is acceptable only for an isolated feature that would otherwise mean re-implementing a mature project (e.g. Mermaid import via `@excalidraw/mermaid-to-excalidraw`). It must be loaded with a dynamic `import()` so it never lands in the entry chunk, and it needs an explicit rationale
- New element types go in `elements/`, new commands in `commands/`; update the discriminated unions and the reducer's `switch`
- Do not touch the undo stack for ephemeral operations
- All coordinate math must work correctly across different `devicePixelRatio` values

## Deployment

GitHub Actions deploys tagged releases (`v*`) to GitHub Pages at `/Markasso/`.

## Imported Claude Cowork project instructions

MARKASSOis a zero-latency, framework-agnostic whiteboard engine. Built with
  vanilla TypeScript and the Canvas 2D API, it delivers a high-performance
  drawing experience with zero dependencies and a keyboard-first workflow.
  It’s the "Vesper" of whiteboards: dark, fast, and focused.
