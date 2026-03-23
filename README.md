<div align="center">

<img src="public/markasso-logo-icon.svg" width="128" height="128" alt="Markasso logo" />

<h1>MARKASSO</h1>

<p>A fast, minimal, keyboard-first whiteboard that runs entirely in the browser.<br/><em>Marker + Picasso. Zero dependencies. Zero excuses.</em></p>

<a href="https://albertobarrago.github.io/Markasso/">
  <img src="https://img.shields.io/badge/▶_Try_it_live-Markasso-c42020?style=for-the-badge" alt="Live Demo" />
</a>

<br/><br/>

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.x-646cff?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested-Vitest-6e9f18?logo=vitest&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

<br/>

[User Manual](./MANUAL.md) · [Contributing](./CONTRIBUTORS.md) · [Report an Issue](https://github.com/AlbertoBarrago/Markasso/issues)

</div>

---

## Overview

Markasso is a fast, minimal, keyboard-first whiteboard engine that runs entirely in the browser.

Built with vanilla TypeScript and the Canvas 2D API — no framework dependencies. Just you, a canvas, and JavaScript doing exactly what it was invented to do.

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
| Hand | `H` / `Space` |
| Select | `V` / `1` |
| Rectangle | `R` / `2` |
| Ellipse | `E` / `3` |
| Line | `L` / `4` |
| Arrow | `A` / `5` |
| Pen (freehand) | `P` / `6` |
| Text | `T` / `7` |
| Eraser | `0` |

### Canvas & Navigation

| Feature | Description |
|---|---|
| **Infinite canvas** | Pan with middle-click or `Alt+drag`; zoom with `Ctrl+scroll` |
| **Millimeter grid** | Dot · Line · Graph-paper modes (real mm at 96 DPI) |
| **Navigation recovery** | `F` fits all content into view · `Shift+0` resets to origin |
| **Dark / Light theme** | Switchable themes with system preference support |

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
| **Smart arrow links** | Connect arrows to shapes — arrows attach to the border (not center), facing each other |
| **Hover preview** | Hover to preview connection points before drawing |
| **Cascade delete** | Deleting a shape removes all connected arrows and lines |

### Groups & Labels

| Feature | Description |
|---|---|
| **Groups** | `Ctrl+G` to group · click selects all members · click again enters group for individual editing |
| **Shape labels** | Double-click any rectangle or ellipse to type a label, clipped inside the shape |
| **Arrow labels** | Add labels to arrow elements |
| **Text scaling** | Dragging a text handle scales the font size, not just the box |
| **Double-click to edit** | Open any existing text element for inline editing |

### Constraints & Precision

| Feature | Description |
|---|---|
| **Shift constraints** | Rectangle/Ellipse → square/circle · Line/Arrow → 45° snap · Resize → keep aspect ratio |
| **Hover highlight** | Elements highlight on hover — always know what you're about to select |
| **Eraser hover** | Elements highlight as you drag the eraser over them |

### UI & Interface

| Feature | Description |
|---|---|
| **Floating glass UI** | Excalidraw-style islands: lock · hand · tools · eraser, top-right import + export; mobile gets a compact bottom-right action bar |
| **Properties panel** | Stroke color, fill color, stroke width, stroke style, opacity, roughness, rounded corners; font size + family for text |
| **Tool lock** | Lock button keeps the active drawing tool after placing a shape instead of reverting to Select |
| **Panel toggle** | `\` (backslash) shows/hides all UI panels for a distraction-free canvas |
| **Keyboard navigation** | Full Tab-based keyboard navigation through all panels |
| **About modal** | Info panel with version, links, and credits |

### Persistence & Export

| Feature | Description |
|---|---|
| **Session persistence** | Auto-saved to `localStorage` — your work survives page refreshes |
| **`.markasso` format** | Save and reload your full scene as a `.markasso` file (JSON) — images included |
| **Image import** | Drag-and-drop, file picker, or `Ctrl+V` paste; `.markasso` files can also be dropped directly |
| **Export PNG / SVG** | Download the canvas as a 2× PNG or a clean SVG — bounding-box auto-fit |

### History & Undo

| Feature | Description |
|---|---|
| **Undo / Redo** | Full command history with `Ctrl+Z` / `Ctrl+Y` or `Ctrl+Shift+Z` |

### Performance

| Feature | Description |
|---|---|
| **Zero dependencies** | Browser Canvas 2D API only — no React, no framework, no bundled megabytes |

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

### Install

```bash
pnpm install
```

### Develop

```bash
pnpm dev        # Start dev server at http://localhost:5173
```

### Build & Test

```bash
pnpm build      # Type-check and bundle → dist/
pnpm typecheck  # TypeScript validation
pnpm test       # Run Vitest unit tests
```

No `.env` files. No API keys. No containerization required.

---

## Keyboard Shortcuts

### Tools

| Key | Action |
|---|---|
| `H` / `Space` | Hand (pan) |
| `V` / `1` | Select |
| `R` / `2` | Rectangle |
| `E` / `3` | Ellipse |
| `L` / `4` | Line |
| `A` / `5` | Arrow |
| `P` / `6` | Pen (freehand) |
| `T` / `7` | Text |
| `0` | Eraser |

### Navigation

| Key | Action |
|---|---|
| `G` | Toggle grid |
| `F` | Fit all content into view |
| `Shift+0` | Reset viewport to origin |
| `\` | Toggle all UI panels |
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
| **Text tool** | Click to place · drag to define area · `Enter` = commit · `Shift+Enter` = newline · `Esc` = cancel |

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

### Key Invariants

- **All coordinates in CSS pixels.** The canvas buffer is `clientWidth × devicePixelRatio` for sharpness, but all viewport `offsetX/Y`, element positions, and mouse events live in CSS pixel space.
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
    ├── eraser_tool.ts       # Eraser: hit-test + delete on drag, sword-slash trail effect
    └── shortcuts.ts         # Global keyboard map (letters + numeric 1–7, 0 for eraser)
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
| Testing | Vitest | Runs in Node — no browser needed for reducer/viewport math |
| Dependencies | None | `crypto.randomUUID()`, `requestAnimationFrame`, `ResizeObserver` — all native |

---

## Changelog

### v2.11.x
- **About modal** — info panel with version, credits and links
- **Accessibility** — full Tab-based keyboard navigation through all panels; focus management fixes for Safari and mobile
- **Light theme polish** — improved contrast and visual refinements
- **Safari mobile** — pen tool and touch event fixes
- **Mobile menu** — spacing and layout improvements

### v2.10.0
- **Panel toggle** — `\` (backslash) shows/hides all UI panels for a distraction-free canvas
- **Arrow labels** — add labels to arrow elements
- **Pen tool flow** — pen tool stays active after drawing instead of reverting to Select
- **Text tool** — background fill for text elements; single-click placement improvements
- **Eraser hover** — elements highlight as the eraser passes over them
- **Smoother lines** — stroke definition improvements for freehand paths

### v2.9.0
- **Theme** — Added theme light, dark and system on settings menu

### v2.8.0
- **Brand logo** — Markasso logo icon added to the welcome screen, thanks to https://github.com/lc-d.

### v2.7.0
- **Multi-language i18n** — UI fully localised in 8 languages: Italiano, English, Español, Français, Deutsch, Português, 中文, 日本語; language persists in `localStorage` and is selectable from the hamburger menu

### v2.6.2
- **Tool panel auto-open** — selecting a drawing tool on desktop automatically opens the properties panel showing relevant options for that tool; hand, select and eraser leave it closed
- **Context-aware panel sections** — each tool shows only its relevant controls: rectangle shows fill + borders; line/arrow hide fill; freehand hides style + roughness; text shows its own section
- **Layer order in tool panel** — layer reorder buttons (front/back/forward/backward) are now visible in the tool panel, not only when using the Select tool
- **Text tool: code mode** — toggle between Text and Code mode in the panel; code mode creates auto-sized monospace blocks with dark background, Tab indentation, Shift+Enter to commit
- **Text tool: alignment** — left / center / right alignment buttons in the text panel; alignment is stored per-element and applied in the renderer
- **Text tool: auto-size on click** — single click no longer creates a fixed 240 px box; the textarea expands with the text and the element dimensions match the content width exactly

### v2.6.0
- **Picasso theme** — UI palette inspired by Picasso's *Le Rêve* (1932): crimson `#c42020` accent, warm near-black island backgrounds, warm off-white text
- **Favicon** — custom logo added as browser tab icon
- **Welcome screen** — first-visit overlay with the Markasso wordmark, a browser-storage reminder, and key shortcuts; auto-dismisses when the user draws the first element

### v2.5.0
- **Mobile action bar** — compact bottom-right island always visible on touch devices: undo/redo always shown; duplicate and delete appear when an element is selected
- **Mobile style sheet** — bottom sheet with all style controls; closes on outside tap
- **Mobile layout cleanup** — desktop context panel suppressed on touch; proper viewport sizing

### v2.4.x
- **Eraser tool** (`0`) with sword-slash trail effect
- **Tool lock button** — keep active drawing tool after placing a shape
- **Rounded corners** — rectangle corner radius toggle (Sharp / Rounded)
- **Groups** — `Ctrl+G` with nested group editing support
- **Smart arrow links** — border attachment, hover preview, cascade delete
- **Auto-select after drawing** — new element is selected and properties panel opens automatically
- **Pen tool** — Catmull-Rom smoothing, real-time jitter filtering, cubic Bézier rendering

---

## Contributing

See [CONTRIBUTORS.md](./CONTRIBUTORS.md) for guidelines.

## License

MIT — © 2026 Alberto Barrago

_Draw things. Ship things. Touch grass._
