# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:5173
pnpm build        # Type-check + Vite production build → dist/
pnpm typecheck    # Run TypeScript validation only
pnpm test         # Run Vitest unit tests once
pnpm test:watch   # Run Vitest in watch mode
pnpm preview      # Preview production build locally
```

Pre-commit hook automatically runs `pnpm typecheck && pnpm test`.

## Architecture

Markasso is a zero-dependency browser-based whiteboard app using Canvas 2D. It follows a Redux-style unidirectional data flow:

```
User Event → Tool → Command → History.dispatch → reducer(Scene, Command) → Scene → render
```

### Key invariants
- All coordinates are in CSS pixels; canvas buffer is scaled by `devicePixelRatio`
- `Scene` objects are immutable — new reference if changed, same reference if unchanged
- Ephemeral commands (pan, zoom, select, tool changes) are excluded from the undo stack
- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — exhaustive `switch` on discriminated unions enforces handling of all cases

### Module layers (`src/`)

| Module | Responsibility |
|--------|---------------|
| `core/` | `Scene`, `AppState` (active tool, colors, grid), `Viewport` (pan/zoom coordinate math) |
| `elements/` | Discriminated union of all drawable element types (rect, ellipse, line, arrow, freehand, text, image) |
| `commands/` | Discriminated union of all state-mutating commands |
| `engine/` | Pure `reducer(scene, command) → scene` + `History` (undo/redo + pub/sub) |
| `io/` | `.markasso` format (JSON save/load), localStorage auto-save/restore |
| `rendering/` | Canvas 2D renderer, per-element draw dispatch, grid, selection handles, PNG/SVG export |
| `tools/` | 8 tools (select, hand, rectangle, ellipse, line, arrow, pen, text) with `onMouseDown/Move/Up` handlers |
| `ui/` | DOM initialization, canvas event hub, toolbar, properties panel, context panel, keyboard shortcuts |

### Data flow detail
1. `canvas_view.ts` captures DOM pointer events, converts to world coordinates, and dispatches to the active tool
2. Tool handlers call `history.dispatch(command)`
3. `History` applies the command via `reducer`, manages the undo stack, and notifies subscribers
4. The renderer is subscribed via `history.subscribe()` and re-renders on the next `requestAnimationFrame`

### Tests (`tests/`)
Tests cover core pure logic only — reducer commands, undo/redo stack, viewport math, hit detection. No browser APIs are needed; Vitest runs in Node.

## Deployment

GitHub Actions deploys tagged releases (`v*`) to GitHub Pages at `/Markasso/`. The workflow syncs the version from the git tag, runs typecheck + test, builds, then deploys.
