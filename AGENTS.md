# Contributing to Markasso

Markasso is a zero-dependency browser-based whiteboard app built with TypeScript and Canvas 2D.

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
| `core/` | `Scene`, `AppState` (active tool, colors, grid), `Viewport` (pan/zoom math) |
| `elements/` | Discriminated union of all drawable element types (rect, ellipse, line, arrow, freehand, text, image) |
| `commands/` | Discriminated union of all state-mutating commands |
| `engine/` | Pure `reducer(scene, command) → scene` + `History` (undo/redo + pub/sub) |
| `io/` | `.markasso` format (JSON save/load), localStorage auto-save/restore |
| `rendering/` | Canvas 2D renderer, per-element draw dispatch, grid, selection handles, PNG/SVG export |
| `tools/` | 8 tools (select, hand, rectangle, ellipse, line, arrow, pen, text) |
| `ui/` | DOM init, canvas event hub, toolbar, properties panel, context panel, keyboard shortcuts |

### Data flow detail

1. `canvas_view.ts` captures DOM pointer events, converts to world coordinates, dispatches to the active tool
2. Tool handlers call `history.dispatch(command)`
3. `History` applies the command via `reducer`, manages the undo stack, notifies subscribers
4. The renderer re-renders on the next `requestAnimationFrame`

## Tests

Tests live in `tests/` and cover pure logic only: reducer commands, undo/redo stack, viewport math, hit detection. No browser APIs required — Vitest runs in Node.

When adding a new element type or command, add corresponding tests.

## Guidelines

- Keep Markasso zero-dependency — do not add runtime npm packages
- New element types go in `elements/`, new commands in `commands/`; update the discriminated unions and the reducer's `switch`
- Do not touch the undo stack for ephemeral operations
- All coordinate math must work correctly across different `devicePixelRatio` values

## Deployment

GitHub Actions deploys tagged releases (`v*`) to GitHub Pages at `/Markasso/`.
