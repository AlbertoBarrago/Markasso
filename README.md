# Markasso

> **Marker + Picasso. Zero dependencies. Zero excuses.**

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.x-646cff?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested-Vitest-6e9f18?logo=vitest&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## What is this?

A fast, minimal, keyboard-first whiteboard engine that runs entirely in the browser.

No React. No Vue. No Angular. No Svelte. No Solid. No Qwik. No Next. No Nuxt. No Remix. No Astro. No framework tax whatsoever. Just you, a canvas, and pure JavaScript doing exactly what it was invented to do.

Excalidraw is great. Draw.io is powerful. **Markasso is neither of those things** — it's smaller, faster, and doesn't ask you to sign in, accept cookies, or create a workspace to draw a rectangle.

---

## Why does this exist?

Have you ever wanted to sketch a quick diagram and ended up:

1. Waiting 4 seconds for Excalidraw to load
2. Accidentally closing 3 cookie banners
3. Signing into a "free" account
4. Losing your work because you forgot to export
5. Opening Notepad instead and drawing with ASCII art

**Markasso is for step 6.** The one where you just want to draw.

---

## Features

| | |
|---|---|
| **7 drawing tools** | Select, Rectangle, Ellipse, Line, Arrow, Pen (freehand), Text |
| **Infinite canvas** | Pan with middle-click or Alt+drag · zoom with Ctrl+scroll |
| **Resize handles** | 8-handle bounding box on every element type — drag to scale |
| **Rotation** | Rotate any element via a handle above the selection box; fully undoable |
| **Endpoint editing** | Drag individual endpoints of lines and arrows independently |
| **Shape labels** | Double-click any rectangle or ellipse to type a label, clipped inside the shape |
| **Text scaling** | Dragging a text handle scales the font size, not just the box |
| **Shift constraints** | Rectangle/Ellipse → square/circle · Line/Arrow → 45° snap · Resize → keep aspect ratio |
| **Double-click to edit** | Open any existing text element for inline editing |
| **Floating glass UI** | Excalidraw-style islands: center-top tools, bottom-left undo/zoom, top-right export |
| **Export PNG / SVG** | Download the canvas as a 2× PNG or a clean SVG — bounding-box auto-fit |
| **Dark theme** | Pure `#141414` canvas with floating panels and `backdrop-filter: blur` that makes it look like you know what you're doing |
| **Millimeter grid** | Dot · Line · Graph-paper (real mm at 96 DPI) for when you need to feel precise |
| **Properties panel** | Stroke color, fill color, stroke width, opacity, font — all per-selection |
| **Undo / Redo** | Full command history. Make mistakes confidently. |
| **Persistent settings** | Your accent color survives page refreshes (localStorage — no servers harmed) |
| **Keyboard shortcuts** | Letter keys + numeric keys `1–7` for every tool because mice are slow |
| **Zero dependencies** | Browser Canvas 2D API only. `package.json` has never been so empty. |

---

## Markasso vs the competition

| | Markasso | Excalidraw | Draw.io |
|---|:---:|:---:|:---:|
| Zero dependencies | ✅ | ❌ (React + 50 friends) | ❌ |
| No login required | ✅ | ✅ | sort of |
| Cookie banners | 0 | varies | yes |
| Bundle size | tiny | less tiny | 🐋 |
| Infinite canvas | ✅ | ✅ | ✅ |
| Keyboard-first | ✅ | partial | ❌ |
| Pure Canvas 2D | ✅ | ✅ | SVG |
| "Workspace" concept | ❌ | creeping in | all in |
| Works offline | ✅ | mostly | yes |
| Handwritten style | ❌ (it's a feature) | ✅ | ❌ |
| Runs on a potato | ✅ | 🥔±🤔 | 🥔💀 |

---

## Getting started

```bash
npm install
npm run dev        # → http://localhost:5173
```

```bash
npm run build      # type-check + Vite bundle → dist/
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit tests
```

That's it. No `.env` file. No API keys. No Docker. No Kubernetes. No cloud account. No vibes check required.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `V` / `1` | Select tool |
| `R` / `2` | Rectangle |
| `E` / `3` | Ellipse |
| `L` / `4` | Line |
| `A` / `5` | Arrow |
| `P` / `6` | Pen (freehand) |
| `T` / `7` | Text |
| `G` | Toggle grid |
| `Esc` | Cancel / back to Select |
| `Delete` / `Backspace` | Delete selected elements |
| `Ctrl+A` | Select all |
| `Ctrl+Z` | Undo (use liberally) |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+scroll` | Zoom to cursor |
| `Scroll` | Pan |
| `Middle-click drag` / `Alt+drag` | Pan |
| `Shift` (while drawing) | Constrain proportions / snap angle |
| `Shift` (while resizing) | Lock aspect ratio |
| **Double-click** on text | Edit text in place |
| **Double-click** on rect / ellipse | Edit shape label |
| **Text tool** | `Enter` = commit · `Shift+Enter` = newline · `Esc` = cancel |

---

## Architecture

Markasso follows a **Redux-style unidirectional data flow** — no mutable state, no event spaghetti, no surprises.

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

- **All coordinates in CSS pixels.** The canvas buffer is `clientWidth × devicePixelRatio` for sharpness (`#141414` background), but all viewport `offsetX/Y`, element positions, and mouse events live in CSS pixel space. The renderer applies DPR via `ctx.setTransform(zoom*dpr, ...)`.
- **Immutable scene.** Every `Scene` object is never mutated. The reducer returns a new reference or the same reference if nothing changed (enabling cheap equality checks).
- **Ephemeral commands** (pan, zoom, select, tool change) are excluded from the undo stack.
- **`APPLY_STYLE`** is the single undoable command that updates both `appState` defaults and all currently selected elements in one atomic operation.

---

## Project structure

```
src/
├── core/
│   ├── scene.ts            # Scene interface + factory
│   ├── viewport.ts         # Pan/zoom math (screenToWorld, worldToScreen)
│   └── app_state.ts        # AppState (activeTool, colors, grid, …)
├── elements/
│   └── element.ts          # Discriminated union for all element types
├── commands/
│   └── commands.ts         # Full Command discriminated union
├── engine/
│   ├── reducer.ts          # Pure (Scene, Command) → Scene
│   └── history.ts          # Undo/redo stack + pub/sub
├── rendering/
│   ├── renderer.ts         # rAF render loop entry point
│   ├── draw_element.ts     # Per-type draw dispatch (with rotation + shape labels)
│   ├── draw_grid.ts        # Dot / line / mm graph-paper grids
│   ├── draw_selection.ts   # Selection box, resize/rotation/endpoint handles + hit testing
│   └── export.ts           # exportPNG / exportSVG (bounding-box auto-fit)
├── tools/
│   ├── tool.ts             # Tool interface
│   ├── select_tool.ts      # Hit test, marquee, drag-move, resize
│   ├── rectangle_tool.ts
│   ├── ellipse_tool.ts
│   ├── line_tool.ts
│   ├── arrow_tool.ts
│   ├── pen_tool.ts         # Freehand with Catmull-Rom smoothing
│   └── text_tool.ts        # Invisible overlay textarea + in-place editing
└── ui/
    ├── canvas_view.ts       # DOM event hub → world coords → tool
    ├── toolbar.ts           # Floating islands: tools · undo/zoom · export · settings
    ├── properties_panel.ts  # Floating left-side panel (selection-aware)
    ├── settings.ts          # Hamburger panel: grid, accent color, version
    └── shortcuts.ts         # Global keyboard map (letters + numeric 1–7)
```

No `node_modules` carrying the weight of a small nation. No 400MB `vendor.js`. The whole thing fits in your brain.

---

## Grid modes

| Mode | Description |
|---|---|
| **Dot** | Subtle dots at configurable world-unit spacing |
| **Line** | Horizontal + vertical lines |
| **mm** | Three-tier graph paper (1 mm / 5 mm / 10 mm) at physical scale assuming 96 DPI — for the diagrammers who also own a ruler |

---

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript 5 | Exhaustive `switch` on discriminated unions catches unhandled commands at compile time |
| Build | Vite | Zero-config, instant HMR, single-file output |
| Rendering | Canvas 2D API | A virtual DOM fights a custom scene graph — canvas wins for direct pixel control |
| Testing | Vitest | Runs in Node, no browser needed for pure reducer/viewport math |
| Dependencies | **none** | `crypto.randomUUID()`, `requestAnimationFrame`, `ResizeObserver` — all native |

---

## Contributing

See [CONTRIBUTORS.md](./CONTRIBUTORS.md) for guidelines.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

## License

MIT — © 2026 Alberto Barrago

_Draw things. Ship things. Touch grass._
