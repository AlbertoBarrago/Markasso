import { t } from '../i18n';
import { buildMcpClients, MCP_DOCS_URL, type McpClient } from './mcp_clients';
import { copyToClipboard } from './share_actions';

export interface McpSetupHandle {
  open(): void;
}

const openListeners: (() => void)[] = [];

/** Register a callback run every time the setup dialog opens (idle tips). */
export function onMcpSetupOpen(fn: () => void): void {
  openListeners.push(fn);
}

const EXAMPLE_KEYS = ['mcpExample1', 'mcpExample2', 'mcpExample3'] as const;

/**
 * "Connect AI agent" dialog: one tab per MCP client with its install snippet
 * and a copy button, plus example prompts. Reached from the menu, the command
 * palette and the live-session invite.
 */
export function initMcpSetup(appEl: HTMLElement): McpSetupHandle {
  const clients = buildMcpClients();
  let modalEl: HTMLElement | null = null;
  /** Remembered across openings: people usually return for the same client. */
  let activeId = clients[0]!.id;

  function open(): void {
    if (modalEl) return;

    modalEl = document.createElement('div');
    modalEl.id = 'mcp-setup-modal';
    modalEl.innerHTML = `
      <div class="mcp-card" role="dialog" aria-modal="true" aria-labelledby="mcp-title">
        <div class="mcp-header">
          <h2 class="mcp-title" id="mcp-title">${t('connectAiAgent')}</h2>
          <button class="guide-close mcp-close" aria-label="${t('close')}">&times;</button>
        </div>
        <p class="mcp-desc">${t('mcpSetupDesc')}</p>
        <div class="mcp-tabs" role="tablist" aria-label="${t('connectAiAgent')}"></div>
        <div class="mcp-panel" role="tabpanel">
          <p class="mcp-where"></p>
          <div class="mcp-snippet">
            <pre><code></code></pre>
            <button class="mcp-copy" type="button">${t('mcpCopy')}</button>
          </div>
        </div>
        <h3 class="mcp-subtitle">${t('mcpExamplesTitle')}</h3>
        <ul class="mcp-examples">
          ${EXAMPLE_KEYS.map((key) => `<li>${t(key)}</li>`).join('')}
        </ul>
        <p class="mcp-live">${t('mcpLiveHint')}</p>
        <a class="mcp-docs" href="${MCP_DOCS_URL}" target="_blank" rel="noopener noreferrer">${t('mcpDocs')}</a>
      </div>
    `;

    const tabsEl = modalEl.querySelector<HTMLElement>('.mcp-tabs')!;
    const panelEl = modalEl.querySelector<HTMLElement>('.mcp-panel')!;
    const whereEl = modalEl.querySelector<HTMLElement>('.mcp-where')!;
    const codeEl = modalEl.querySelector<HTMLElement>('.mcp-snippet code')!;
    const copyBtn = modalEl.querySelector<HTMLButtonElement>('.mcp-copy')!;

    // WAI-ARIA tabs with automatic activation: arrows move and select,
    // only the selected tab is in the tab order.
    const tabs = clients.map((client) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'mcp-tab';
      tab.id = `mcp-tab-${client.id}`;
      tab.setAttribute('role', 'tab');
      tab.textContent = client.name;
      tab.addEventListener('click', () => select(client));
      tabsEl.appendChild(tab);
      return tab;
    });

    function select(client: McpClient): void {
      activeId = client.id;
      clients.forEach((c, i) => {
        const selected = c.id === client.id;
        tabs[i]!.setAttribute('aria-selected', String(selected));
        tabs[i]!.tabIndex = selected ? 0 : -1;
      });
      panelEl.setAttribute('aria-labelledby', `mcp-tab-${client.id}`);
      // Snippets and file names go in as text: they are shown, not parsed.
      whereEl.textContent = t(client.whereKey).replace(
        '{{file}}',
        client.file ?? '',
      );
      codeEl.textContent = client.snippet;
      copyBtn.textContent = t('mcpCopy');
    }

    tabsEl.addEventListener('keydown', (e) => {
      const current = clients.findIndex((c) => c.id === activeId);
      let next: number;
      if (e.key === 'ArrowRight') next = (current + 1) % clients.length;
      else if (e.key === 'ArrowLeft')
        next = (current - 1 + clients.length) % clients.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = clients.length - 1;
      else return;
      e.preventDefault();
      select(clients[next]!);
      tabs[next]!.focus();
    });

    copyBtn.addEventListener('click', () => {
      const client = clients.find((c) => c.id === activeId)!;
      void copyToClipboard(client.snippet).then((ok) => {
        // On failure the snippet stays selectable in the <pre> above.
        copyBtn.textContent = ok ? t('mcpCopied') : t('mcpCopyFailed');
      });
    });

    const close = (): void => {
      if (!modalEl) return;
      const el = modalEl;
      el.classList.add('mcp-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
      modalEl = null;
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    modalEl
      .querySelector<HTMLButtonElement>('.mcp-close')!
      .addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });
    document.addEventListener('keydown', onKey);

    const initial = clients.find((c) => c.id === activeId) ?? clients[0]!;
    select(initial);
    appEl.appendChild(modalEl);
    requestAnimationFrame(() =>
      tabs[clients.indexOf(initial)]?.focus({ preventScroll: true }),
    );
    for (const fn of openListeners) fn();
  }

  return { open };
}
