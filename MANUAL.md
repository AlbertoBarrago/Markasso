<div align="center">

<img src="public/markasso-logo-icon.svg" width="80" height="80" alt="Markasso logo" />

<h2>Markasso — User Manual</h2>

<p>A dark-canvas whiteboard for diagrams, notes, and freehand drawing.<br/>
<a href="https://markasso.it">Open the app</a> · <a href="./README.md">Back to README</a></p>

</div>

---

## Tools

Select a tool from the toolbar or press its keyboard shortcut.

| Tool       | Key | Description |
|------------|-----|-------------|
| Hand       | `H` or `Space` | Pan the canvas |
| Select     | `V` or `1` | Select, move, resize, rotate elements |
| Rectangle  | `R` or `2` | Draw rectangles |
| Rhombus    | `D` or `3` | Draw diamond/rhombus shapes |
| Ellipse    | `E` or `4` | Draw ellipses and circles |
| Line       | `A` / `L` or `5` | Draw straight lines and lines with arrowheads |
| Curve      | `C` | Draw quadratic bezier curves |
| Polygon    | `O` | Draw multi-point polygons and polylines |
| Pen        | `P` or `7` | Freehand drawing |
| Text       | `T` or `8` | Add text |
| Eraser     | `0` | Erase elements by clicking or dragging over them |

Press `Escape` to return to the Select tool at any time.

### Connector Editing

The main numbered connector slot is **Line** (toolbar position `5`).

- `A`, `L`, and `5` all select the same connector tool.
- Arrowheads are a style of line elements, configurable from the properties panel.
- Drag the midpoint control handle after placement to bend a line into a quadratic bezier.
- Labels on curved connectors now reserve their gap along the actual curve, not along the straight chord.

### Tool Lock

The **pin button** (thumbtack icon) at the far left of the toolbar controls what happens after you finish drawing a shape:

- **Unpinned (default):** the tool reverts to Select and the new element is selected — the properties panel opens automatically so you can style it immediately.
- **Pinned:** the drawing tool stays active so you can place the next shape without re-selecting the tool. Useful for drawing many shapes of the same type in a row.

> **Note:** The pin icon (tool lock) is intentionally different from the padlock icon (element lock) to avoid confusion — pin = keep tool active, padlock = element cannot be edited.

---

## Drawing

### Shapes (Rectangle / Ellipse)
Click and drag to draw. Hold `Shift` while dragging to constrain to a square or circle.

### Rhombus (Diamond)
Click and drag to draw a diamond shape. Hold `Shift` to constrain to an equilateral rhombus. Supports fill, stroke, opacity, and roughness like other shapes.

### Line / Arrowheads
Click to set the start point, drag to the end point, release to confirm.
Hold `Shift` to snap the angle to 45° increments.

**Connecting lines to shapes (Smart Links):** hover the line tool over any shape — a highlight and cyan ring appear on the nearest border point. Click and drag to start from that point. Move the end near another shape to connect it. The connector attaches to the border (not the center) and follows the shapes as they move. If you enable arrowheads, the tip follows the final tangent of the bend.

### Curve
Click to set the start point, drag to the end point, release to place the curve. A control point (diamond handle) appears at the midpoint — drag it to adjust the curve's bend. Select the curve and drag any of the three handles to reshape it.

### Polygon
Click to place each vertex. **Double-click** the last vertex (or click the first vertex again) to close the polygon. Press `Escape` to finish as an open polyline. Polygons support fill, stroke style, and opacity.

### Pen (Freehand)
Hold and drag to draw. The stroke is automatically smoothed when you release. The pen tool stays active after each stroke so you can keep drawing without re-selecting. Stylus pressure is recorded when available.

### Eraser
Select the Eraser tool (`0`) then click or drag over elements to delete them. The topmost element under the cursor is erased first. Locked elements are skipped. A glowing slash trail follows the cursor for visual feedback. Elements highlight as the eraser passes over them.

### Text
Click anywhere to place a text box and start typing. Press `Enter` to confirm, `Escape` to cancel. Double-click existing text to edit it.

**Formatting:** with a text element selected, the properties panel exposes **Bold**, **Italic**, **Underline**, and **Strikethrough** toggles.

**Code mode:** toggle Code mode in the properties panel to create a monospace block with dark background. Use `Tab` for indentation and `Shift+Enter` to commit.

**Text alignment:** set left, center, or right alignment per element from the properties panel.

### Shape Labels
Double-click any rectangle or ellipse to add a text label inside it. The label is clipped to the shape's bounds.

### Connector Labels
Double-click any line with arrowheads to add a label along its path. On curved connectors, the blank gap follows the bezier bend.

---

## Selection

### Selecting elements
- **Click** an element to select it.
- **Shift+click** to add or remove an element from the current selection.
- **Click and drag** on empty canvas for a marquee (box) selection.
- **Ctrl+A** to select all elements.

### Moving
Drag any selected element to move it. When multiple elements are selected they all move together.

**Shift+drag to clone:** hold `Shift` and drag a selected element to leave the original in place and drag a copy. If multiple elements are selected, all of them are cloned.

### Resizing
Select an element — eight handles appear around the bounding box. Drag any handle to resize. Hold `Shift` while dragging a corner handle to preserve aspect ratio.

### Rotating
Drag the circular handle above the selection box to rotate. Single elements only.

### Nudging
With elements selected, use the **arrow keys** to move by 1px. Hold `Shift` for 10px steps.

### Deleting
Press `Delete` or `Backspace` to remove selected elements. Locked elements are skipped.

---

## Groups

Group elements so they behave as a unit.

| Action | How |
|--------|-----|
| Group | Select 2+ elements → `Ctrl+G` or click the group button in the toolbar |
| Ungroup | Select grouped elements → `Ctrl+Shift+G` or click the ungroup button |
| Select whole group | Click any member |
| Enter group (select individual) | Click a member a second time while the group is already selected |
| Exit group | Press `Escape` to return to whole-group selection |

---

## Alignment

With two or more elements selected, the **alignment toolbar** appears above the selection. It lets you align and distribute elements in one click.

| Action | Description |
|--------|-------------|
| Align left | Align left edges to the leftmost element |
| Align center (H) | Center horizontally |
| Align right | Align right edges to the rightmost element |
| Align top | Align top edges to the topmost element |
| Align middle (V) | Center vertically |
| Align bottom | Align bottom edges to the bottommost element |
| Distribute horizontally | Space elements evenly across the horizontal axis |
| Distribute vertically | Space elements evenly across the vertical axis |

---

## Lock

Lock elements to protect them from accidental edits.

- **Lock:** select elements → click the lock button in the context toolbar, or press `Ctrl+Shift+L` (`⌘⇧L` on Mac).
- **Unlock:** select the locked element → click the unlock button, or press `Ctrl+Shift+L` again.

When the selection contains locked elements, a **padlock indicator** appears at the right end of the toolbar pill. Clicking it unlocks the locked elements in the selection directly.

Locked elements:
- Remain fully visible
- Can be clicked to select (useful for inspecting style or unlocking)
- Cannot be moved, resized, deleted, or connected to

---

## Smart Arrow Links

Lines with or without arrowheads can be permanently connected to shapes.

**Creating a link:**
1. Select the line tool with `A`, `L`, or `5`.
2. Hover over a shape — it highlights and shows a cyan ring on the border. Click to start from that border point.
3. Drag to another shape — its border highlights too. Release to connect.
4. The connector is now live: move either shape and the line follows, always attaching at the correct border point.
5. After the connector is placed the tool automatically returns to Select.

**Editing a link:**
Select the arrow → drag either cyan endpoint handle. Drag near a shape to reconnect, or drag away from all shapes to disconnect.

**Disconnecting:** drag an endpoint handle away from the connected shape and release in empty space.

**Deleting a linked shape:** deleting a shape automatically removes all arrows and lines connected to it.

---

## Layer Order

Control which elements appear on top.

| Action | Keyboard | Toolbar |
|--------|----------|---------|
| Bring to front | `Ctrl+Shift+]` | front button |
| Move forward one | — | forward button |
| Move back one | — | back button |
| Send to back | `Ctrl+Shift+[` | back button |

---

## Editing & History

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` or `Ctrl+Shift+Z` |
| Copy | `Ctrl+C` |
| Paste | `Ctrl+V` |
| Duplicate | `Ctrl+D` |
| Delete | `Delete` / `Backspace` |
| Select all | `Ctrl+A` |
| Lock / Unlock elements | `Ctrl+Shift+L` (`⌘⇧L`) |
| Group | `Ctrl+G` (`⌘G`) |
| Ungroup | `Ctrl+Shift+G` (`⌘⇧G`) |

---

## Style Properties

With an element selected, the **Properties panel** (slider icon in the context toolbar) lets you change:

- **Stroke color** and **fill color**
- **Stroke width**
- **Stroke style:** solid, dashed, dotted
- **Line cap:** flat / round / square (lines, arrows, curves, freehand)
- **Opacity** (0–100%)
- **Roughness** — 0 = crisp, higher = hand-drawn / sketchy look
- **Shadow** — blur, color, and offset for a drop shadow
- **Corners** — Sharp or Rounded (rectangles only)
- **Font** and **font size** (text elements)
- **Formatting** — Bold, Italic, Underline, Strikethrough (text elements)
- **Alignment** — left / center / right (text elements)
- **Code mode** — monospace block with dark background (text elements)
- **Note color** — preset palette (sticky notes)

---

## Grid

| Action | Shortcut |
|--------|----------|
| Toggle grid | `G` |
| Grid types | Dot / Line / Millimeter (from Settings) |

---

## Navigation

| Action | How |
|--------|-----|
| Pan | Middle-click drag, or `Alt+drag` |
| Zoom | Scroll wheel, or pinch on trackpad/touch |
| Fit all elements | `F` |
| Reset zoom to 100% | `Shift+0` |
| Toggle all panels | `\` (backslash) |
| Minimap | Bottom-right corner — click or drag the minimap to pan |

---

## Command Palette

Press `Ctrl+K` to open the command palette. Type to fuzzy-search all available actions — export formats, tool switches, zoom levels, theme changes, language settings, and alignment operations. Use `↑` / `↓` to navigate and `Enter` to execute. Press `Escape` to dismiss.

---

## Element Search

Press `Ctrl+F` to search elements on the canvas by their label or text content. Select a result to pan the viewport to that element and select it. Press `Escape` to close. Hidden on touch/mobile devices.

---

## Minimap

A small overview panel in the bottom-right corner shows all elements at a reduced scale. The blue rectangle represents the current viewport. Click anywhere on the minimap to jump there; drag to pan continuously. Collapse or expand it with the toggle button.

---

## Share Link

Click the **share icon** in the top-right toolbar to encode the entire scene into a URL. The link is copied to your clipboard automatically. Share it — anyone who opens the URL sees the same canvas, ready to continue editing.

---

## Theme

Switch between **Dark**, **Light**, and **System** themes from the Settings panel (hamburger menu). Your preference is saved across sessions.

---

## Import & Export

- **Import image:** click the image icon in the context toolbar (or drag and drop onto the canvas, or `Ctrl+V` to paste from clipboard).
- **Open .markasso:** drag and drop a `.markasso` file onto the canvas, or use File → Open in the Settings menu.
- **Save .markasso:** File → Save in the Settings menu. Saves the full scene including images.
- **Import Mermaid diagram:** drag and drop a `.mmd` or `.mermaid` file onto the canvas, click the Mermaid button in the toolbar, or paste Mermaid text with `Ctrl+V`. Supported diagram types:
  - `graph` / `flowchart` — directions TD, LR, RL, BT; node shapes `[]` (rectangle), `(())` (ellipse), `{}` (rhombus); solid arrows `-->`, dashed arrows `-.->`, plain lines `---`; inline edge labels
  - `sequenceDiagram` — participants become rectangles arranged in a row; messages become arrows with labels
  - The viewport auto-fits to the imported diagram after conversion.
- **Export PNG:** downloads a 2× PNG cropped to the bounding box of all elements.
- **Export SVG:** downloads a clean SVG cropped to the bounding box.
- **Export HTML:** downloads a standalone `.html` file with the canvas embedded as an image.
- **Auto-save:** the canvas saves automatically to `localStorage` — your work survives page refreshes.

---

## Keyboard Shortcut Reference

| Shortcut | Action |
|----------|--------|
| `H` / `Space` | Hand (pan) |
| `V` / `1` | Select tool |
| `R` / `2` | Rectangle |
| `D` / `3` | Rhombus (Diamond) |
| `E` / `4` | Ellipse |
| `A` / `L` / `5` | Line + arrowheads |
| `C` | Curve |
| `O` | Polygon |
| `P` / `7` | Pen |
| `T` / `8` | Text |
| `N` | Sticky note |
| `0` | Eraser |
| `?` | Open keyboard shortcuts help dialog |
| `Escape` | Back to Select / exit group / deselect |
| `G` | Toggle grid |
| `F` | Fit canvas to elements |
| `Shift+0` | Reset zoom to 100% |
| `\` | Toggle all UI panels |
| `Ctrl+K` | Open command palette |
| `Ctrl+F` | Open element search |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all |
| `Ctrl+C` | Copy selection |
| `Ctrl+V` | Paste (elements or image from clipboard) |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+G` | Group selection |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+Shift+]` | Bring to front |
| `Ctrl+Shift+[` | Send to back |
| `Arrow keys` | Nudge 1px |
| `Shift+Arrow` | Nudge 10px |
| `Delete` / `Backspace` | Delete selection |
| `Shift+click` | Add/remove from selection |
| `Shift+drag` | Clone and drag (leave original in place) |
