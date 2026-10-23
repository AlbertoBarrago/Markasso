<div align="center">

<img src="public/markasso-logo-icon.svg" width="128" height="128" alt="Markasso logo" />

<h1>MARKASSO</h1>

<p>is a zero-latency, framework-agnostic whiteboard engine. Built with vanilla TypeScript and the Canvas 2D API, it delivers a high-performance drawing experience with a zero-dependency core and a keyboard-first workflow. It’s the "Vesper" of whiteboards: dark, fast, and focused.</p>

<a href="https://markasso.it">
  <img src="https://img.shields.io/badge/▶_Try_it_live-Markasso-c42020?style=for-the-badge" alt="Live Demo" />
</a>

<br/><br/>

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.x-646cff?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested-Vitest-6e9f18?logo=vitest&logoColor=white)
![Coverage](https://img.shields.io/badge/coverage-69%25-yellow)
![Status](https://img.shields.io/badge/status-stable-blue)
![Zero-dependency core](https://img.shields.io/badge/core%20dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

<br/>

[User Manual](./MANUAL.md) · [Guide](./GUIDA.md) · [MCP for AI agents](./mcp/README.md) · [Contributing](./CONTRIBUTORS.md) · [Report an Issue](https://github.com/AlbertoBarrago/Markasso/issues)

</div>

---

## Draw with AI agents (MCP)

Markasso ships an [MCP](https://modelcontextprotocol.io) server: Claude, Codex, Gemini and local models (e.g. Gemma in LM Studio) can create, read and edit diagrams, and even draw live on a shared board.

**1. Connect your agent** (Node 22+):

```bash
# Claude Code
claude mcp add markasso -- npx -y @markasso/mcp@latest

# Codex CLI
codex mcp add markasso -- npx -y @markasso/mcp@latest
```

Claude Desktop, Gemini CLI and LM Studio use the same `npx -y @markasso/mcp@latest` command in their `mcpServers` config: see [`mcp/README.md`](mcp/README.md) for every client, the tool list, building from source and the security notes.

**2. Ask for a diagram**, for example: *"Draw the architecture of a checkout service with icons, lay it out left to right and give me a share link"*. For live mode, open **Share → Share live session** in Markasso and ask the agent to join that link.

---

## Project Status

Markasso is **feature-complete**. Active development of new features is paused. The tool does what it was designed to do. Bug fixes, performance improvements, and small refinements are welcome. Large feature PRs are unlikely to be merged; open an issue first to discuss.

---

## Overview

Markasso is a fast, minimal, keyboard-first whiteboard engine that runs entirely in the browser.

Built with vanilla TypeScript and the Canvas 2D API, no framework dependencies. Just you, a canvas, and JavaScript doing exactly what it was invented to do.

This repository is the source of truth for the production deployment.

While Excalidraw excels at freehand sketching and Draw.io offers comprehensive diagramming, **Markasso occupies a different niche**: smaller, faster, and requiring no sign-in, cookies, or workspace creation.

---

## Motivation

Markasso started as a game. I wanted to stay sharp with LLMs, actually use them, not just read about them. So I picked a project small enough to finish and complex enough to be honest: a whiteboard from scratch, vanilla TypeScript, zero dependencies.

It didn't stay small.

### Don't reinvent every wheel

The core (scene, reducer, renderer, tools) stays dependency-free, and that is not going to change. But some features are a whole discipline of their own. Mermaid import is the case in point: we wrote our own parser and layout engine, and it worked, sort of. Then every real-world diagram found a new way to break it.

So we stopped. Mermaid import now runs on [`@excalidraw/mermaid-to-excalidraw`](https://github.com/excalidraw/mermaid-to-excalidraw), built on the official `mermaid` engine by people who have already spent far more hours (and far more swearing) on it than we ever will. It is loaded lazily on first use, so the initial bundle stays exactly as light as before.

The rule going forward: zero dependencies in the core; a dependency is fine for an isolated, lazy-loaded feature when building it ourselves would mean re-solving someone else's solved problem, worse.

Colleagues started using it. Then people I work with remotely. Then people I've never met. What was a personal experiment to keep up with the tools of the moment became something a real team depends on to sketch ideas, run retrospectives, and think out loud together.

That surprised me. And it's the only reason this repository exists in its current form rather than sitting half-finished in a private repo somewhere.

---

## Features

### Drawing Tools

| Tool | Shortcut |
|---|---|
| Hand | `H` / `Space` |
| Select | `V` / `1` |
| Rectangle | `R` / `2` |
| Rhombus (Diamond) | `D` / `3` |
| Ellipse | `E` / `4` |
| Line + arrowheads | `A` / `L` / `5` |
| Pen (freehand) | `P` / `6` |
| Text | `T` / `7` |
| Sticky note | `N` |
| Flowchart shape | `S` |
| Library (shapes & icons) | `I` |
| Eraser | `0` |

Curves are made by dragging the midpoint handle of a line after placement — there is no separate curve tool.

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
| **Connection ports** | Drop an end on a top/right/bottom/left port to pin it there through moves, resizes and rotations |
| **Elbow routing** | Orthogonal connectors recomputed from their ends, with clean mid-side attachments |
| **Arrowhead styles** | Per end: open, hollow/filled triangle, hollow/filled diamond, circle (UML-ready) |

### Diagrams & Icon Libraries

| Feature | Description |
|---|---|
| **Library sidebar** | `I` opens a searchable sidebar (modeled on Excalidraw's library): click to insert at the center of the view, drag onto the canvas to drop it, recently used items first |
| **Flowchart shapes** | Start/end, data (I/O), document, database, predefined process, preparation, manual input, delay; drawn with `S` or inserted from the Library; connectors snap to their real outline |
| **Generic icons** | 20 architecture icons (server, database, queue, load balancer, firewall, API, container, user, ...) that follow stroke/fill colors, theme and rough mode, with a label below |
| **Kubernetes icons** | The official Kubernetes icon set (39 icons, Apache-2.0), loaded on demand as a separate chunk |
| **Vendor icon packs** | Import the official ZIP of [AWS](https://aws.amazon.com/architecture/icons/), [Azure](https://learn.microsoft.com/azure/architecture/icons/) or [Google Cloud](https://cloud.google.com/icons) icons: read in the browser, grouped by the vendor's categories, stored only locally |

Cloud vendors allow their icons in diagrams but not their redistribution in tools, so Markasso does not ship them: you download the official pack and import it. Only the icons you place travel with the diagram, and vendor icons are never recolored or rotated, as their terms require. Bundled third-party material is listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).


### Groups & Labels

| Feature | Description |
|---|---|
| **Groups** | `Ctrl+G` to group · click selects all members · click again enters group for individual editing |
| **Shape labels** | Double-click any rectangle or ellipse to type a label, clipped inside the shape |
| **Connector labels** | Add labels to lines with arrowheads and keep the gap aligned to the bezier bend |
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
| **Properties panel** | Stroke color, fill color, stroke width, stroke style, linecap icons, opacity, roughness, shadow, rounded corners; font size + family + bold/italic/underline/strikethrough for text |
| **Tool lock** | Lock button keeps the active drawing tool after placing a shape instead of reverting to Select |
| **Panel toggle** | `\` (backslash) shows/hides all UI panels for a distraction-free canvas |
| **Command palette** | `Ctrl+K` — fuzzy-search and run any action without touching the mouse |
| **Element search** | `Ctrl+F` — search elements by label/content, click to pan and select |
| **Minimap** | Collapsible canvas overview; click or drag to pan the viewport |
| **Share link** | Encode the full scene into a URL hash for instant one-click sharing |
| **Keyboard navigation** | Full Tab-based keyboard navigation through all panels |
| **Version display** | Current version shown inline in the menu |

### Realtime Collaboration

| Feature | Description |
|---|---|
| **Live sessions** | "Share live session" creates a `?live=roomId` link; anyone who opens it joins the same infinite canvas and edits in real time over WebSocket |
| **Instant sync** | Commands are relayed through a Cloudflare Durable Object in server order, so every peer converges to the same scene (LWW on concurrent same-element edits) |
| **Seeding** | Sharing a session publishes your current board into the room, so invitees arrive with it already populated |
| **Remote cursors** | Other participants' cursors + name tags render live on the canvas; your own name is remembered after the first set |
| **Shared undo** | `Ctrl+Z`/`Ctrl+Y` propagate to all collaborators in global order (each peer keeps its own viewport/selection/tool) |
| **Per-peer views** | Pan, zoom, selection and tool choice stay local — everyone pans and selects independently |
| **Room safety** | Max 20 peers/room, per-peer command rate limit, and a max message-size guard to protect the room |

### AI Agents (MCP)

| Feature | Description |
|---|---|
| **MCP server** | `mcp/` ships an [MCP](https://modelcontextprotocol.io) server so Claude, Codex, Gemini and local models (e.g. Gemma in LM Studio) can create, read and edit Markasso diagrams. Setup and tools: [`mcp/README.md`](mcp/README.md) |
| **Document mode** | Agents add nodes (shapes, flowchart symbols, icons) and connections by short keys, auto-arrange them in layers, then save `.markasso`, export SVG or publish a share link |
| **Live mode** | An agent joins a live session from its `?live=` link and draws on the shared board in real time: people see it in the room and follow its cursor, and the agent reads what they drew |
| **Same engine** | Every change goes through Markasso's own reducer and validation, so agent diagrams are identical to hand-made ones and undo works |

### Persistence & Export

| Feature | Description |
|---|---|
| **Session persistence** | Auto-saved to `localStorage` — your work survives page refreshes |
| **`.markasso` format** | Save and reload your full scene as a `.markasso` file (JSON) — images included |
| **Image import** | Drag-and-drop, file picker, or `Ctrl+V` paste; `.markasso` files can also be dropped directly |
| **Mermaid import** | Import `.mmd` / `.mermaid` files via drag-and-drop or the toolbar button, or paste Mermaid text from the clipboard. Flowcharts (with subgraphs), sequence, class, state and ER diagrams become native, editable elements; every other Mermaid type (gantt, pie, gitGraph, mindmap, ...) is inserted as an SVG image |
| **Export PNG / SVG / HTML** | Download as 2× PNG, clean SVG, or standalone HTML — all respect the current canvas background color |
| **Share link** | One-click URL encoding of the full scene — no server, no account |

### History & Undo

| Feature | Description |
|---|---|
| **Undo / Redo** | Full command history with `Ctrl+Z` / `Ctrl+Y` or `Ctrl+Shift+Z` |

### Performance

| Feature | Description |
|---|---|
| **Zero-dependency core** | Browser Canvas 2D API only: no React, no framework, no bundled megabytes. The only runtime dependency (Mermaid) is lazy-loaded on first use |

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
pnpm mcp:build  # Build the MCP server → mcp/dist/markasso-mcp.js
```

No `.env` files. No API keys. No containerization required.

### Test Coverage

205 tests across 9 files. `pnpm coverage` runs the suite and updates this badge automatically. UI/rendering modules require a browser and are excluded from Node tests by design.

---

## Keyboard Shortcuts

### Tools

| Key | Action |
|---|---|
| `H` / `Space` | Hand (pan) |
| `V` / `1` | Select |
| `R` / `2` | Rectangle |
| `D` / `3` | Rhombus (Diamond) |
| `E` / `4` | Ellipse |
| `A` / `L` / `5` | Line + arrowheads |
| `P` / `6` | Pen (freehand) |
| `T` / `7` | Text |
| `N` | Sticky note |
| `S` | Flowchart shape |
| `I` | Library (shapes & icons) |
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

### Search & Commands

| Key | Action |
|---|---|
| `Ctrl+K` | Open command palette |
| `Ctrl+F` | Open element search |

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

Markasso follows a **Redux-style unidirectional data flow**: no mutable state, no event spaghetti, no surprises.

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

### Realtime Layer

On top of the local store, Markasso adds live collaboration via a Cloudflare Worker **Durable Object** (`SessionRoom` in `src/worker.ts`).

```
Client A ──┐
Client B ──┼── WebSocket /session/ws?room=<id> ──▶ SessionRoom DO
Client C ──┘                                           │ serializes commands
                                                       │ appends to room log (DO storage)
                                                       ▼
                                  broadcasts apply to all peers in server order
```

- The DO is the **single serialization point**: it appends each persistent command to the room's log and relays it to peers in arrival order, so replaying the deterministic `reducer` in the same order converges every client.
- **Ephemeral** view commands (pan/zoom/select/tool) and **cursors** are relayed live but never logged.
- **Seeding** publishes the creator's elements as `CREATE` commands into a fresh room (echo-suppressed by the server).
- Undo/redo are shared (model B); `History.applyRemote` applies network commands without touching the local undo stack or echoing them back.
- `realtime.ts` wires `History.onCommand` → WebSocket; `presence.ts` + `canvas_view.ts` render remote cursors. Limits: 20 peers/room, per-peer command rate limit, max message size.

---

## Project Structure

```
src/
├── core/
│   ├── scene.ts            # Scene interface + factory
│   ├── layout.ts           # Layered auto-layout (used by the MCP server)
│   ├── viewport.ts         # Pan/zoom math (screenToWorld, worldToScreen)
│   └── app_state.ts        # AppState (activeTool, colors, grid, …)
├── elements/
│   ├── element.ts          # Discriminated union for all element types
│   ├── shapes.ts           # Parametric outlines of the flowchart shapes
│   └── stencils/           # Icon element: generic icon set, registry, bundled packs loader
├── commands/
│   └── commands.ts         # Full Command discriminated union
├── engine/
│   ├── reducer.ts          # Pure (Scene, Command) → Scene
│   ├── history.ts          # Undo/redo stack + pub/sub
│   └── ephemeral.ts        # Ephemeral-command classifier (shared client + Worker)
├── io/
│   ├── markasso.ts         # .markasso save / load (exportMarkasso, importMarkasso)
│   ├── mermaid.ts          # Mermaid import: mermaid-to-excalidraw skeletons → Markasso elements
│   ├── session.ts          # localStorage auto-save / restore + quota warning toast
│   ├── share.ts            # URL-hash scene encoding / decoding for share links
│   ├── realtime.ts         # Live-session WebSocket client (join, broadcast, seeding, remote undo)
│   ├── presence.ts         # Remote cursor store + throttled local cursor sender
│   ├── zip_reader.ts       # Dependency-free ZIP reader on DecompressionStream
│   ├── icon_pack.ts        # Vendor icon ZIP → icon pack (names, categories, variants)
│   └── icon_pack_store.ts  # Imported packs in IndexedDB (browser only)
├── libraries/
│   └── kubernetes/         # Generated Kubernetes icon pack (lazy chunk) + upstream LICENSE
├── rendering/
│   ├── renderer.ts         # rAF render loop entry point
│   ├── draw_element.ts     # Per-type draw dispatch (with rotation + shape labels)
│   ├── draw_grid.ts        # Dot / line / mm graph-paper grids
│   ├── draw_selection.ts   # Selection box, handles, connector snapping, ports and routes
│   ├── connector_geometry.ts # Curves, elbow routing, arrowhead shapes
│   ├── shape_geometry.ts   # Border points and distances derived from shape outlines
│   └── export.ts           # exportPNG / exportSVG / exportHTML (bounding-box auto-fit)
├── tools/
│   ├── tool.ts             # Tool interface
│   ├── select_tool.ts      # Hit test, marquee, drag-move, resize
│   ├── rectangle_tool.ts
│   ├── ellipse_tool.ts
│   ├── rombo_tool.ts       # Rhombus tool
│   ├── line_tool.ts        # Line tool; arrowheads are a style on line elements
│   ├── shape_tool.ts       # Flowchart shape tool (S)
│   ├── pen_tool.ts         # Freehand with Catmull-Rom smoothing + stylus pressure
│   ├── text_tool.ts        # Invisible overlay textarea + in-place editing
│   └── sticky_tool.ts      # Sticky note with editable text and color picker
└── ui/
    ├── canvas_view.ts       # DOM event hub → world coords → tool
    ├── toolbar.ts           # Floating islands: tools · undo/zoom · import · export · share
    ├── context_panel.ts     # Properties panel (style, formatting, shadow, alignment)
    ├── command_palette.ts   # Ctrl+K fuzzy-search command launcher
    ├── element_search.ts    # Ctrl+F canvas element search overlay
    ├── minimap.ts           # Collapsible canvas overview + viewport panning
    ├── library_panel.ts     # Library sidebar: shapes, icons, packs, ZIP import
    ├── svg_sanitize.ts      # Sanitizer for imported vendor SVGs
    ├── image_import.ts      # File picker, drag-and-drop, paste — images + .markasso
    ├── settings.ts          # Hamburger panel: grid, accent color, theme, language
    ├── mobile_action_bar.ts # Compact bottom-right action bar for touch devices
    └── shortcuts.ts         # Global keyboard map

mcp/                         # MCP server for AI agents (separate pnpm package)
├── src/
│   ├── server.ts            # Tool definitions over stdio
│   ├── diagram.ts           # Agent-facing diagram API on top of History
│   ├── describe.ts          # Compact text description of a diagram
│   ├── storage.ts           # .markasso files and share links
│   └── live.ts              # Live-session peer (same protocol as the app)
└── README.md                # Setup for Claude, Codex, Gemini, LM Studio
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
| Realtime | Cloudflare Workers + Durable Objects | Free WebSocket hosting; one DO per room serializes commands; no extra npm deps |
| Dependencies | Core: none; Mermaid import: `@excalidraw/mermaid-to-excalidraw` | Core relies on native `crypto.randomUUID()`, `requestAnimationFrame`, `ResizeObserver`; Mermaid is a lazy-loaded chunk, so it costs nothing until used. Icon pack import uses the native `DecompressionStream`, no ZIP library |

---

## Contributing

See [CONTRIBUTORS.md](./CONTRIBUTORS.md) for guidelines.

## License

MIT · © 2026 Alberto Barrago. Bundled third-party material (Kubernetes icons, Apache-2.0) is listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

_Draw things. Ship things. Touch grass._
