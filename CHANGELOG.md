# Changelog

All notable changes to Markasso are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Fixed

- **Text resize handle scaling** — Text element width now scales proportionally to font size when dragging resize handles, keeping text content properly contained within the dashed selection box

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
- Toolbar position: Top, Left, Right (Bottom removed)
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

[Unreleased]: https://github.com/AlbertoBarrago/Markasso/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AlbertoBarrago/Markasso/releases/tag/v0.1.0
