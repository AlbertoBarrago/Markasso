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
| **Smart arrow links** | Connect arrows to shapes — arrows attach to the border (not center), facing each other. Hover to preview the connection point before drawing |
| **Lock elements** | Lock any element to prevent selection, movement or deletion |
| **Groups** | `Ctrl+G` to group · click selects all members · click again enters the group to edit individually |
| **Shape labels** | Double-click any rectangle or ellipse to type a label, clipped inside the shape |
| **Text scaling** | Dragging a text handle scales the font size, not just the box |
| **Shift constraints** | Rectangle/Ellipse → square/circle · Line/Arrow → 45° snap · Resize → keep aspect ratio |
| **Hover highlight** | Elements highlight on hover — you always know what you are about to select |
| **Shift+click multi-select** | Add or remove elements from the selection without a marquee |
| **Arrow key nudge** | Move selected elements 1px (or 10px with Shift) |
| **Double-click to edit** | Open any existing text element for inline editing |
| **Navigation recovery** | `F` fits all content into view · `Shift+0` resets to origin |
| **Floating glass UI** | Excalidraw-style islands: center-top tools, bottom-left undo/zoom, top-right import + export |
| **Session persistence** | Your work survives page refreshes — scene auto-saved to `localStorage` |
| **`.markasso` format** | Save and reload your full scene as a `.markasso` file (JSON) — images included |
| **Image import** | Drag-and-drop, file picker, or Ctrl+V paste; `.markasso` files can also be dropped directly |
| **Export PNG / SVG** | Download the canvas as a 2× PNG or a clean SVG — bounding-box auto-fit |
| **Dark theme** | Pure `#141414` canvas with floating panels and `backdrop-filter: blur` |
| **Millimeter grid** | Dot · Line · Graph-paper (real mm at 96 DPI) for when you need to feel precise |
| **Properties panel** | Stroke color, fill color, stroke width, opacity, roughness, font |
| **Undo / Redo** | Full command history. Make mistakes confidently. |
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
| `F` | Fit all content into view |
| `Shift+0` | Reset viewport to origin (zoom 100%, offset 0,0) |
| `Esc` | Cancel / back to Select / exit group / deselect |
| `Delete` / `Backspace` | Delete selected elements (locked elements skipped) |
| `Arrow keys` | Nudge selection 1px |
| `Shift+Arrow` | Nudge selection 10px |
| `Ctrl+A` | Select all |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+G` | Group selected elements |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+Shift+]` | Bring to front |
| `Ctrl+Shift+[` | Send to back |
| `Ctrl+Z` | Undo (use liberally) |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Shift+click` | Add / remove from selection |
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
- **Ephemeral commands** (pan, zoom, set-viewport, select, tool change) are excluded from the undo stack.
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
├── io/
│   ├── markasso.ts         # .markasso save / load (exportMarkasso, importMarkasso)
│   └── session.ts          # localStorage auto-save / restore + quota warning toast
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
    ├── toolbar.ts           # Floating islands: tools · undo/zoom · import · export · settings
    ├── properties_panel.ts  # Floating panel, anchored next to the context panel
    ├── context_panel.ts     # Left-side action panel (layer order, style, import image)
    ├── image_import.ts      # File picker, drag-and-drop, paste — images + .markasso
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

## What's new in 2.3.2

- **Border-point snap fix** — corrected an edge case where the arrow/line endpoint did not snap to the exact border attachment point when connecting shapes

## What's new in 2.3.0

- **Border attachment** — smart links now attach to the element border (facing the other shape), not the center; live connections update dynamically as shapes move
- **Perimeter snap** — arrow/line tools activate the magnetic snap when near the element's edge (not just within 20px of the center); works for both drawing and endpoint dragging
- **Hover preview** — hovering over a shape with the arrow or line tool shows a highlight and snap indicator on the border before you start drawing
- **Group entry fix** — clicking an element inside a group for the second time now correctly selects that single element, even after Ctrl+A + Ctrl+G
- **Pen tool flow** — the pen tool stays active after drawing a stroke; no auto-selection interrupts drawing sessions

## What's new in 2.2.0

- **Smart arrow links** — drag an arrow endpoint near any shape to connect it; the arrow follows the shape as it moves
- **Lock elements** — lock/unlock via the context toolbar; locked elements stay visible but can't be touched
- **Groups** — `Ctrl+G` groups elements; click to select the whole group, click again to enter and edit individual members; `Escape` exits the group
- **Hover highlight** — a soft glow around elements on hover before clicking
- **Shift+click multi-select** — add or remove elements without drawing a marquee
- **Arrow key nudge** — move selection 1px (10px with Shift) for pixel-perfect layout
- **Duplicate** — `Ctrl+D` clones the selection with a 20px offset
- **Pen tool smoothing** — strokes are filtered and simplified on release, no more jagged lines from hand tremor

## What's new in 2.1.5

- **`.markasso` format** — save and reload your full scene (elements + viewport, images included) as a portable JSON file
- **Open .markasso** — folder button in the toolbar to load a saved scene; drag & drop onto the canvas also works
- **Session persistence** — your work survives page refreshes automatically via `localStorage`; quota warning toast if storage fills up
- **Properties panel** now opens next to the context panel instead of on the opposite side of the screen
- **Default font** changed to `Arial, sans-serif`

---

## Contributing

See [CONTRIBUTORS.md](./CONTRIBUTORS.md) for guidelines.

## License

MIT — © 2026 Alberto Barrago

_Draw things. Ship things. Touch grass._
