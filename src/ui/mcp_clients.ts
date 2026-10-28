/**
 * Setup instructions for connecting AI agents to Markasso through the MCP
 * server published as `@markasso/mcp`. Pure data, kept apart from the modal
 * (mcp_setup.ts) so the snippets can be tested without a DOM. They mirror
 * mcp/README.md, which stays the reference for every client.
 */

/** `@latest` makes clients pick up new server releases on restart. */
export const MCP_PACKAGE = '@markasso/mcp@latest';

export const MCP_DOCS_URL =
  'https://github.com/AlbertoBarrago/Markasso/blob/main/mcp/README.md';

export interface McpClient {
  readonly id: string;
  readonly name: string;
  /** i18n key telling where the snippet goes; `{{file}}` is {@link file}. */
  readonly whereKey: 'mcpWhereTerminal' | 'mcpWhereConfig';
  readonly file?: string;
  readonly snippet: string;
}

/** Written by hand to keep `args` on one line, as in mcp/README.md. */
const serverConfig = `{
  "mcpServers": {
    "markasso": {
      "command": "npx",
      "args": ["-y", "${MCP_PACKAGE}"]
    }
  }
}`;

/** Clients in tab order: CLIs first, they need a single command. */
export function buildMcpClients(): McpClient[] {
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      whereKey: 'mcpWhereTerminal',
      snippet: `claude mcp add markasso -- npx -y ${MCP_PACKAGE}`,
    },
    {
      id: 'codex',
      name: 'Codex',
      whereKey: 'mcpWhereTerminal',
      snippet: `codex mcp add markasso -- npx -y ${MCP_PACKAGE}`,
    },
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      whereKey: 'mcpWhereConfig',
      file: 'claude_desktop_config.json',
      snippet: serverConfig,
    },
    {
      id: 'gemini',
      name: 'Gemini CLI',
      whereKey: 'mcpWhereConfig',
      file: '~/.gemini/settings.json',
      snippet: serverConfig,
    },
    {
      id: 'lm-studio',
      name: 'LM Studio',
      whereKey: 'mcpWhereConfig',
      file: 'mcp.json',
      snippet: serverConfig,
    },
  ];
}

/**
 * Prompt that brings an agent into a live session: pasted into any client
 * with the server installed, it makes the agent call `live_join` on the link.
 * Kept in English because it is read by the model, not shown in the UI.
 */
export function buildLiveInvitePrompt(liveUrl: string): string {
  return `Join this Markasso live session with the markasso MCP server (live_join) and draw with me: ${liveUrl}`;
}
