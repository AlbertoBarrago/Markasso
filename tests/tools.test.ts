import { describe, expect, it } from 'vitest';
import { EllipseTool } from '../src/tools/ellipse_tool';
import { EraserTool } from '../src/tools/eraser_tool';
import { PenTool } from '../src/tools/pen_tool';
import { RectangleTool } from '../src/tools/rectangle_tool';
import { RomboTool } from '../src/tools/rombo_tool';
import type { ToolContext } from '../src/tools/tool';

const nullCtx = null as unknown as ToolContext;

describe('EllipseTool', () => {
  it('getCursor returns a string', () => {
    expect(
      typeof (
        new EllipseTool() as unknown as { getCursor(): string }
      ).getCursor(),
    ).toBe('string');
  });

  it('onDeactivate resets preview to null', () => {
    const tool = new EllipseTool();
    (tool as unknown as { drawing: boolean }).drawing = true;
    tool.onDeactivate(nullCtx);
    expect(tool.preview).toBeNull();
  });
});

describe('RectangleTool', () => {
  it('getCursor returns a string', () => {
    expect(
      typeof (
        new RectangleTool() as unknown as { getCursor(): string }
      ).getCursor(),
    ).toBe('string');
  });

  it('onDeactivate resets preview to null', () => {
    const tool = new RectangleTool();
    (tool as unknown as { drawing: boolean }).drawing = true;
    tool.onDeactivate(nullCtx);
    expect(tool.preview).toBeNull();
  });
});

describe('RomboTool', () => {
  it('getCursor returns a string', () => {
    expect(
      typeof (
        new RomboTool() as unknown as { getCursor(): string }
      ).getCursor(),
    ).toBe('string');
  });

  it('onDeactivate resets preview to null', () => {
    const tool = new RomboTool();
    tool.onDeactivate(nullCtx);
    expect(tool.preview).toBeNull();
  });
});

describe('EraserTool', () => {
  it('getCursor returns a string', () => {
    expect(
      typeof (
        new EraserTool() as unknown as { getCursor(): string }
      ).getCursor(),
    ).toBe('string');
  });
});

describe('PenTool', () => {
  it('getCursor returns a string', () => {
    expect(
      typeof (new PenTool() as unknown as { getCursor(): string }).getCursor(),
    ).toBe('string');
  });

  it('onCancel resets all stroke state', () => {
    const tool = new PenTool();
    (tool as unknown as { drawing: boolean }).drawing = true;
    (tool as unknown as { points: number[][] }).points = [[0, 0]];
    tool.onCancel(nullCtx);
    expect(tool.preview).toBeNull();
    expect((tool as unknown as { drawing: boolean }).drawing).toBe(false);
    expect((tool as unknown as { points: number[][] }).points).toHaveLength(0);
  });
});
