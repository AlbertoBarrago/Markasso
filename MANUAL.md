# Markasso — User Manual

A dark-canvas whiteboard for diagrams, notes, and freehand drawing.

---

## Tools

Select a tool from the toolbar or press its keyboard shortcut.

| Tool       | Key | Description |
|------------|-----|-------------|
| Select     | `V` or `1` | Select, move, resize, rotate elements |
| Rectangle  | `R` or `2` | Draw rectangles |
| Ellipse    | `E` or `3` | Draw ellipses and circles |
| Line       | `L` or `4` | Draw straight lines |
| Arrow      | `A` or `5` | Draw arrows |
| Pen        | `P` or `6` | Freehand drawing |
| Text       | `T` or `7` | Add text |

Press `Escape` to return to the Select tool at any time.

---

## Drawing

### Shapes (Rectangle / Ellipse)
Click and drag to draw. Hold `Shift` while dragging to constrain to a square or circle.

### Line / Arrow
Click to set the start point, drag to the end point, release to confirm.
Hold `Shift` to snap the angle to 45° increments.

**Connecting arrows to shapes (Smart Links):** hover the arrow tool over any shape — a highlight and cyan ring appear on the nearest border point. Click and drag to start from that point. Move the end near another shape to connect it. The arrow attaches to the border (not the center) and follows the shapes as they move.

### Pen (Freehand)
Hold and drag to draw. The stroke is automatically smoothed when you release. The pen tool stays active so you can draw the next stroke immediately — no auto-selection interrupts the flow.

### Text
Click anywhere to place a text box and start typing. Press `Enter` to confirm, `Escape` to cancel. Double-click existing text to edit it.

### Shape Labels
Double-click any rectangle or ellipse to add a text label inside it.

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
- **Unlock:** select (via layers panel if fully locked) → click the unlock button.

Locked elements:
- Remain fully visible
- Cannot be selected, moved, resized, deleted, or connected to

---

## Smart Arrow Links

Arrows (and lines) can be permanently connected to shapes.

**Creating a link:**
1. Select the Arrow tool (`A`).
2. Hover over a shape — it highlights and shows a cyan ring on the border. Click to start from that border point.
3. Drag to another shape — its border highlights too. Release to connect.
4. The arrow is now live: move either shape and the arrow follows, always attaching at the correct border point facing the other shape.
5. After the arrow is placed the tool automatically returns to Select — no need to press `Escape`.

**Editing a link:**
Select the arrow → drag either cyan endpoint handle. Drag near a shape to reconnect, or drag away from all shapes to disconnect.

**Disconnecting:** drag an endpoint handle away from the connected shape and release in empty space.

**Deleting a linked shape:** deleting a shape automatically removes all arrows and lines connected to it.

---

## Layer Order

Control which elements appear on top.

| Action | Keyboard | Toolbar |
|--------|----------|---------|
| Bring to front | `Ctrl+Shift+]` | ↑↑ button |
| Move forward one | — | ↑ button |
| Move back one | — | ↓ button |
| Send to back | `Ctrl+Shift+[` | ↓↓ button |

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
- **Font** and **font size** (text elements)

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

---

## Import & Export

- **Import image:** click the image icon in the context toolbar (or drag and drop onto the canvas).
- **Export:** use the export button in Settings to save as PNG or the native `.markasso` format.
- **Save/Load:** the canvas auto-saves to the browser session. Use File → Save / Load for `.markasso` files.

---

## Keyboard Shortcut Reference

| Shortcut | Action |
|----------|--------|
| `V` / `1` | Select tool |
| `R` / `2` | Rectangle |
| `E` / `3` | Ellipse |
| `L` / `4` | Line |
| `A` / `5` | Arrow |
| `P` / `6` | Pen |
| `T` / `7` | Text |
| `Escape` | Back to Select / exit group / deselect |
| `G` | Toggle grid |
| `F` | Fit canvas to elements |
| `Shift+0` | Reset zoom to 100% |
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
