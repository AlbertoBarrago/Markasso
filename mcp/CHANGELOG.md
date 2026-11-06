# Changelog

All notable changes to `@markasso/mcp` are documented here. The MCP server is versioned independently from the Markasso app; releases are tagged `mcp-v<version>`.

---

## [Unreleased]

### Fixed
- **Titles no longer push the diagram off-center.** `diagram_layout` placed a text node that no connection touches (a title, a caption) beside the diagram as a group of its own, so the exported picture had a wide empty band on one side. Such text nodes now sit centered above the laid-out diagram, stacked in the order they were added. Connected text nodes are laid out as before.

---

## [0.6.0] - 2026-11-06

### Added
- **Layout warnings.** `diagram_layout`, `diagram_read` and `diagram_export_png` now report, by node key and connection id, connections drawn through a node, labels on top of a node or another label, crossing connections (with the count) and overlapping nodes, each with a hint on what to try. An agent that can't see the picture still knows when it is unclear. Nothing is added when the diagram is clear.
- **PNG export without the image.** `diagram_export_png` takes `returnImage` (default `true`). With a `path` and `returnImage: false` it writes the file and answers in text only, so an agent refreshing a live preview doesn't spend context on an image it won't look at.

### Changed
- **`diagram_export_png` writes its file atomically.** The PNG goes to a temporary file in the same folder and is then renamed over the target, so a viewer polling the file never reads a partial image.

### Fixed
- **Arrows no longer cross a node after a layout.** `diagram_layout` and `diagram_update` could leave a connector anchored to the wrong side of a moved node (its old center landing on the new border), so the arrow was drawn through it. Connector ends now face the other node again after every move or resize, and each `diagram_layout` or `diagram_update` call is a single undo step.

---

## [0.5.1] - 2026-11-04

### Fixed
- **Node keys as the model wrote them.** A node added as "Client" can be connected, updated, removed or laid out as "Client" as well as "client": tools first match the exact key, then the key as `diagram_add_nodes` normalizes it.

---

## [0.5.0] - 2026-11-04

### Added
- **Licence for live drawing.** `live_join` sends the key in `MARKASSO_LICENSE` (if set) as its first message, and explains how to get a Markasso Cloud licence when a live room refuses agents without one. Everything else stays free.

---

## [0.4.2] - 2026-10-28

### Fixed
- **Saved boards keep connectors where they are drawn.** After `diagram_layout` or `diagram_update`, `diagram_save` and `diagram_share` used to write connectors with the ends they had when connected; they now store the ends the app draws, so the file matches the board.

---

## [0.4.1] - 2026-10-28

### Fixed
- **`live_join` points to the right place in the app.** The `link` parameter now says the live link comes from **⋯ More tools → Start live session** (or the prompt copied by **Invite AI agent**), not from a Share menu that no longer exists.

---

## [0.4.0] - 2026-10-27

### Added
- **Font size.** `diagram_add_nodes` and `diagram_update` take `fontSize` (6 to 400 px) for text nodes and for shape and icon labels; `diagram_connect` and `diagram_update_edge` take it for connector labels. Auto-sized nodes grow to fit a larger font, so a heading stays on one line. `diagram_read` shows sizes that differ from the default.

### Changed
- **Node sizing shares the app's label rules:** the same wrap width and label font defaults as the canvas, and overlong words break inside the node as they do in the app.

---

## [0.3.0] - 2026-10-23

### Added
- **`diagram_export_png`.** Renders the diagram (same geometry as the app) and returns the image, so an agent can check its work; it can also save the file.
- **`diagram_disconnect` and `diagram_update_edge`.** Remove or change a single connection by id or by its node keys, without recreating the nodes. `diagram_read` now shows connection ids.
- **`diagram_share` tells when the link expires.**

### Changed
- **Nodes fit their text.** Nodes added without width/height are sized from their label, text nodes from their content, and they resize when the label changes.
- **Layout leaves room for icon labels**, and connectors attach and route around them.

### Fixed
- **Connectors follow nodes moved by `diagram_layout` or `diagram_update` in exported SVGs.** Straight connectors were drawn from where the nodes were when they were connected.
- **The SVG export matches the app:** straight connector labels and rhombus text are no longer missing, straight connectors stop at the node border, and labels wrap like on the canvas.
- **Connector labels no longer sit on other connectors**, and have a solid background.
- **Elbow connectors between nearly aligned nodes run straight** instead of making a small step.

---

## [0.2.0] - 2026-10-23

### Added
- **Published on npm as `@markasso/mcp`.** Run it with `npx -y @markasso/mcp@latest`: no clone or build needed, and agents pick up new versions on restart.

### Changed
- **Undo in live sessions is per-user.** The agent's undo reverts only its own changes and reaches the room as a patch, so edits people made in the meantime are kept. Bare `UNDO`/`REDO` from outdated clients are ignored. Requires Markasso 1.13.2 or later on the board.
- **The server reports its real version** to MCP clients (it was hardcoded to 0.1.0).

---

## [0.1.0] - 2026-10-21

### Added
- **First release** (shipped with Markasso 1.13.0, built from the repository). Document mode (create, read and edit diagrams, save `.markasso`, export SVG, publish share links) and live mode (join a live session and draw on the shared board).
