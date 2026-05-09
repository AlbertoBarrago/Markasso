# Changelog

All notable changes to this project will be documented here.

---

## [1.5.1] — 2026-05-09

### Fixed
- **Arrow connector anchors** — endpoint handles of a selected arrow now sit on the shape's border instead of its geometric center; selection bounding box and rotation handle likewise reflect the true visible extent of the connector
- **Arrow selection with connected shapes** — `drawSelection` and `getRotationHandleScreen` now receive the full element list, so `resolveArrowEndpoints` can locate connected shapes and clip correctly in all cases
- **Border point for rotated shapes** — `getElementBorderPoint` now accounts for element rotation; the computed anchor point lands on the actual rotated boundary rather than the axis-aligned bounding box

---

## [1.5.0] — 2026-05-09

### Added
- **Mermaid gitGraph import** — paste or load a `gitGraph` diagram; branches, commits, and merge arrows are rendered as canvas elements automatically
- **Mermaid import dialog** — replaces the old file-only button with a textarea dialog (paste code directly or load a `.mmd` file); supports Cmd/Ctrl+Enter to confirm

### Changed
- **Grid on by default** — new sessions start with the dot grid visible

### Fixed
- **gitGraph paste** — Ctrl+V with a gitGraph diagram was silently ignored; the global paste handler now recognises `gitGraph` as a valid Mermaid prefix

---

## [1.4.2] — 2026-05-07

### Fixed
- **Text tool font size** — switching away from the text tool now resets the font size to the default (20px), so a large size set on one text element no longer carries over to new elements created later

### Changed
- **Support CTA** — toolbar coffee button replaces the GitHub star button; Buy Me a Coffee is now the primary support action

---

## [1.4.1] — 2026-04-28

### Changed
- **Menu** — "About" CTA replaced with inline version number; About modal removed
- **Star CTA modal** — header now shows the Markasso logo instead of a star; credits text updated
- **Star button pulse** — pulses twice on load and once more after 7 seconds, then stops

---

## [1.4.0] — 2026-04-28

### Added
- **Diagram presets panel** — one-click presets for flowchart, mind map, SWOT, and sequence diagrams
- **Social share dropdown** — share the canvas link to Reddit, LinkedIn, Facebook, and Instagram
- **GitHub star CTA** — toolbar button with support modal (includes Buy Me a Coffee link)
- **Contextual hint bar** — per-tool hints displayed at the bottom of the canvas
- **Lock/unlock button in context panel** — toggle element lock directly from the properties panel
- **Google Analytics** — lightweight usage tracking via GA script

### Changed
- **Menu** — "About" entry replaced with the current version number displayed inline
- **Arrow label UX** — smaller text size, click-on-label to edit, no ghost element on edit start
- **Grid persistence** — grid type and visibility are now persisted across sessions

### Fixed
- Label color decoupled from stroke color; Enter/Esc and text resize behavior corrected
- Backspace delete handler: double-dispatch guard and `contenteditable` protection added
- Mobile: freehand zigzag, style panel rendering, and delete behavior
- Wrong bounding-box calculation for polygon in PNG/SVG export
- `lineCap` control removed from line tool mode panel (not applicable to lines)

---

## [1.2.1] — 2026-04-17

### Added
- **Lock / Unlock shortcut** (`Ctrl+Shift+L` / `⌘⇧L`) — toggle element lock directly from the keyboard
- **Locked-elements toolbar indicator** — padlock badge appears at the right of the tools pill when locked elements are selected; clicking it unlocks them immediately

### Changed
- **Tool-lock icon** — changed from padlock to pin/thumbtack to distinguish it visually from the element-lock padlock
- **Single-key shortcuts guard** — tool hotkeys (`L`, `R`, `A`, etc.) no longer fire when modifier keys (Ctrl/Cmd/Alt) are held, preventing accidental tool switches during modifier combos

---

## [1.1.0] — 2026-04-13

### Added
- **Curve tool** (`C`) — quadratic bezier with draggable control point; supports stroke style, linecap, opacity, roughness
- **Polygon tool** (`O`) — click to place vertices, double-click to close; open or closed polyline/polygon with fill
- **Sticky notes tool** (`N`) — colored sticky with editable text; pick from preset note colors in the properties panel
- **Command palette** (`Ctrl+K`) — fuzzy-search all commands (tools, export, zoom, theme, language, alignment)
- **Element search** (`Ctrl+F`) — search canvas elements by label/content; click result to pan and select
- **Minimap** — collapsible overview panel (bottom-right); click or drag to pan the viewport in real time
- **Share link** — encode the full scene into a URL hash; one click to copy, recipients open the same canvas
- **HTML export** — export canvas as a standalone `.html` file with embedded image
- **Text formatting** — bold, italic, underline, strikethrough for text elements
- **Shadow** — optional drop-shadow on any element (blur, color, offset)
- **Stylus pressure** — freehand strokes record per-point pressure for future variable-width rendering
- **Linecap icons** — flat/round/square linecap buttons now show SVG icons instead of text labels

### Changed
- **Line group button** — split into main (activates last-used tool directly) and chevron (opens flyout to switch curve/polygon/line); no more forced dropdown on every click
- **Mobile tool popup** — curve and polygon now appear after arrow in the mobile tools popup
- **Export dark mode** — all export formats (PNG, SVG, HTML) now read `--canvas-bg` and render the correct background instead of forcing white

### Removed
- **PDF export** — browser `window.print()` approach proved unreliable (blank output) across browsers; removed from toolbar and command palette

### Fixed
- Split button active outline bled onto chevron border causing a double red bar; active indicator moved to the container
- Share toast position adjusted to clear the toolbar island

---

## [1.0.0] — 2026-04-10

First stable release.

### Added
- **Spatial alignment toolbar** — multi-element alignment and distribution controls (align left/center/right/top/middle/bottom, distribute horizontally/vertically)
- **Keyboard shortcuts help dialog** — `?` opens an overlay listing all shortcuts
- **SEO & social sharing** — OG tags and Twitter `summary_large_image` card for link previews

### Improved
- **Mobile toolbox FAB** — cleaner icon, more consistent with desktop toolbar style
- **Tool cursors** — eraser and text tools now use purpose-built cursors instead of fallback defaults

### Fixed
- Canvas hint position adjusted to sit above the bottom toolbar islands on mobile
- Hide fill/background color pickers for line and arrow in the mobile style panel

---

## [0.0.8] — 2026-04-09

### Added
- **Keyboard shortcuts help dialog** — accessible via `?` key

### Improved
- Mobile toolbox FAB icon redesigned for clarity

### Fixed
- Fill and background color controls no longer appear for line/arrow elements in the mobile style panel

---

## [0.0.7] — 2026-04-08

### Improved
- **Text tool — fluid editing (Excalidraw-style)** — clicking to create or edit text no longer shows a dashed outline while typing; `Enter` inserts a newline instead of committing; clicking outside (blur) confirms the text. The element auto-resizes both width and height to fit the actual content after every edit.

---

## [0.0.6] — 2026-04-08

### Fixed
- **Mermaid paste hang on cyclic diagrams** — pasting a flowchart with back edges (e.g. `D --> B` where B is an ancestor of D) caused the layout BFS to loop infinitely, freezing the browser tab. A depth cap (`nodeIds.length`) now guarantees termination; DAG layouts are unaffected.

### Dev
- Added `vitest.config.ts` to decouple the test runner from the Cloudflare Vite plugin, restoring `pnpm test` after the Vite 8 dependency update.

---

## [0.0.3] — 2026-03-31

### Added
- **Mermaid import** — import `.mmd` / `.mermaid` files via drag-and-drop or the new toolbar button; paste Mermaid text directly from the clipboard (`Ctrl+V`)
- Supported diagram types: `graph` / `flowchart` (directions TD, LR, RL, BT) and `sequenceDiagram`
- Node shapes auto-mapped: `[]` → rectangle, `(())` → ellipse, `{}` → rhombus
- Edge types: solid arrows `-->`, dashed arrows `-.->`, plain lines `---`; inline labels preserved
- Viewport auto-fits to the imported diagram after conversion

---

## [0.0.1] — 2026-03-31

### Added
- Initial release
- Zero-dependency whiteboard engine built with vanilla TypeScript and Canvas 2D API
- Drawing tools: Hand, Select, Rectangle, Ellipse, Rhombus, Arrow, Line, Pen (freehand), Text, Eraser
- Infinite canvas with pan (`Alt+drag`, middle-click) and zoom (`Ctrl+scroll`)
- Grid modes: Dot, Line, mm graph paper
- Selection with resize handles, rotation, endpoint editing, multi-select
- Smart arrow connections with border attachment, hover preview, and cascade delete
- Groups (`Ctrl+G`) with nested group editing
- Shape labels (double-click on rect/ellipse), arrow labels, text scaling
- Shift constraints for proportional drawing and angle snapping
- Undo/redo with full command history (`Ctrl+Z` / `Ctrl+Y`)
- Session persistence via `localStorage`; `.markasso` file save/load
- PNG and SVG export with bounding-box auto-fit
- Image import via drag-and-drop, file picker, or `Ctrl+V` paste
- Dark/light/system theme with CSS variables
- Multi-language i18n (8 languages)
- Mobile support with compact action bar and touch-friendly UI
- Keyboard-first workflow with full shortcut coverage
