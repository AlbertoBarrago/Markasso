# Changelog

All notable changes to `@markasso/mcp` are documented here. The MCP server is versioned independently from the Markasso app; releases are tagged `mcp-v<version>`.

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
