import { describe, expect, it } from 'vitest';
import { fileShortcut } from '../src/ui/keyboard_utils';

const key = (
  k: string,
  mods: Partial<
    Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>
  > = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('fileShortcut', () => {
  it('maps Cmd/Ctrl+O to open and Cmd/Ctrl+S to save', () => {
    expect(fileShortcut(key('o', { metaKey: true }))).toBe('open');
    expect(fileShortcut(key('o', { ctrlKey: true }))).toBe('open');
    expect(fileShortcut(key('s', { metaKey: true }))).toBe('save');
    expect(fileShortcut(key('s', { ctrlKey: true }))).toBe('save');
  });

  it('matches with Caps Lock on', () => {
    expect(fileShortcut(key('O', { metaKey: true }))).toBe('open');
  });

  it('leaves plain keys to the tool shortcuts', () => {
    expect(fileShortcut(key('o'))).toBeNull();
    expect(fileShortcut(key('s'))).toBeNull();
  });

  it('ignores combos with Shift or Alt', () => {
    expect(
      fileShortcut(key('o', { metaKey: true, shiftKey: true })),
    ).toBeNull();
    expect(fileShortcut(key('s', { ctrlKey: true, altKey: true }))).toBeNull();
  });
});
