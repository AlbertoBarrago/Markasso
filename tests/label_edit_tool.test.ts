import { describe, expect, it } from 'vitest';
import { toolAfterLabelEdit } from '../src/ui/label_edit_tool';

describe('toolAfterLabelEdit', () => {
  it('brings back the select tool after editing a label from it', () => {
    expect(toolAfterLabelEdit('select', 'text')).toBe('select');
  });

  it('brings back a drawing tool the editor interrupted', () => {
    expect(toolAfterLabelEdit('rectangle', 'text')).toBe('rectangle');
  });

  it('keeps the text tool when it was already active', () => {
    expect(toolAfterLabelEdit('text', 'text')).toBeNull();
  });

  it('respects a tool the user picked while editing', () => {
    expect(toolAfterLabelEdit('select', 'line')).toBeNull();
  });
});
