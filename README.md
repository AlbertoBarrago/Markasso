# Markasso

> A fast, minimal, keyboard-first whiteboard engine for the browser.
> Marker + Picasso. No framework. No runtime. Just canvas.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.x-646cff?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested-Vitest-6e9f18?logo=vitest&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

---

## Features

| | |
|---|---|
| **7 drawing tools** | Select, Rectangle, Ellipse, Line, Arrow, Pen (freehand), Text |
| **Infinite canvas** | Pan with middle-click or Alt+drag · zoom with Ctrl+scroll |
| **Dark theme** | Deep `#13131f` canvas, carefully tuned contrast |
| **Millimeter grid** | Dot · Line · Graph-paper (real mm at 96 DPI) |
| **Properties panel** | Stroke color, fill color, stroke width, opacity, font — all per-selection |
| **Undo / Redo** | Full command history with ephemeral-command filtering |
| **Invisible text input** | Excalidraw-style transparent overlay textarea |
| **Keyboard shortcuts** | Full set, no library |
| **Persistent settings** | Toolbar position, accent color — saved to `localStorage` |
| **Zero dependencies** | Browser Canvas 2D API only, no React, no D3 |

---

## Getting started

```bash
npm install
npm run dev        # → http://localhost:5173
```

```bash
npm run build      # type-check + Vite bundle → dist/
npm run typecheck  # tsc --noEmit
npm test           # Vitest (19 unit tests)
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `V` | Select tool |
| `R` | Rectangle |
| `E` | Ellipse |
| `L` | Line |
| `A` | Arrow |
| `P` | Pen (freehand) |
| `T` | Text |
| `G` | Toggle grid |
| `Esc` | Cancel / back to Select |
| `Delete` / `Backspace` | Delete selected elements |
| `Ctrl+A` | Select all |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+scroll` | Zoom to cursor |
| `Scroll` | Pan |
| `Middle-click drag` / `Alt+drag` | Pan |
| **Text tool** | `Enter` = commit · `Shift+Enter` = newline · `Esc` = cancel |

---

## Architecture

Markasso follows a **Redux-style unidirectional data flow** — no mutable state, no event spaghetti.

```
User event
    │
    ▼
Tool (onMouseDown / onMouseMove / onMouseUp)
    │  dispatches Command
    ▼
History.dispatch(command)
    │  calls
    ▼
reducer(Scene, Command) → Scene   ← pure function, no side effects
    │  notifies
    ▼
Subscribers (toolbar, properties panel, canvas view)
    │
    ▼
render(ctx, scene, canvas)        ← called every requestAnimationFrame
```

### Key invariants

- **All coordinates in CSS pixels.** The canvas buffer is `clientWidth × devicePixelRatio` for sharpness, but all viewport `offsetX/Y`, element positions, and mouse events live in CSS pixel space. The renderer applies DPR via `ctx.setTransform(zoom*dpr, ...)`.
- **Immutable scene.** Every `Scene` object is never mutated. The reducer returns a new reference or the same reference if nothing changed (enabling cheap equality checks).
- **Ephemeral commands** (pan, zoom, select, tool change) are excluded from the undo stack.
- **`APPLY_STYLE`** is the single undoable command that updates both `appState` defaults and all currently selected elements in one atomic operation.

---

## Project structure

```
src/
├── core/
│   ├── scene.ts          # Scene interface + factory
│   ├── viewport.ts       # Pan/zoom math (screenToWorld, worldToScreen)
│   └── app_state.ts      # AppState (activeTool, colors, grid, …)
├── elements/
│   └── element.ts        # Discriminated union for all element types
├── commands/
│   └── commands.ts       # Full Command discriminated union
├── engine/
│   ├── reducer.ts        # Pure (Scene, Command) → Scene
│   └── history.ts        # Undo/redo stack + pub/sub
├── rendering/
│   ├── renderer.ts       # rAF render loop entry point
│   ├── draw_element.ts   # Per-type draw dispatch
│   ├── draw_grid.ts      # Dot / line / mm graph-paper grids
│   └── draw_selection.ts # Dashed box + 8 resize handles
├── tools/
│   ├── tool.ts           # Tool interface
│   ├── select_tool.ts    # Hit test, marquee, drag-move
│   ├── rectangle_tool.ts
│   ├── ellipse_tool.ts
│   ├── line_tool.ts
│   ├── arrow_tool.ts
│   ├── pen_tool.ts       # Freehand with Catmull-Rom smoothing
│   └── text_tool.ts      # Invisible overlay textarea
└── ui/
    ├── canvas_view.ts     # DOM event hub → world coords → tool
    ├── toolbar.ts         # Minimal top bar
    ├── properties_panel.ts# Floating right-side panel (selection-aware)
    ├── settings.ts        # Gear panel: grid, position, accent color
    └── shortcuts.ts       # Global keyboard map
```

---

## Grid modes

| Mode | Description |
|---|---|
| **Dot** | Subtle white dots at configurable world-unit spacing |
| **Line** | Horizontal + vertical lines |
| **mm** | Three-tier graph paper (1 mm / 5 mm / 10 mm) at physical scale assuming 96 DPI |

---

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript 5 | Exhaustive `switch` on discriminated unions catches unhandled commands at compile time |
| Build | Vite | Zero-config, instant HMR, single-file output |
| Rendering | Canvas 2D API | The spec says "Canvas is dumb. Canvas only renders." A virtual DOM fights a custom scene graph |
| Testing | Vitest | Runs in Node, no browser needed for pure reducer/viewport math |
| Dependencies | **none** | `crypto.randomUUID()`, `requestAnimationFrame`, `ResizeObserver` — all native |

---

## License

MIT
