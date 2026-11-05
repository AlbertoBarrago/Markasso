import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import type { Element } from '../src/elements/element';
import { History } from '../src/engine/history';
import { clearCanvas } from '../src/ui/clear_canvas';
import { confirmDialog, dialog, notice } from '../src/ui/dialog';

vi.mock('../src/i18n', () => ({ t: (key: string) => key }));

/** Minimal DOM stand-in: the dialog only builds a tree and listens for clicks. */
class Node extends EventTarget {
  textContent = '';
  className = '';
  id = '';
  type = '';
  value = '';
  placeholder = '';
  autocomplete = '';
  readOnly = false;
  autofocus = false;
  children: Node[] = [];
  dataset: Record<string, string> = {};
  focus = vi.fn();
  select = vi.fn();
  showModal = vi.fn();
  close = vi.fn();
  remove = vi.fn();
  append(...nodes: Node[]) {
    this.children.push(...nodes);
  }
  setAttribute() {}
}
const all = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => all(child)),
];

let body: Node;
let previous: Node;

beforeEach(() => {
  body = new Node();
  previous = new Node();
  vi.stubGlobal('HTMLElement', Node);
  vi.stubGlobal('document', {
    body,
    activeElement: previous,
    documentElement: { getAttribute: () => null },
    createElement: () => new Node(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const modal = (): Node => body.children.at(-1)!;
const button = (choice: string): Node =>
  all(modal()).find((node) => node.dataset.choice === choice)!;

describe('dialog', () => {
  it('shows a notice with a single focused OK and returns focus', async () => {
    const done = notice('Title', 'Message');
    const nodes = all(modal());
    expect(modal().showModal).toHaveBeenCalled();
    expect(modal().className).toBe('app-dialog');
    expect(nodes.find((n) => n.className === 'cd-title')?.textContent).toBe(
      'Title',
    );
    expect(nodes.some((n) => n.className === 'cd-kicker')).toBe(false);
    expect(nodes.some((n) => n.dataset.choice === 'dialogCancel')).toBe(false);
    expect(button('dialogOk').autofocus).toBe(true);
    button('dialogOk').dispatchEvent(new Event('click'));
    await done;
    expect(modal().remove).toHaveBeenCalled();
    expect(previous.focus).toHaveBeenCalled();
  });

  it('confirms only with the confirming button', async () => {
    const options = { title: 'T', message: 'M', confirmKey: 'clear' };
    let result = confirmDialog(options);
    button('clear').dispatchEvent(new Event('click'));
    expect(await result).toBe(true);
    result = confirmDialog(options);
    button('dialogCancel').dispatchEvent(new Event('click'));
    expect(await result).toBe(false);
    result = confirmDialog(options);
    modal().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await result).toBe(false);
  });

  it('starts a destructive dialog on Cancel and marks the action', async () => {
    const result = confirmDialog({
      title: 'T',
      message: 'M',
      confirmKey: 'clear',
      danger: true,
    });
    expect(button('dialogCancel').autofocus).toBe(true);
    expect(button('clear').autofocus).toBe(false);
    expect(button('clear').className).toBe('cd-cta cd-danger');
    button('dialogCancel').dispatchEvent(new Event('click'));
    await result;
  });

  it('resolves with the typed text of an editable field', async () => {
    const result = dialog({
      kicker: 'Kicker',
      title: 'T',
      message: 'M',
      choices: [{ key: 'store', primary: true }],
      field: { label: 'Key', type: 'password' },
    });
    const input = all(modal()).find((n) => n.className === 'cd-input')!;
    expect(input.type).toBe('password');
    expect(
      all(modal()).find((n) => n.className === 'cd-kicker')?.textContent,
    ).toBe('Kicker');
    input.value = 'MKC-KEY';
    button('store').dispatchEvent(new Event('click'));
    expect(await result).toBe('MKC-KEY');
  });

  it('shows a read-only value to copy and resolves with the choice', async () => {
    const result = dialog({
      title: 'T',
      message: 'M',
      field: { label: 'Link', value: 'https://markasso.it/#x', readOnly: true },
    });
    const input = all(modal()).find((n) => n.className === 'cd-input')!;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe('https://markasso.it/#x');
    input.dispatchEvent(new Event('focus'));
    expect(input.select).toHaveBeenCalled();
    button('dialogOk').dispatchEvent(new Event('click'));
    expect(await result).toBeNull();
  });
});

describe('clear canvas', () => {
  const element: Element = {
    id: 'rect',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 20,
    height: 10,
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  };
  const board = () =>
    new History({
      ...createScene(),
      elements: [element, { ...element, id: 'b' }],
    });

  beforeEach(() => vi.stubGlobal('navigator', { platform: 'MacIntel' }));

  it('keeps the canvas on Cancel', async () => {
    const history = board();
    const result = clearCanvas(history);
    expect(button('clearCanvasConfirm').className).toBe('cd-cta cd-danger');
    button('dialogCancel').dispatchEvent(new Event('click'));
    expect(await result).toBe(false);
    expect(history.present.elements).toHaveLength(2);
  });

  it('clears everything in one undoable step', async () => {
    const history = board();
    const result = clearCanvas(history);
    button('clearCanvasConfirm').dispatchEvent(new Event('click'));
    expect(await result).toBe(true);
    expect(history.present.elements).toHaveLength(0);
    history.undo();
    expect(history.present.elements.map((e) => e.id)).toEqual(['rect', 'b']);
  });

  it('does not ask when the canvas is already empty', async () => {
    const history = new History(createScene());
    expect(await clearCanvas(history)).toBe(false);
    expect(body.children).toHaveLength(0);
  });
});
