# Changelog

All notable changes to Markasso are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0] – 2026-03-12

### Added
- **Stroke style** — solid, dashed, and dotted stroke options per element; persists in undo history
- **Roughness rendering** — deterministic hand-drawn wobble effect on rectangles, ellipses, lines, and arrows; uses element ID as seed so wobble is stable across redraws
- **Image import** — drag-and-drop, file picker, or Ctrl+V paste to place images on the canvas as resizable elements; images embedded as data URLs
- **Image export (SVG)** — imported images included in SVG export as `<image href="data:...">` tags
- **Context panel** — vertical floating island on the left, auto-shows on selection; contains stroke/fill swatches (stacked vertically), layer order buttons (send to back, move back one, move forward one, bring to front), element actions (properties, duplicate, delete), and import image button
- **Mobile action bar** — bottom-left fixed bar on touch devices with send to back, bring to front, duplicate, visibility toggle, and delete; auto-shows on selection
- **Element visibility** — toggle visibility per element; invisible elements are skipped during rendering but remain in the document

### Changed
- **Properties panel** moved to the **right side** (`right: 16px`) so it no longer overlaps the context panel
- **Delete button** removed from properties panel — available exclusively in the context panel
- Both floating panels start at `top: 72px` for better visual breathing room below the toolbar
- Stroke/fill swatches in the context panel are now stacked vertically for a more compact single-column layout
- `roughness` default changed from `1` to `0` (shapes are clean by default)
- `ActiveTool` type narrowed to exclude `'image'` (images are imported, not drawn)

### Fixed
- Hit-testing, bounds calculation, and resize scaling now correctly handle `image` elements
- Text elements show "Color" label (not "Stroke") in the properties panel

---

## [1.1.0] – 2026-03-11

### Added
- **Fit to content** — press `F` or click the new ⊙ button in the zoom pill to zoom and pan so all elements are visible with a 40 px margin; empty canvas resets to origin
- **Zoom-to-100% button** — the zoom percentage label in the toolbar is now a clickable button; clicking it snaps zoom to 100% while keeping the screen center fixed on the same world point
- **`Shift+0` shortcut** — resets the viewport to `{ offsetX: 0, offsetY: 0, zoom: 1 }` regardless of current pan/zoom
- **`SET_VIEWPORT` command** — new atomic command that sets offsetX, offsetY, and zoom in one step; added to the ephemeral set so it never touches the undo stack

---

## [1.0.2] – 2026-03-11

### Fixed
- **Selection border follows rotation** — the dashed selection rectangle, resize handles, and rotation handle now rotate with the element instead of staying axis-aligned when an element is rotated

---

## [1.0.0] – 2026-03-10

### Added
- **Version badge** in the settings panel footer — displays `Markasso vX.Y.Z` pulled live from `package.json`
- **Hamburger menu button** (☰) replaces the gear icon in the settings trigger; cleaner and more universally recognizable

### Changed
- Settings button moved from **top-right** to a dedicated **top-left** floating island, mirroring the Excalidraw convention
- Settings panel now opens aligned to the left edge of the button (top-left origin) instead of the right
- `transform-origin` corrected to `top left` for a natural open/close animation from the button

---

## [0.3.0] – 2026-03-10

### Added

#### UI — Floating Island Design
- Complete UI redesign: all controls float over a pure black canvas (`#141414`) with no fixed bars
- **Center-top tool pill** — blurred glass island with all tools, each showing an SVG icon and a subscript shortcut number (1–7)
- **Bottom-left controls** — two separate glass pills: Undo/Redo and Zoom (−, %, +)
- **Top-right island** — Export dropdown and Settings gear button
- `backdrop-filter: blur` on all floating panels for a modern glass effect
- Grid defaults to off for a clean blank canvas on first load

#### Export
- **Export PNG** — renders all elements on a white 2× resolution canvas, triggers browser download
- **Export SVG** — generates clean SVG markup for all element types with correct stroke, fill, opacity, and rotation; triggers browser download
- Both exports auto-fit to the bounding box of all elements with padding
- Export actions hidden inside a dropdown menu (download icon button, top-right)

#### Shape Labels
- Double-click any **rectangle** or **ellipse** to type a label directly inside the shape
- Label text is clipped to the shape bounds and rendered centered
- Labels survive undo/redo and are included in SVG/PNG exports

#### Rotation
- Every element now has a **rotation handle** — a circle with a ↻ arc indicator connected by a dashed line, floating above the selection box
- Drag the handle to rotate freely around the element's center
- Rotation is fully undoable (Ctrl+Z)
- Hit testing correctly inverse-rotates the cursor into element local space
- Rotation is preserved in SVG export (`transform="rotate()"`) and PNG export

#### Arrow / Line Endpoint Editing
- When a single line or arrow is selected, **two filled cyan circles** appear at the endpoints
- Drag either endpoint independently to reposition it (dispatches `RESIZE_ELEMENT` with only the moved point)
- Cursor changes to `crosshair` on endpoint hover, `grab` on rotation handle hover

### Changed
- Settings panel no longer includes toolbar-position controls (toolbar is always floating)
- Properties panel moved to the **left side** (`left: 12px`) to avoid overlap with the top-right island
- Canvas background darkened from `#13131f` to `#141414` (pure near-black)
- Accent color alpha updated to 0.18 for better contrast on the darker background

---

## [0.2.0] – 2026-03-09

### Fixed

- **Text resize handle scaling** — Text element width now scales proportionally to font size when dragging resize handles, keeping text content properly contained within the dashed selection box

---

## [0.1.0] – 2026-03-09

### Added

#### Canvas & Tools
- Seven drawing tools: Select, Rectangle, Ellipse, Line, Arrow, Freehand (pen), Text
- Freehand drawing with Catmull-Rom smoothing
- Text tool with inline textarea overlay, auto-grow, and font/color matching
- Double-click on any text element to edit it in place; clearing content deletes the element

#### Selection & Transform
- Click to select, marquee (drag on empty canvas) for multi-select
- Move selected elements by dragging
- 8-handle resize (NW · N · NE · W · E · SW · S · SE) for all element types
  - Rectangles / Ellipses: update x, y, width, height
  - Lines / Arrows: endpoints scale proportionally within the new bounding box
  - Freehand paths: all points scale proportionally
  - Text: font size scales with bounding-box height so the text actually grows/shrinks
- Shift + corner handle during resize → maintains original aspect ratio
- Correct directional resize cursors on handle hover

#### Shape Creation Constraints (Shift)
- Rectangle + Shift → perfect square
- Ellipse + Shift → perfect circle
- Line / Arrow + Shift → snaps end-point to nearest 45° angle

#### Viewport
- Pan with middle-click or Alt + left-drag
- Zoom with Ctrl/Cmd + scroll (mouse-centered)

#### Grid
- Three grid modes: Dots, Lines, Graph paper (mm scale)
- Grid visibility and type toggled from Settings panel

#### Properties Panel
- Stroke color with preset swatches + custom color picker
- Fill color with transparency option
- Stroke width slider
- Opacity slider
- Font size and font family for text elements
- Delete selected element(s)

#### Toolbar & Settings
- Three-section toolbar layout (left: undo/redo · center: tools · right: zoom + gear)
- Toolbar position: Top, Left, Right
- Accent color picker with preset swatches
- Settings persist across sessions via `localStorage`

#### History
- Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
- Ephemeral commands (pan, zoom, selection, tool changes) do not pollute the undo stack

#### Project
- Vite + TypeScript setup with strict type checking
- Styles extracted from `index.html` into `src/style.css`
- MIT License
- `.gitignore` covering `node_modules`, `dist`, `.idea`, `.vscode`, `.DS_Store`, `.env`

---

[1.0.0]: https://github.com/AlbertoBarrago/Markasso/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/AlbertoBarrago/Markasso/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AlbertoBarrago/Markasso/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AlbertoBarrago/Markasso/releases/tag/v0.1.0
