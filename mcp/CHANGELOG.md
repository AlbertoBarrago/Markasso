# Changelog

All notable changes to `@markasso/mcp` are documented here. The MCP server is versioned independently from the Markasso app; releases are tagged `mcp-v<version>`.

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
