# Markasso

> **Marker + Picasso. Zero dependencies. Zero excuses.**

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.x-646cff?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested-Vitest-6e9f18?logo=vitest&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Overview

Markasso is a fast, minimal, keyboard-first whiteboard engine that runs entirely in the browser.

Built with vanilla TypeScript and the Canvas 2D API—no framework dependencies. Just you, a canvas, and JavaScript doing exactly what it was invented to do.

While Excalidraw excels at freehand sketching and Draw.io offers comprehensive diagramming, **Markasso occupies a different niche**: smaller, faster, and requiring no sign-in, cookies, or workspace creation.

---

## Motivation

Markasso was born from a simple frustration: wanting to sketch a quick diagram shouldn't require:

1. Waiting for a heavy application to load
2. Dismissing cookie consent banners
3. Creating an account for "free" features
4. Risking lost work due to forgotten exports

**Markasso is the alternative.** Open, draw, export, done.

---

## Features

### Drawing Tools

| Tool | Shortcut |
|---|---|
| Select | `V` / `1` |
| Rectangle | `R` / `2` |
| Ellipse | `E` / `3` |
| Line | `L` / `4` |
| Arrow | `A` / `5` |
| Pen (freehand) | `P` / `6` |
| Text | `T` / `7` |

### Canvas & Navigation

| Feature | Description |
|---|---|
| **Infinite canvas** | Pan with middle-click or `Alt+drag`; zoom with `Ctrl+scroll` |
| **Millimeter grid** | Dot · Line · Graph-paper modes (real mm at 96 DPI) |
| **Navigation recovery** | `F` fits all content into view · `Shift+0` resets to origin |
| **Dark theme** | Pure `#141414` canvas with floating panels and `backdrop-filter: blur` |

### Selection & Manipulation

| Feature | Description |
|---|---|
| **Resize handles** | 8-handle bounding box on every element type |
| **Rotation** | Rotate any element via a handle above the selection box (fully undoable) |
| **Endpoint editing** | Drag individual endpoints of lines and arrows independently |
| **Shift+click multi-select** | Add or remove elements from selection without a marquee |
| **Arrow key nudge** | Move selected elements 1px (or 10px with `Shift`) |
| **Lock elements** | Lock any element to prevent selection, movement, or deletion |

### Smart Connections

| Feature | Description |
|---|---|
| **Smart arrow links** | Connect arrows to shapes—arrows attach to the border (not center), facing each other |
| **Hover preview** | Hover to preview connection points before drawing |
| **Cascade delete** | Deleting a shape removes all connected arrows and lines |

### Groups & Labels

| Feature | Description |
|---|---|
| **Groups** | `Ctrl+G` to group · click selects all members · click again enters group for individual editing |
| **Shape labels** | Double-click any rectangle or ellipse to type a label, clipped inside the shape |
| **Text scaling** | Dragging a text handle scales the font size, not just the box |
| **Double-click to edit** | Open any existing text element for inline editing |

### Constraints & Precision

| Feature | Description |
|---|---|
| **Shift constraints** | Rectangle/Ellipse → square/circle · Line/Arrow → 45° snap · Resize → keep aspect ratio |
| **Hover highlight** | Elements highlight on hover—always know what you're about to select |

### UI & Interface

| Feature | Description |
|---|---|
| **Floating glass UI** | Excalidraw-style islands: center-top tools, bottom-left undo/zoom, top-right import + export |
| **Properties panel** | Stroke color, fill color, stroke width, opacity, roughness, font |
| **Keyboard shortcuts** | Letter keys + numeric keys `1–7` for every tool |

### Persistence & Export

| Feature | Description |
|---|---|
| **Session persistence** | Auto-saved to `localStorage`—your work survives page refreshes |
| **`.markasso` format** | Save and reload your full scene as a `.markasso` file (JSON)—images included |
| **Image import** | Drag-and-drop, file picker, or `Ctrl+V` paste; `.markasso` files can also be dropped directly |
| **Export PNG / SVG** | Download the canvas as a 2× PNG or a clean SVG—bounding-box auto-fit |

### History & Undo

| Feature | Description |
|---|---|
| **Undo / Redo** | Full command history with `Ctrl+Z` / `Ctrl+Y` or `Ctrl+Shift+Z` |

### Performance

| Feature | Description |
|---|---|
| **Zero dependencies** | Browser Canvas 2D API only |

---

## Comparison

| Feature | Markasso | Excalidraw | Draw.io |
|---|:---:|:---:|:---:|
| Zero dependencies | ✅ | ❌ | ❌ |
| No login required | ✅ | ✅ | ✅ |
| Cookie banners | None | Varies | Yes |
| Bundle size | Minimal | Moderate | Large |
| Infinite canvas | ✅ | ✅ | ✅ |
| Keyboard-first design | ✅ | Partial | ❌ |
| Pure Canvas 2D | ✅ | ✅ | SVG-based |
| Offline support | ✅ | ✅ | ✅ |
| Handwritten style | ❌ | ✅ | ❌ |

---

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev        # Start dev server at http://localhost:5173
```

### Build & Test

```bash
npm run build      # Type-check and bundle → dist/
npm run typecheck  # TypeScript validation
npm test           # Run Vitest unit tests
```

No `.env` files. No API keys. No containerization required.

---

## Keyboard Shortcuts

### Tools

| Key | Action |
|---|---|
| `V` / `1` | Select tool |
| `R` / `2` | Rectangle |
| `E` / `3` | Ellipse |
| `L` / `4` | Line |
| `A` / `5` | Arrow |
| `P` / `6` | Pen (freehand) |
| `T` / `7` | Text |

### Navigation

| Key | Action |
|---|---|
| `G` | Toggle grid |
| `F` | Fit all content into view |
| `Shift+0` | Reset viewport to origin |
| `Scroll` | Pan |
| `Middle-click drag` / `Alt+drag` | Pan |
| `Ctrl+scroll` | Zoom to cursor |

### Editing

| Key | Action |
|---|---|
| `Esc` | Cancel / exit group / deselect |
| `Delete` / `Backspace` | Delete selected elements |
| `Arrow keys` | Nudge selection 1px |
| `Shift+Arrow` | Nudge selection 10px |
| `Ctrl+A` | Select all |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+G` | Group selected elements |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+Shift+]` | Bring to front |
| `Ctrl+Shift+[` | Send to back |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Shift+click` | Add / remove from selection |

### Modifiers

| Key | Action |
|---|---|
| `Shift` (while drawing) | Constrain proportions / snap angle |
| `Shift` (while resizing) | Lock aspect ratio |
| **Double-click** on text | Edit text in place |
| **Double-click** on rect / ellipse | Edit shape label |
| **Text tool** | `Enter` = commit · `Shift+Enter` = newline · `Esc` = cancel |

---

## Architecture

Markasso follows a **Redux-style unidirectional data flow**—no mutable state, no event spaghetti, no surprises.

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

### Key Invariants

- **All coordinates in CSS pixels.** The canvas buffer is `clientWidth × devicePixelRatio` for sharpness (`#141414` background), but all viewport `offsetX/Y`, element positions, and mouse events live in CSS pixel space. The renderer applies DPR via `ctx.setTransform(zoom*dpr, ...)`.
- **Immutable scene.** Every `Scene` object is never mutated. The reducer returns a new reference or the same reference if nothing changed (enabling cheap equality checks).
- **Ephemeral commands** (pan, zoom, set-viewport, select, tool change) are excluded from the undo stack.
- **`APPLY_STYLE`** is the single undoable command that updates both `appState` defaults and all currently selected elements in one atomic operation.

---

## Project Structure

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

---

## Grid Modes

| Mode | Description |
|---|---|
| **Dot** | Subtle dots at configurable world-unit spacing |
| **Line** | Horizontal + vertical lines |
| **mm** | Three-tier graph paper (1 mm / 5 mm / 10 mm) at physical scale assuming 96 DPI |

---

## Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5 | Exhaustive `switch` on discriminated unions catches unhandled commands at compile time |
| Build | Vite | Zero-config, instant HMR, single-file output |
| Rendering | Canvas 2D API | Direct pixel control without virtual DOM overhead |
| Testing | Vitest | Runs in Node—no browser needed for reducer/viewport math |
| Dependencies | None | `crypto.randomUUID()`, `requestAnimationFrame`, `ResizeObserver` — all native |

---

## Changelog

### v2.4.3
- **Text tool auto-resets** — after confirming a text element the tool returns to Select automatically

### v2.4.2
- **Lock icon fixed** — the padlock icon now shows the current state (closed = locked, open = unlocked)
- **Select locked elements** — locked elements can now be click-selected; they still cannot be moved, resized, or deleted

### v2.4.1
- **Arrow tool auto-resets** — after drawing a linked arrow the tool returns to Select automatically
- **Cascade delete** — deleting a shape now removes all arrows and lines connected to it

### v2.4.0
- **Smoother pen curves** — real-time exponential smoothing filters trackpad jitter
- **Improved curve rendering** — cubic Bézier curves with Catmull-Rom splines
- **High-quality anti-aliasing** — canvas smoothing enabled for crisp curves at any zoom level
- **Finer point capture** — reduced from 3px to 2px threshold for more detailed strokes
- **Cleaner default stroke** — 1px width with round line caps and joins

### v2.3.2
- **Border-point snap fix** — corrected edge case where arrow/line endpoints did not snap to exact border attachment points

### v2.3.0
- **Border attachment** — smart links attach to element borders (facing the other shape), not the center
- **Perimeter snap** — arrow/line tools activate magnetic snap near element edges
- **Hover preview** — connection point preview when hovering over shapes
- **Group entry fix** — clicking an element inside a group correctly selects that individual element
- **Pen tool flow** — pen tool stays active after drawing a stroke

### v2.2.0
- **Smart arrow links** — drag arrow endpoints near shapes to connect them
- **Lock elements** — lock/unlock via the context toolbar
- **Groups** — `Ctrl+G` to group elements with nested editing support
- **Hover highlight** — soft glow around elements on hover
- **Shift+click multi-select** — add or remove elements without a marquee
- **Arrow key nudge** — move selection 1px (10px with Shift)
- **Duplicate** — `Ctrl+D` clones selection with 20px offset
- **Pen tool smoothing** — strokes filtered and simplified on release

### v2.1.5
- **`.markasso` format** — save and reload full scenes as portable JSON files
- **Open .markasso** — toolbar button and drag & drop support for loading saved scenes
- **Session persistence** — auto-save to `localStorage` with quota warnings
- **Properties panel** — now opens adjacent to the context panel
- **Default font** — changed to `Arial, sans-serif`

---

## Contributing

See [CONTRIBUTORS.md](./CONTRIBUTORS.md) for guidelines.

## License

MIT — © 2026 Alberto Barrago

_Draw things. Ship things. Touch grass._
