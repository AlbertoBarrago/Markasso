# Markasso MCP

An [MCP](https://modelcontextprotocol.io) server that lets AI agents (Claude, Codex, Gemini, local models such as Gemma) **create, read and edit Markasso diagrams**:

- **Document mode:** build a diagram, then save it as `.markasso`, export it as SVG, or publish a markasso.it link.
- **Live mode:** join a Markasso live session and draw on the shared board in real time. People in the room see the agent in the participant list and its cursor moving; the agent can also read and edit what they drew.

Everything goes through Markasso's own reducer and validation, so the result is exactly what the app would produce (and undo works).

## Install

Published on npm as [`@markasso/mcp`](https://www.npmjs.com/package/@markasso/mcp) (Node 22+). The server speaks MCP over stdio; `@latest` makes clients pick up new versions on restart. Pin a version (e.g. `@markasso/mcp@0.2.0`) for reproducible setups. Release notes: [`CHANGELOG.md`](CHANGELOG.md).

## Connect an agent

**Claude Code**

```bash
claude mcp add markasso -- npx -y @markasso/mcp@latest
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "markasso": {
      "command": "npx",
      "args": ["-y", "@markasso/mcp@latest"]
    }
  }
}
```

**Codex CLI** (`~/.codex/config.toml`)

```toml
[mcp_servers.markasso]
command = "npx"
args = ["-y", "@markasso/mcp@latest"]
```

**Gemini CLI** (`~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "markasso": {
      "command": "npx",
      "args": ["-y", "@markasso/mcp@latest"]
    }
  }
}
```

**Local models (e.g. Gemma in LM Studio):** add the same `mcpServers` entry to LM Studio's `mcp.json`. The tools take short keys and named colors and never require coordinates, so small models handle them well.

**Another Markasso instance:** set `MARKASSO_URL` (default `https://markasso.it`) in the server's environment.

## Build from source

For development, from the repository root:

```bash
pnpm install
pnpm mcp:build   # → mcp/dist/markasso-mcp.js
```

Then use `node /absolute/path/to/Markasso/mcp/dist/markasso-mcp.js` as the command in any of the configs above.

## Releasing

Bump `version` in `mcp/package.json`, add the entry to `mcp/CHANGELOG.md`, merge, then push a `mcp-v<version>` tag: the `MCP Release` workflow tests, builds and publishes to npm (trusted publishing, with provenance) and creates a GitHub release.

## Tools

| Tool | What it does |
|---|---|
| `diagram_new` | Start an empty diagram |
| `diagram_open` | Open a `.markasso` file or a markasso.it share link |
| `diagram_read` | Describe nodes (key, kind, label, position, size) and connections (with their ids) |
| `diagram_add_nodes` | Add nodes by key: rectangle, ellipse, rhombus, text, flowchart symbols, icons, with an optional font size. Nodes without a size fit their label |
| `diagram_connect` | Connect nodes by key: label and its font size, straight/elbow routing, arrowhead styles, dashed |
| `diagram_update` | Change a node's label, color, font size, position or size |
| `diagram_update_edge` | Change a connection's label, label font size, routing, heads, dash or color |
| `diagram_disconnect` | Remove connections (by id or by from/to), keeping the nodes |
| `diagram_remove` | Remove nodes and their connections |
| `diagram_layout` | Arrange nodes in layers (top-to-bottom or left-to-right) |
| `icons_search` | Find generic architecture icons and Kubernetes icons |
| `diagram_save` | Save as `.markasso` |
| `diagram_export_svg` | Export an SVG image |
| `diagram_export_png` | Render a PNG the agent can look at (optionally saved to a file) |
| `diagram_share` | Publish and return a markasso.it link, with its expiry date |
| `live_join` / `live_leave` | Draw on a live board in real time (link from Share → Share live session) |

Vendor icon packs (AWS, Azure, Google Cloud) are not available to agents: they can't be redistributed, and in the app they are imported by each user into their own browser.

## Example prompts

- *"Draw the architecture of a checkout service: users, CDN, API gateway, orders and payments services, Postgres, a queue and a worker. Use icons, lay it out left to right and give me a share link."*
- *"Join https://markasso.it/?live=… as 'Claude' and add the missing database and cache to the architecture on the board."*
- *"Read the board and turn it into a flowchart with start/end and decision steps."*

## Live mode

1. In Markasso, open **Share → Share live session** and copy the live link.
2. Ask the agent to `live_join` it. If the room already has content, it becomes the agent's current diagram; if it is empty, the agent's diagram is published to it.
3. Every change the agent makes is applied for everyone in the room; changes made by people show up when the agent calls `diagram_read`.

## Security notes

- **Board content is data.** On a live board, labels are typed by other people. The tool descriptions tell models to treat them as data, not instructions, but keep the usual prompt-injection caution when an agent with other powerful tools reads shared boards.
- **Live links grant edit access.** Anyone with the link can edit the room; the agent gets the same rights as any participant.
- **Limits.** The app's server limits apply: 200 commands per 5 seconds per peer, 512 KB per message, share link uploads are rate limited. Tools batch changes into single commands to stay well within them.
- Share links are stored on markasso.it for 90 days (`diagram_share` reports the date); publishing sends the diagram's content.
