<div align="center">

<img src="public/markasso-logo-icon.svg" width="80" height="80" alt="Markasso logo" />

<h2>Markasso — User Manual</h2>

<p>A dark-canvas whiteboard for diagrams, notes, and freehand drawing.<br/>
<a href="https://albertobarrago.github.io/Markasso/">Open the app</a> · <a href="./README.md">Back to README</a></p>

</div>

---

## Tools

Select a tool from the toolbar or press its keyboard shortcut.

| Tool       | Key | Description |
|------------|-----|-------------|
| Hand       | `H` or `Space` | Pan the canvas |
| Select     | `V` or `1` | Select, move, resize, rotate elements |
| Rectangle  | `R` or `2` | Draw rectangles |
| Ellipse    | `E` or `3` | Draw ellipses and circles |
| Rhombus    | `D` or `4` | Draw diamond/rhombus shapes |
| Arrow      | `A` or `5` | Draw arrows |
| Pen        | `P` or `6` | Freehand drawing |
| Text       | `T` or `7` | Add text |
| Line       | `L` or `8` | Draw straight lines |
| Eraser     | `0` | Erase elements by clicking or dragging over them |

Press `Escape` to return to the Select tool at any time.

### Tool Lock

The **lock button** at the far left of the toolbar controls what happens after you finish drawing a shape:

- **Unlocked (default):** the tool reverts to Select and the new element is selected — the properties panel opens automatically so you can style it immediately.
- **Locked:** the drawing tool stays active so you can place the next shape without re-selecting the tool. Useful for drawing many shapes of the same type in a row.

---

## Drawing

### Shapes (Rectangle / Ellipse)
Click and drag to draw. Hold `Shift` while dragging to constrain to a square or circle.

### Rhombus (Diamond)
Click and drag to draw a diamond shape. Hold `Shift` to constrain to an equilateral rhombus. Supports fill, stroke, opacity, and roughness like other shapes.

### Line / Arrow
Click to set the start point, drag to the end point, release to confirm.
Hold `Shift` to snap the angle to 45° increments.

**Connecting arrows to shapes (Smart Links):** hover the arrow tool over any shape — a highlight and cyan ring appear on the nearest border point. Click and drag to start from that point. Move the end near another shape to connect it. The arrow attaches to the border (not the center) and follows the shapes as they move.

### Pen (Freehand)
Hold and drag to draw. The stroke is automatically smoothed when you release. The pen tool stays active after each stroke so you can keep drawing without re-selecting.

### Eraser
Select the Eraser tool (`0`) then click or drag over elements to delete them. The topmost element under the cursor is erased first. Locked elements are skipped. A glowing slash trail follows the cursor for visual feedback. Elements highlight as the eraser passes over them.

### Text
Click anywhere to place a text box and start typing. Press `Enter` to confirm, `Escape` to cancel. Double-click existing text to edit it.

**Code mode:** toggle Code mode in the properties panel to create a monospace block with dark background. Use `Tab` for indentation and `Shift+Enter` to commit.

**Text alignment:** set left, center, or right alignment per element from the properties panel.

### Shape Labels
Double-click any rectangle or ellipse to add a text label inside it. The label is clipped to the shape's bounds.

### Arrow Labels
Double-click any arrow to add a label along its path.

---

## Selection

### Selecting elements
- **Click** an element to select it.
- **Shift+click** to add or remove an element from the current selection.
- **Click and drag** on empty canvas for a marquee (box) selection.
- **Ctrl+A** to select all elements.

### Moving
Drag any selected element to move it. When multiple elements are selected they all move together.

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

## Lock

Lock elements to protect them from accidental edits.

- **Lock:** select elements → click the lock button in the context toolbar.
- **Unlock:** select the locked element → click the unlock button.

Locked elements:
- Remain fully visible
- Can be clicked to select (useful for inspecting style or unlocking)
- Cannot be moved, resized, deleted, or connected to

---

## Smart Arrow Links

Arrows (and lines) can be permanently connected to shapes.

**Creating a link:**
1. Select the Arrow tool (`A`).
2. Hover over a shape — it highlights and shows a cyan ring on the border. Click to start from that border point.
3. Drag to another shape — its border highlights too. Release to connect.
4. The arrow is now live: move either shape and the arrow follows, always attaching at the correct border point.
5. After the arrow is placed the tool automatically returns to Select.

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
| Duplicate | `Ctrl+D` |
| Delete | `Delete` / `Backspace` |
| Select all | `Ctrl+A` |

---

## Style Properties

With an element selected, the **Properties panel** (slider icon in the context toolbar) lets you change:

- **Stroke color** and **fill color**
- **Stroke width**
- **Stroke style:** solid, dashed, dotted
- **Opacity** (0–100%)
- **Roughness** — 0 = crisp, higher = hand-drawn / sketchy look
- **Corners** — Sharp or Rounded (rectangles only)
- **Font** and **font size** (text elements)
- **Alignment** — left / center / right (text elements)
- **Code mode** — monospace block with dark background (text elements)

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

---

## Theme

Switch between **Dark**, **Light**, and **System** themes from the Settings panel (hamburger menu). Your preference is saved across sessions.

---

## Import & Export

- **Import image:** click the image icon in the context toolbar (or drag and drop onto the canvas, or `Ctrl+V` to paste from clipboard).
- **Open .markasso:** drag and drop a `.markasso` file onto the canvas, or use File → Open in the Settings menu.
- **Save .markasso:** File → Save in the Settings menu. Saves the full scene including images.
- **Export PNG:** downloads a 2× PNG cropped to the bounding box of all elements.
- **Export SVG:** downloads a clean SVG cropped to the bounding box.
- **Auto-save:** the canvas saves automatically to `localStorage` — your work survives page refreshes.

---

## Keyboard Shortcut Reference

| Shortcut | Action |
|----------|--------|
| `H` / `Space` | Hand (pan) |
| `V` / `1` | Select tool |
| `R` / `2` | Rectangle |
| `E` / `3` | Ellipse |
| `D` / `4` | Rhombus (Diamond) |
| `A` / `5` | Arrow |
| `P` / `6` | Pen |
| `T` / `7` | Text |
| `L` / `8` | Line |
| `0` | Eraser |
| `Escape` | Back to Select / exit group / deselect |
| `G` | Toggle grid |
| `F` | Fit canvas to elements |
| `Shift+0` | Reset zoom to 100% |
| `\` | Toggle all UI panels |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+G` | Group selection |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+Shift+]` | Bring to front |
| `Ctrl+Shift+[` | Send to back |
| `Arrow keys` | Nudge 1px |
| `Shift+Arrow` | Nudge 10px |
| `Delete` / `Backspace` | Delete selection |
| `Shift+click` | Add/remove from selection |
