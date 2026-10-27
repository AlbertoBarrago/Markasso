# Changelog

All notable changes to this project will be documented here.

---

## [1.14.0] - 2026-10-27

### Added
- **Direct Preferences shortcut.** Cmd+, on macOS and Ctrl+, elsewhere opens the main menu directly on Preferences; the shortcut is shown in the menu and documented in the guide.
- **Live connection indicator.** A small red dot beside the live name pulses only while connected, and remains static with reduced motion enabled.
- **Sticky notes in the toolbar (N).** Notes show their background immediately during editing, keep their box size, wrap and grow with the text, and have 12 px of internal padding on the canvas and in exports.
- **Six magnetic toolbar positions.** Dock the toolbar at the top or bottom, aligned left, center or right. Dragging shows arrows, a destination preview and a short guide. Click-to-place and arrow keys work too; Home or double-click restores bottom-center, and Escape cancels positioning. The saved dock adapts to visible controls and panels.
- **Optional corner controls.** Preferences can independently show zoom and undo/redo panels, with settings remembered across sessions. The minimap moves above the history panel when both are visible.
- **View shortcuts.** Press `M` to toggle the minimap and `Ctrl+Plus` / `Ctrl+Minus` to zoom the canvas. Manuals and the `?` shortcut reference include them and the toolbar docking keys.
- **Updated What's New notice** covering the toolbar, quick actions, optional controls and sticky notes in all eight languages.

### Fixed
- **Hints follow the toolbar**, above it when docked at the bottom and below it when docked at the top, with space reserved on the inside of the viewport.
- **Reset zoom (100%) stays on one line** in Preferences.
- **Grid styles are hidden when the grid is off**, including keyboard menu navigation.

### Changed
- **A drawing-focused toolbar.** Hand, select, shapes, arrow/line, pen, text, sticky note and eraser are visible when space permits. A keyboard-accessible More tools menu contains presets, the library, Mermaid import and image insertion, followed by a quick action to start a live session. On narrow windows it also receives secondary tools; basic shapes and connectors remain visible.
- **Zoom and undo/redo stay in optional corner panels**, outside the drawing toolbar. The minimap remains independently toggleable.
- **Accessible toolbar tooltips.** Toolbar buttons show their name and shortcut in a tooltip on hover and on keyboard focus, instead of the browser's native one. Escape dismisses it, it stays open while the pointer moves onto it, and screen readers announce it as the button's description.
- **One menu in the top-left island.** The menu button shows a gear instead of the hamburger and holds file, export, share and preference actions; the top-right corner now only shows your live name and the people in a live session.
- **Export lives in the main menu.** The PNG and SVG entries of the menu are replaced by an Export submenu with PNG, SVG and HTML; saving as .markasso stays its own entry.
- **Share stays in the main menu**, after Export, for copy link, X, Reddit and Bluesky. Starting a live session is a direct More tools action, using your stored name; click the live name chip to edit it.
- **One place for insertion actions.** More tools lists presets, library, Mermaid import and image insertion in that order, with live collaboration in a separate group. The settings menu no longer duplicates them; the same actions are available on touch devices.
- **The main menu follows the WAI-ARIA menu pattern.** Export, share, preferences and language open as submenus on the right, on hover, click or the Right arrow. The arrow keys, Home and End move through the items, typing a letter jumps to the next item starting with it, Left or Escape closes a submenu, Escape closes the menu and returns focus to its button; Tab moves to the support and GitHub footer controls. Grid, minimap, grid type, canvas background, theme and language are announced as checkable items, and the language picker is a list instead of a dropdown.
- **The library sidebar reaches the top of the screen**, now that the top-right corner is free.
- **Shadows in the light theme.** Islands, panels and menus keep their shadows in the light theme too.

### Removed
- **The once/continuous label next to the tool lock button**, on desktop and mobile: the lock button already shows the mode.
- **The second toolbar row on narrow desktop windows**, replaced by the docked toolbar.
- **Shape labels wrap where you type them.** The label editor, the canvas and the SVG export share one wrap width per shape, so text breaks at the same points after editing; overlong words break inside the shape instead of overflowing. Editing a label that has no font of its own keeps the size and font it is drawn with.

---

## [1.13.3] - 2026-10-23

### Added
- **GitHub link in the menu.**

### Fixed
- **Connector labels stay readable.** Each label sits on a stretch of its own connector, away from other connectors, other labels and shapes, and is drawn on top with a solid background.
- **Connectors respect icon labels.** Arrows attach below or around an icon's label (wrapped lines included) instead of crossing the text, and elbow routes turn clear of it.
- **Elbow connectors run straight between nearly aligned shapes**, instead of making a small step.
- **SVG export matches the canvas.** Straight connectors stop at the shape border and follow moved shapes, straight connector labels and rhombus text are exported, labels wrap like on the canvas, rectangle corners are rounded.
- **Top bar on small screens.** On phones the top islands no longer overlap; on narrow desktop windows the tools move to a second row.

---

## [1.13.2] - 2026-10-23

### Fixed
- **Undo is per-user and stays in sync in live sessions.** Undo, redo and a cancelled drag revert only your own changes and reach everyone in the room, so a peer's (or an AI agent's) edits made in the meantime are kept. Before, they could be wiped on your screen, another participant's undo reverted your last action instead of theirs, and people joining later saw undone changes come back. If someone changed the same property after you, their change wins.

---

## [1.13.1] - 2026-10-21

### Added
- **What's new notice.** Visitors see the highlights of the release once (AI agents via MCP, flowcharts and connectors, icon library, text resize), with a link to the release notes. It is skipped when arriving from a shared or live link, so invited people see the board first.

### Changed
- **The interface follows the browser language.** Without a language picked in Settings, Markasso uses the first supported language of the browser and falls back to English (it used to default to Italian). The page `lang` attribute follows it.

---

## [1.13.0] - 2026-10-21

### Added
- **MCP server for AI agents.** A new `mcp/` package lets Claude, Codex, Gemini and local models (e.g. Gemma in LM Studio) work with Markasso diagrams through the [Model Context Protocol](https://modelcontextprotocol.io). Build it with `pnpm mcp:build`; setup for each client is in [`mcp/README.md`](mcp/README.md).
  - **Document mode:** agents add nodes (shapes, flowchart symbols, generic and Kubernetes icons) and connections by short keys, update or remove them, read the diagram back as compact text, then save a `.markasso` file, export SVG or publish a markasso.it share link.
  - **Live mode:** an agent joins a live session from its `?live=` link and draws on the shared board in real time. People see it in the room and follow its cursor; the agent reads what they drew. Board labels are passed to the model as data, not instructions.
  - Every change goes through Markasso's own reducer and validation, so agent diagrams match hand-made ones and undo works. Vendor icon packs stay out of reach of agents, as their terms require.
- **Layered auto-layout.** Nodes can be arranged in layers, top-to-bottom or left-to-right, following their connections (used by the MCP `diagram_layout` tool).

### Changed
- **Standalone text resizes proportionally.** Dragging a corner of a text box scales the font together with the box; dragging a side keeps the font size and reflows the text. Multi-selections with text keep their aspect ratio from the corners.
- **SVG export is a pure function** of the elements and the canvas color, shared by the app and the MCP server.

### Fixed
- **Elbow connectors pick the side facing the free space.** A floating elbow end between a wide shape and a shape below it no longer cuts across a neighbor: the side is chosen by the gap between the two shapes, as in draw.io.
- **Remote changes no longer steal your selection.** Elements created by another participant in a live session were selected on your screen; your selection now stays as it was.

---

## [1.12.1] - 2026-10-21

### Added
- **Connector routing and arrowhead styles on mobile.** The touch style sheet now offers the same routing (straight / elbow) and start/end head styles as the desktop panel.

### Fixed
- **Shapes stay editable after editing a label.** Editing a shape or connector label switched to the text tool and left it active, so the next clicks created text or reopened labels instead of selecting, and shapes (most visibly in the presets, e.g. the mind map) could no longer be moved, resized or restyled. Closing the editor (click elsewhere, `Esc`, `Enter` on connectors) now brings back the previous tool, and a click on the canvas closes the editor before it is handled, on touch devices too.
- **Live session messages are translated** in German, Spanish, French, Japanese, Portuguese and Chinese.
- **The manual's Mermaid section** describes the current Mermaid engine.

---

## [1.12.0] - 2026-10-21

### Added
- **Flowchart shapes.** Eight standard flowchart symbols, inserted from the Library sidebar or drawn with the shape tool (`S`): start/end, data (I/O), document, database, predefined process, preparation, manual input and delay.
  - Pick the symbol in the Library, the command palette, or the context panel, which also switches the symbol of selected shapes in place (undoable).
  - Shapes support labels, fill, stroke styles, hand-drawn roughness, rotation, PNG/SVG export and live sessions.
  - Connectors snap to the real outline of each symbol (the slanted side of a data block, the wavy edge of a document, the cylinder caps of a database).
  - Every symbol is defined once as a parametric outline; bounds, snapping, rendering, export and toolbar icons are all derived from it.
- **Connection ports.** While drawing or dragging a connector end, shapes show four ports (top, right, bottom, left). Dropping the end on a port pins it there: it stays on that point when the shape is moved, resized or rotated. Dropping anywhere else on the border keeps the floating behavior, where the end slides along the border to face the other side.
- **Elbow connectors.** Lines and arrows can be routed orthogonally (context panel, "Routing"). The route is recomputed from the two ends: attached ends leave their shape with a short stub, floating ends move to the mid-side port facing the other end, and labels sit at the middle of the route. Elbow connectors export to SVG with their full route.
- **Arrowhead styles.** Each end of a line or arrow can use an open head, a hollow or filled triangle, a hollow or filled diamond, or a circle (context panel, "Start head" / "End head"), covering UML inheritance, aggregation and composition. Closed heads cut the line out of their area, so hollow heads stay hollow on any background, including transparent PNG and SVG exports.

- **Architecture icons.** A new icon element ships with Markasso's own set of 20 generic architecture icons (server, database, cache, queue, storage, load balancer, firewall, router, network, API, container, function, browser, mobile and desktop apps, user, users, external system, secret, document). Icons follow the stroke and fill colors, the theme and rough mode, keep their proportions in any box, carry a label below, expose connection ports and export to SVG.
  - Icons from vendor packs imported by the user (coming next) are embedded in the diagram and are never recolored or rotated, as the vendors' terms require.

- **Library sidebar.** Shapes and icons live in a searchable sidebar on the right, modeled on Excalidraw's library: toggle it with `I` or the library button in the top-right toolbar. Click an item to insert it at the center of the view, or drag it onto the canvas; recently used items are listed first. On touch devices it opens as a bottom sheet from the tools menu. Icons are also reachable from the command palette (`Ctrl/Cmd+K`, "Icon: ...").
- **Kubernetes icons.** The official Kubernetes icon set (39 icons: control plane, nodes, workloads, networking, storage, config and access control) is available in the Library. It loads on demand in a separate chunk the first time its section is opened or searched, so the initial bundle is unchanged. Bundled under Apache-2.0, see `THIRD_PARTY_NOTICES.md`.
- **Import vendor icon packs (AWS, Azure, Google Cloud).** Their icons can't be redistributed, so Markasso doesn't ship them: download the official ZIP from the vendor ([AWS](https://aws.amazon.com/architecture/icons/), [Azure](https://learn.microsoft.com/azure/architecture/icons/), [Google Cloud](https://cloud.google.com/icons); the Library links to these pages) and import it from the Library ("Import icon pack"). The ZIP is read in the browser (no dependency, built on the platform's `DecompressionStream`), each icon is kept once (the largest size variant), named and grouped by the vendor's own categories, and its SVG is sanitized. Packs stay in this browser (IndexedDB) and can be deleted; only the icons placed in a diagram are embedded in it, so shared diagrams render for everyone. Vendor icons are never recolored or rotated.
- **Connectors stop under icon labels.** An arrow attached to the bottom of a labeled icon now ends below the label instead of crossing it.

### Fixed
- **Hidden elements no longer catch connector snaps.**
- **Arrows from Mermaid import and presets show the stroke style and roughness options** in the desktop context panel, as they already did on mobile.
- **Images redraw as soon as they finish loading** instead of keeping their placeholder until the next interaction.
- **SVG export centers shape labels vertically**, matching the canvas.
- **Hover highlight follows connected lines.** Hovering a line or arrow bound to shapes highlighted its stored endpoints instead of the drawn ones; it now traces the actual path, including elbow routes.

---

## [1.11.0] - 2026-10-19

### Changed
- **Mermaid import runs on the real Mermaid engine.** The hand-rolled parser and layout engine are gone, replaced by [`@excalidraw/mermaid-to-excalidraw`](https://github.com/excalidraw/mermaid-to-excalidraw) on top of the official `mermaid` package. Some features are worth adopting rather than reinventing: this one had already cost someone else far more hours than it would ever be worth re-spending here.
  - Flowcharts (including subgraphs and all node shapes), sequence, class, state and ER diagrams are converted to native, editable Markasso shapes with Mermaid's own layout.
  - Every other Mermaid diagram type (gantt, pie, gitGraph, mindmap, timeline, ...) is inserted as an SVG image instead of being rejected. gitGraph, previously converted to native shapes, now arrives as an image.
  - The Mermaid engine is lazy-loaded on the first import, so the initial bundle is unchanged.
  - The insert dialog stays open on a syntax error (showing Mermaid's error message) so the source can be fixed in place.
  - Pasting Mermaid text is recognized for all diagram types, not just `graph` / `flowchart` / `sequenceDiagram` / `gitGraph`.
- **First runtime dependency.** The core stays dependency-free; isolated, lazy-loaded features may now use a dependency when it saves re-solving a solved problem.

### Fixed
- **Live sessions keep each user's default style** and apply `APPLY_STYLE` deterministically across peers.
- **A remote `CREATE_ELEMENT` no longer hijacks a peer's `lastCreatedId` fallback.**
- **The people island is hidden entirely** when no other participants are present.

---

## [1.10.4] — 2026-09-02

### Fixed
- **No empty people button when alone** — the "people" button now appears only while a live session is connected **and** at least one other participant is present. Previously it showed as an empty dot for the host with nobody else in the room.

---

## [1.10.3] — 2026-09-02

### Fixed
- **Canvas background color now updates** — changing the board background color in Settings didn't repaint the canvas because the renderer caches the background and `applySettings` never invalidated that cache (a regression from the theme-cache perf work). It now invalidates the cache, so the new color appears immediately.

---

## [1.10.2] — 2026-09-02

### Fixed
- **Name input closes on confirm** — editing your name in the toolbar/mobile chip now closes the input on Enter (confirm) or Esc (cancel). Previously the chip was detached from the DOM when the input replaced it, so the input stayed open after confirming.

---

## [1.10.1] — 2026-09-02

### Fixed
- **No empty people button without a live session** — the "people" button (and name chip) are now shown only while a live session is actually connected, and hidden again on disconnect, instead of being revealed on page load for link-joiners. No more stray dot between Share and Export when there is no live session.

---

## [1.10.0] — 2026-09-02

### Added
- **Connected people list** — a new "people" button (toolbar) and a section in the mobile share sheet list everyone online during a live session, each with a color dot; your own row is editable inline to rename yourself.

### Fixed
- **Name chip visible to everyone** — the editable name chip previously only appeared for the host: the single-slot reveal registry meant the mobile bar's hidden element overwrote the desktop toolbar's, so link-joiners on desktop saw nothing. The registry now supports multiple callbacks, and both the chip and the people button are revealed for any participant (creator or link-joiner).

---

## [1.9.0] — 2026-09-02

### Added
- **Per-user identity in live sessions** — each client now sends a stable `clientId` (a random secret kept in `localStorage`) on connect. The server keys peers by it, so a peer keeps their name/color across reconnects and can only ever modify their own properties; a reconnect with the same `clientId` replaces any stale socket instead of creating a duplicate identity.
- **Daily cleanup of inactive sessions** — a cron trigger (`0 12 * * *`) enumerates every room tracked in the KV index and asks each `SessionRoom` Durable Object to reclaim itself when it has no connected peers and has been idle for 7 days, wiping its persisted command log.
- **Editable name chip in live sessions** — a small "your name" chip appears in the toolbar (and mobile action bar) while a live session is active; clicking it lets any participant — creator or link-joiner — set or change their own name at any time, broadcast to peers and remembered locally.
- **Animal guest names** — peers without a chosen name now get a fun two-word animal name (e.g. "Sunny Otter") instead of "Guest42".

### Security
- **Server-side enforcement of per-user properties** — the presence handler is keyed by the connection's `clientId`, so a peer can never update another peer's name/color. Per-user drawing settings (stroke color, fill, width, tool) remain ephemeral and are never shared, while the shared scene stays fully collaborative.

---

## [1.8.1] — 2026-09-01

### Fixed
- **Live sessions on mobile / Firefox** — clipboard copy for share/live links now reflects the real result of `navigator.clipboard.writeText` instead of always trusting the legacy `execCommand('copy')` fallback, which could silently report success on Firefox mobile without actually copying anything.
- **Mobile share entry point** — the bottom action bar had no way to copy a share link or start a live session; added a share button with a "Go live" / "Copy link" bottom sheet.
- **Mobile bottom-sheet CSS specificity** — the style and share bottom sheets never appeared on touch because an ID selector's `display:none` always beat the class-based rule meant to show them.
- **Remote cursor on touch** — drawing with touch never broadcast the local cursor (only `mousemove` did), so a mobile participant's pointer was invisible to other peers even though their drawings synced.
- **Live session resilience** — `joinLiveSession` now reconnects with capped exponential backoff on drop, and every entry point (toolbar, mobile bar, shared-link join) shows a toast on disconnect/reconnect instead of silently losing sync.
- **Settings menu on short mobile screens** — the hamburger menu had no height cap or scroll, so entries past the visible area were unreachable; it's now capped to the available space and scrolls.

---

## [1.8.0] — 2026-09-01

### Added
- **Real-time collaboration** — share a live editing session via a `?live=roomId` link; multiple people draw on the same infinite canvas over WebSocket, powered by a Cloudflare Durable Object. Each room gets its own `SessionRoom` DO that serializes commands into the room's log (persisted in DO storage) and relays them to peers in server order.
- **Seeding** — "Share live session" publishes your current board into a new room, so invitees open it already populated.
- **Remote cursors + presence** — other participants' cursors and name tags are rendered on the canvas (screen-space, drawn in the rAF loop); name is set once and remembered in `localStorage`.
- **Convergent undo/redo** — `UNDO` / `REDO` are shared session commands relayed in global order; ephemeral view commands (pan/zoom/selection/tool) stay local per peer.
- **Room limits** — max 20 peers per room, a per-peer command rate limit, and a max message size guard on the Worker.

### Changed
- **Undo model** moved from per-client (A) to shared/convergent (B): undo now propagates across collaborators in server order.
- `History` gained `applyRemote`, `resetForLiveReplay`, and `setOnCommand`; ephemeral-command classification moved to a shared `engine/ephemeral.ts` usable both client- and server-side.

---

## [1.7.4] — 2026-09-01

### Fixed
- **Guide not scrollable on iOS** — the content panel grew beyond the card instead of scrolling (missing `min-height` in the mobile column layout); also re-enabled panning inside the modal and kept safe-area padding from overflowing the card.

---

## [1.7.3] — 2026-09-01

### Fixed
- **Guide on mobile** — the guide panel is now usable on phones and touch devices: it goes full-screen, the sidebar becomes a horizontally scrollable row of section chips, the search field meets tap-target size and no longer triggers iOS zoom on focus, and tables and code blocks scroll inside their own box instead of overflowing.

---

## [1.7.2] — 2026-09-01

### Fixed
- **Guide panel overflow** — long sections could render past the panel's rounded bottom edge instead of scrolling inside it.

### Added
- **Guide navigation** — a sidebar lists every section with a search filter, and the active section is highlighted automatically as you scroll.

---

## [1.7.1] — 2026-09-01

### Changed
- **Guide** — the "Guide" menu item now opens an in-app panel rendering the user manual, instead of linking out to the file on GitHub.

---

## [1.7.0] — 2026-09-01

### Added
- **Report a problem** — a form in the menu lets you send a bug/visual/performance report straight to a public GitHub issue on this repository, no login required.

### Removed
- **Gesture Mode** — the optional webcam hand-tracking feature (selecting, dragging, drawing and deleting shapes via hand poses) has been removed. Despite repeated tuning, the underlying MediaPipe hand-tracking model's own periodic re-detection cycle produced visible cursor/anchor jumps that could not be reliably corrected from application code without breaking legitimate fast-stroke tracking.

---

## [1.6.2] — 2026-08-19

### Fixed
- **Freehand pen tool pausing mid-stroke** — resuming a stroke after a brief pause no longer produces a pressure spike (a sudden thick blob right at the resume point); the stale time gap from the pause is no longer read as "very slow movement"
- **Session autosave data loss** — a single malformed element saved to the browser session (e.g. a corrupted text element) no longer wipes out every other valid shape on the next reload; only the malformed element is dropped

---

## [1.6.1] — 2026-08-18

### Changed
- **Freehand pen tool** — strokes now taper with pressure (real stylus pressure, or synthesized from gesture speed for mouse/trackpad) instead of a constant width; point sampling scales with zoom so curves stay smooth when zoomed in; the live preview no longer lags behind the cursor while drawing
- **Renderer** — canvas theme lookups (background color, dark/light) are now cached instead of re-read from the DOM every frame; elements outside the visible viewport are skipped during render, improving performance on boards with many elements

---

## [1.6.0] — 2026-08-12

### Added
- **Gesture resize** — pinch a corner of the selected element's bounding box to resize it, reusing the same math as the mouse resize handles
- **Gesture rotation** — pinch the rotation handle above a selected element to rotate it, with a wide gesture-friendly hit tolerance
- **Gesture select-all** — hold an open, still hand for ~600ms while idle to select every unlocked element
- **Gesture delete (double-pinch)** — pinch an element, release without dragging it, then pinch it again within half a second to delete it immediately; replaces the earlier fist-hold delete, whose fingertip tracking was unreliable once the hand closed

### Changed
- **Gesture camera frame rate** — raised from 30fps to 60fps to match the inference loop's ceiling
- **Gesture hit tolerances** — now scale with the tracked hand's apparent size, so a smaller or more distant hand isn't less forgiving than one held close to the camera
- **Element resize floor** — now scales with the current zoom instead of a fixed world-space minimum, so an element can no longer be resized down to an invisible sub-pixel size at low zoom

### Fixed
- **Curved gesture strokes** — tracing a curved shape (e.g. a "C") no longer stalls mid-stroke on a single frame of ambiguous hand-pose classification
- **Canvas vanishing below ~13% zoom** — the default dot/line grid's cell count grew as roughly 1/zoom², stalling the render frame for seconds; grid step is now capped so on-screen cell spacing never drops below a fixed floor
- **Zero-area ellipse rendering** — guards against a NaN in the rough-stroke perturbation that could silently drop the whole stroke path
- **Gesture camera field of view** — requesting a 4:3 frame from a typically 16:9 camera cropped the sides of the sensor, narrowing the real horizontal area a hand could move within before tracking dropped; now requests 16:9 at roughly the same pixel count

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
