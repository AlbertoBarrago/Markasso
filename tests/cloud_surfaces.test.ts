import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import { History } from '../src/engine/history';
import type { SelectTool } from '../src/tools/select_tool';

vi.mock('../src/i18n', () => ({
  t: (key: string) => key,
  getLocale: () => 'en',
  LOCALES: [],
}));
vi.mock('../src/ui/people_list', () => ({
  initPeopleList: () => {
    throw new Error('share sheet ready');
  },
}));
/** Minimal DOM capture: tests inspect rendered entries without a browser dependency. */
class Node {
  id = '';
  className = '';
  textContent = '';
  innerHTML = '';
  value = '';
  style = { display: '', setProperty: vi.fn() };
  classList = { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() };
  dataset = {};
  children: Node[] = [];
  queries = new Map<string, Node>();
  appendChild(node: Node) {
    this.children.push(node);
    return node;
  }
  append(node: Node) {
    this.appendChild(node);
  }
  prepend(node: Node) {
    this.appendChild(node);
  }
  getAttribute() {
    return null;
  }
  setAttribute() {}
  addEventListener() {}
  querySelector(selector: string): Node {
    if (selector === '#menu-list') throw new Error('menu ready');
    let node = this.queries.get(selector);
    if (!node) {
      node = new Node();
      this.queries.set(selector, node);
    }
    return node;
  }
  querySelectorAll() {
    return [];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each([false, true])('cloud UI enabled=%s', (enabled) => {
  it('renders the menu submenu, mobile actions and palette consistently', async () => {
    vi.stubEnv('VITE_CLOUD_ENABLED', String(enabled));
    vi.doMock('../src/ui/cloud_boards', async (importOriginal) => {
      const original =
        await importOriginal<typeof import('../src/ui/cloud_boards')>();
      return { ...original, cloudActionAvailable: () => true };
    });

    const nodes: Node[] = [];
    const root = new Node();
    const keydown = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('document', {
      body: root,
      documentElement: root,
      createElement: () => {
        const node = new Node();
        nodes.push(node);
        return node;
      },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, callback: unknown) => {
        if (name === 'keydown')
          keydown.mockImplementation(callback as () => void);
      },
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    const history = new History(createScene());
    const { initSettings } = await import('../src/ui/settings');
    const element = root as unknown as HTMLElement;
    const noop = () => {};
    expect(() =>
      initSettings(element, element, history, noop, noop, noop, noop),
    ).toThrow('menu ready');
    const menu = nodes.find((node) =>
      node.innerHTML.includes('id="menu-list"'),
    )!.innerHTML;
    expect(menu.includes('id="menu-cloud"')).toBe(enabled);
    expect(menu.includes('id="menu-cloud-note"')).toBe(enabled);
    const actions = [
      'cloudSave',
      'cloudReadLink',
      'cloudEditLink',
      'cloudMac',
      'cloudDuplicate',
      'cloudLicense',
      'cloudSubscription',
    ];
    for (const action of actions)
      expect(menu.includes(`id="menu-${action}"`)).toBe(enabled);
    if (enabled) {
      const submenu = menu.split('id="menu-cloud-sub"')[1]!.split('</ul>')[0]!;
      for (const action of actions)
        expect(submenu).toContain(`id="menu-${action}"`);
    }

    const { initMobileActionBar } = await import('../src/ui/mobile_action_bar');
    expect(() => initMobileActionBar(element, history)).toThrow(
      'share sheet ready',
    );
    const mobile = nodes.find((node) => node.id === 'mobile-share-sheet')!;
    // The licence note comes first, then one button per cloud action.
    expect(mobile.children.map((node) => node.textContent)).toEqual(
      enabled ? ['cloudMenuNote', ...actions] : [],
    );

    const { initCommandPalette } = await import('../src/ui/command_palette');
    initCommandPalette(history, {} as SelectTool, noop);
    keydown({ key: 'k', ctrlKey: true, preventDefault: noop });
    const palette = nodes.find((node) => node.id === 'cmd-palette-overlay')!;
    const list = palette.querySelector('#cmd-list');
    const labels = list.children.map((node) => node.innerHTML).join('');
    for (const action of actions) expect(labels.includes(action)).toBe(enabled);
  });
});
