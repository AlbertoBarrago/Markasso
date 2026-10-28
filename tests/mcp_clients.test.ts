import { describe, expect, it } from 'vitest';
import en from '../src/i18n/locales/en.json';
import {
  buildLiveInvitePrompt,
  buildMcpClients,
  MCP_PACKAGE,
} from '../src/ui/mcp_clients';

describe('MCP client setup', () => {
  const clients = buildMcpClients();

  it('has unique client ids', () => {
    const ids = clients.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('launches the published package in every snippet', () => {
    for (const client of clients)
      expect(client.snippet, client.id).toContain(MCP_PACKAGE);
  });

  it('gives CLIs a single add command', () => {
    for (const client of clients.filter(
      (c) => c.whereKey === 'mcpWhereTerminal',
    )) {
      expect(client.snippet, client.id).toMatch(/^\w+ mcp add markasso -- /);
      expect(client.snippet, client.id).not.toContain('\n');
    }
  });

  it('gives config clients valid mcpServers JSON and a file to put it in', () => {
    for (const client of clients.filter(
      (c) => c.whereKey === 'mcpWhereConfig',
    )) {
      expect(client.file, client.id).toBeTruthy();
      expect(JSON.parse(client.snippet)).toEqual({
        mcpServers: {
          markasso: { command: 'npx', args: ['-y', MCP_PACKAGE] },
        },
      });
    }
  });

  it('has an English text for every placement hint', () => {
    for (const client of clients)
      expect(en[client.whereKey], client.id).toBeTruthy();
  });

  it('puts the live link in the invite prompt', () => {
    const url = 'https://markasso.it/?live=abc123';
    const prompt = buildLiveInvitePrompt(url);
    expect(prompt).toContain(url);
    expect(prompt).toContain('live_join');
  });
});
