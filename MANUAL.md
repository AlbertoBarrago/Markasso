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
| Pen        | `P` or `6` | Freehand drawing |
| Text       | `T` or `7` | Add text |
| Sticky note | `N` | Add sticky notes (also available from the command palette) |
| Flowchart shape | `S` | Draw the flowchart symbol last picked in the Library |
| Library    | `I` | Open the Library: flowchart shapes and icons (see below) |
| Eraser     | `0` | Erase elements by clicking or dragging over them |

There is no separate curve tool: drag the midpoint handle of a line after placement to bend it into a quadratic bezier (see Connector Editing below).

Press `Escape` to return to the Select tool at any time.

### Connector Editing

The **Arrow / Line** connector has its own arrow button on the toolbar (`5`), outside the shapes menu.

- `A`, `L`, and `5` all select the same connector tool.
- Arrowheads are a style of line elements, configurable from the properties panel.
- Drag the midpoint control handle after placement to bend a line into a quadratic bezier.
- Labels on curved connectors now reserve their gap along the actual curve, not along the straight chord.
- **Routing:** switch a connector between **Straight** and **Elbow** (orthogonal) in the properties panel. See Smart Arrow Links below.
- **Arrowhead styles:** each end can use an open head, a hollow or filled triangle, a hollow or filled diamond, or a circle.

The toolbar is dedicated to drawing. On narrow windows, pen, text, sticky note and eraser progressively move into **⋯ More tools**; hand, select, basic shapes and the connector stay visible. The menu lists **Presets**, **Library**, **Import Mermaid**, **Insert image** and, in a separate group, **Start live session**. Presets insert a grouped diagram at the center of the viewport. Zoom and undo/redo live in separate panels in the bottom corners, which you can hide from Preferences.

### Moving the Toolbar

The toolbar starts at the bottom center. Its **move handle** (six dots) docks it in **six positions**: top or bottom, aligned left, center or right.

- **Drag** the handle toward a highlighted target: arrows and a preview show the dock before you release.
- **Click** the handle, then the desired position to move it without dragging. Press `Escape` or click the handle again to cancel.
- With the handle focused, **Left / Right** change alignment and **Up / Down** choose top or bottom.
- **Double-click** the handle or press **Home** to reset to bottom-center.

The position is remembered between sessions and adapts to the space occupied by the menu, minimap, panels and visible controls. Hints follow the toolbar: above it when docked at the bottom, below it when docked at the top; tool menus open toward the inside of the screen.

In **Menu → Preferences**, **Show zoom controls** and **Show undo/redo controls** independently show or hide the panels in the bottom corners; both are visible by default. On touch devices they are not offered: undo/redo is in the bottom bar and you zoom with a pinch. The zoom panel offers fit to content, zoom out, the current percentage (click to reset to 100%) and zoom in. Preferences are saved; enabling undo/redo moves the minimap upward to leave room.

Open Preferences directly with **Cmd+,** on macOS or **Ctrl+,** on other systems, including while typing.

### Tool Lock

The **pin button** (thumbtack icon) next to the move handle controls what happens after you finish drawing a shape:

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

### Curves
There is no separate curve tool. Draw a line, then drag the control point (diamond handle) at its midpoint to bend it into a quadratic bezier. Select the curve and drag any of the three handles to reshape it.

### Pen (Freehand)
Hold and drag to draw. The stroke is automatically smoothed when you release. The pen tool stays active after each stroke so you can keep drawing without re-selecting. Stylus pressure is recorded when available.

### Eraser
Select the Eraser tool (`0`) then click or drag over elements to delete them. The topmost element under the cursor is erased first. Locked elements are skipped. A glowing slash trail follows the cursor for visual feedback. Elements highlight as the eraser passes over them.

### Text
Click anywhere to place a text box and start typing. Press `Enter` to confirm, `Escape` to cancel. Double-click existing text to edit it.

**Formatting:** with a text element selected, the properties panel exposes **Bold**, **Italic**, **Underline**, and **Strikethrough** toggles.

**Code mode:** toggle Code mode in the properties panel to create a monospace block with dark background. Use `Tab` for indentation and `Shift+Enter` to commit.

**Text alignment:** set left, center, or right alignment per element from the properties panel.

### Sticky Notes

Choose **Sticky note** from the toolbar (or **⋯ More tools** on narrow windows), or press `N`, then click the board. The yellow background appears immediately while you type, with 12 px of internal padding. The note keeps its width, wraps the text and grows taller when needed. `Enter` adds a line; click outside or press `Escape` to commit. Double-click to edit it again. An empty note is removed.

### Shape Labels
Double-click any rectangle or ellipse to add a text label inside it. The label is clipped to the shape's bounds.

### Connector Labels
Double-click any line with arrowheads to add a label along its path. On curved connectors, the blank gap follows the bezier bend.

---

## Library: Flowchart Shapes & Icons

Open the **Library** with `I` or **⋯ More tools → Library**. It is a searchable sidebar, like Excalidraw's:

- **Click** an item to insert it at the center of the view, or **drag** it onto the canvas to drop it where you want.
- **Search** filters every section at once. Recently used items are listed first.
- Sections can be collapsed; icon packs start collapsed to keep the list short.
- On touch devices the Library opens as a bottom sheet from the tools menu.

### Flowchart Shapes
Eight standard flowchart symbols: **Start / End**, **Data (I/O)**, **Document**, **Database**, **Predefined process**, **Preparation**, **Manual input** and **Delay**.

- Insert them from the Library, or press `S` and drag to draw the last symbol you picked.
- Double-click a shape to type a label; it is laid out in the symbol's text area.
- With shapes selected, the **Shape** row in the properties panel switches their symbol in place (undoable).
- They support fill, stroke styles, roughness, rotation, PNG/SVG export and live sessions, and connectors snap to their real outline.

### Icons
The **Icons** section holds Markasso's own architecture icons: server, database, cache, queue, storage, load balancer, firewall, router, network, API, container, function, browser, mobile and desktop apps, user, users, external system, secret and document.

- They follow the stroke and fill colors, the theme and the roughness setting, and keep their proportions when resized.
- Each icon carries a label below it (double-click to edit). Connectors attached from below stop under the label.
- They are also available from the command palette (`Ctrl+K`, "Icon: ...").

### Kubernetes Icons
The **Kubernetes** section contains the official Kubernetes icon set (control plane, nodes, workloads, networking, storage, config, access control). It loads the first time you open the section or search the Library. The icons are bundled under the Apache-2.0 license.

### Importing AWS, Azure and Google Cloud Icons
Cloud vendors allow their icons in diagrams but not their redistribution inside tools, so Markasso does not ship them. You download the official pack yourself and import it:

Where to download the official ZIP:

- **AWS:** [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) ("Icon package")
- **Azure:** [Azure architecture icons](https://learn.microsoft.com/azure/architecture/icons/) (accept the terms, then "Download SVG icons")
- **Google Cloud:** [Google Cloud icons](https://cloud.google.com/icons) (core product icons and/or category icons)

Then:

1. In the Library, click **Import icon pack (ZIP)** at the bottom and pick the file. The same download links are shown there.
2. The pack appears as a new section, named after the vendor and grouped by the vendor's own categories. Each icon is kept once, at its largest size.
3. To remove a pack, click the **✕** next to its name.

Good to know:
- Packs are stored **only in this browser** and are never uploaded. Diagrams embed the icons they use, so shared diagrams and exports show them to everyone.
- Vendor icons are never recolored or rotated, as the vendors' terms require; you can still resize them, change their opacity and label color.
- Use them according to each vendor's terms.

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

**Connection ports:** while drawing a connector or dragging one of its ends near a shape, four ports appear (top, right, bottom, left). Drop the end on a port to **pin** it there: it stays on that point when the shape is moved, resized or rotated. Drop it anywhere else on the border and it **floats**, sliding along the border to face the other end.

**Elbow connectors:** set **Routing → Elbow** in the properties panel (with the line tool active, it applies to the next connectors you draw). The orthogonal route is recomputed from the two ends: it leaves each shape with a short straight segment, floating ends move to the middle of the side facing the other shape, and the label sits at the middle of the route.

**Arrowhead styles:** with a connector selected, pick the **Start head** and **End head** style: open, triangle, filled triangle, diamond, filled diamond or circle (UML inheritance, aggregation and composition). Closed heads stay hollow on any background, exports included.

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
| Zoom in / out | `Ctrl+Plus` / `Ctrl+Minus` |
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

A small overview panel in the bottom-right corner shows all elements at a reduced scale. The blue rectangle represents the current viewport. Click anywhere on the minimap to jump there; drag to pan continuously. Press `M`, or use **Show minimap** in the main menu's Preferences, to show or hide it.

---

## Share Link

Choose **Menu → Share → Copy link** to encode the entire scene into a URL. The link is copied to your clipboard automatically. Share it — anyone who opens the URL sees the same canvas, ready to continue editing.

---

## Live Sessions

Choose **⋯ More tools → Start live session** to open a shared board. Its link is copied to the clipboard; people opening it can draw with you. Your stored name appears in the top corner, or a random animal name if you have not set one: click it to change it. A small red blinking dot beside the name indicates an active connection; it stays static when reduced motion is enabled.

---

## Theme

Switch between **Dark**, **Light**, and **System** themes from **Menu → Theme**. Your preference is saved across sessions.

---

## Import & Export

- **Import image:** choose **⋯ More tools → Insert image** (or drag and drop onto the canvas, or `Ctrl+V` to paste from clipboard).
- **Open .markasso:** drag and drop a `.markasso` file onto the canvas, or use File → Open in the Settings menu.
- **Save .markasso:** File → Save in the Settings menu. Saves the full scene including images.
- **Import Mermaid diagram:** drag and drop a `.mmd` or `.mermaid` file onto the canvas, choose **⋯ More tools → Import Mermaid**, or paste Mermaid text with `Ctrl+V`. Supported diagram types:
  - Parsing and layout use the official Mermaid engine, loaded on first import.
  - Flowcharts (including subgraphs), sequence, class, state and entity-relationship diagrams are converted to native, editable elements.
  - Other diagram types, such as gantt, pie, gitGraph and mindmap, are imported as an SVG image; their individual nodes cannot be edited.
  - The viewport auto-fits to the imported diagram after conversion.
- **Import icon pack (ZIP):** AWS, Azure and Google Cloud icon packs are imported from the Library. See *Importing AWS, Azure and Google Cloud Icons*.
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
| `P` / `6` | Pen |
| `T` / `7` | Text |
| `N` | Sticky note |
| `S` | Flowchart shape (last picked symbol) |
| `I` | Open / close the Library |
| `0` | Eraser |
| `?` | Open keyboard shortcuts help dialog |
| `Escape` | Back to Select / exit group / deselect |
| `G` | Toggle grid |
| `M` | Show / hide the minimap |
| `F` | Fit canvas to elements |
| `Ctrl+Plus` | Zoom in |
| `Ctrl+Minus` | Zoom out |
| `Shift+0` | Reset zoom to 100% |
| `\` | Toggle all UI panels |
| `Cmd+,` / `Ctrl+,` | Open Preferences directly |
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
