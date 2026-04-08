# Changelog

All notable changes to this project will be documented here.

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
