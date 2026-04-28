import { describe, it, expect } from 'vitest';
import { PRESETS } from '../src/io/presets';
import type { Element } from '../src/elements/element';

const REQUIRED_FIELDS: (keyof Element)[] = [
  'id', 'type', 'strokeColor', 'fillColor', 'strokeWidth', 'opacity', 'roughness',
];

function getBBox(els: Element[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    if (
      el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'rhombus' ||
      el.type === 'text' || el.type === 'image'
    ) {
      const w = 'width' in el ? el.width : 0;
      const h = 'height' in el ? el.height : 0;
      minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + w); maxY = Math.max(maxY, el.y + h);
    } else if (el.type === 'arrow' || el.type === 'line') {
      minX = Math.min(minX, el.x, el.x2); minY = Math.min(minY, el.y, el.y2);
      maxX = Math.max(maxX, el.x, el.x2); maxY = Math.max(maxY, el.y, el.y2);
    }
  }
  return { minX, minY, maxX, maxY };
}

describe('PRESETS', () => {
  it('has 4 entries with correct ids', () => {
    expect(PRESETS).toHaveLength(4);
    expect(PRESETS.map((p) => p.id)).toEqual(['flowchart', 'mindmap', 'swot', 'sequence']);
  });

  it('each preset returns elements for both dark and light', () => {
    for (const p of PRESETS) {
      expect(p.buildElements(0, 0, true).length).toBeGreaterThan(0);
      expect(p.buildElements(0, 0, false).length).toBeGreaterThan(0);
    }
  });

  it('all elements have required BaseElement fields', () => {
    for (const p of PRESETS) {
      for (const el of p.buildElements(0, 0, true)) {
        for (const field of REQUIRED_FIELDS) {
          expect(el).toHaveProperty(field);
        }
      }
    }
  });

  it('no duplicate IDs within a single preset call', () => {
    for (const p of PRESETS) {
      const els = p.buildElements(0, 0, true);
      const ids = els.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  describe('flowchart', () => {
    const flowchart = PRESETS.find((p) => p.id === 'flowchart')!;

    it('returns exactly 7 elements', () => {
      expect(flowchart.buildElements(0, 0, true)).toHaveLength(7);
    });

    it('has 3 arrows', () => {
      const els = flowchart.buildElements(0, 0, true);
      expect(els.filter((e) => e.type === 'arrow')).toHaveLength(3);
    });

    it('shapes have labels', () => {
      const els = flowchart.buildElements(0, 0, true);
      const shapes = els.filter((e) => e.type !== 'arrow');
      expect(shapes).toHaveLength(4);
      for (const s of shapes) {
        expect((s as { label?: string }).label).toBeTruthy();
      }
    });
  });

  describe('mindmap', () => {
    const mindmap = PRESETS.find((p) => p.id === 'mindmap')!;

    it('returns exactly 11 elements', () => {
      expect(mindmap.buildElements(0, 0, true)).toHaveLength(11);
    });

    it('center element has label "Main Topic"', () => {
      const els = mindmap.buildElements(0, 0, true);
      const rects = els.filter((e) => e.type === 'rectangle');
      expect(rects).toHaveLength(1);
      expect((rects[0] as { label?: string }).label).toBe('Main Topic');
    });

    it('has 5 lines radiating outward', () => {
      const els = mindmap.buildElements(0, 0, true);
      expect(els.filter((e) => e.type === 'line')).toHaveLength(5);
    });
  });

  describe('swot', () => {
    const swot = PRESETS.find((p) => p.id === 'swot')!;

    it('returns exactly 5 elements', () => {
      expect(swot.buildElements(0, 0, true)).toHaveLength(5);
    });

    it('has a text element with "SWOT Analysis"', () => {
      const els = swot.buildElements(0, 0, true);
      const text = els.find((e) => e.type === 'text');
      expect(text).toBeDefined();
      expect((text as { content: string }).content).toBe('SWOT Analysis');
    });

    it('has 4 rectangles with correct labels', () => {
      const els = swot.buildElements(0, 0, true);
      const rects = els.filter((e) => e.type === 'rectangle');
      expect(rects).toHaveLength(4);
      const labels = rects.map((r) => (r as { label?: string }).label);
      expect(labels).toEqual(['Strengths', 'Weaknesses', 'Opportunities', 'Threats']);
    });
  });

  describe('sequence', () => {
    const sequence = PRESETS.find((p) => p.id === 'sequence')!;

    it('returns exactly 7 elements', () => {
      expect(sequence.buildElements(0, 0, true)).toHaveLength(7);
    });

    it('has 2 dashed lifelines', () => {
      const els = sequence.buildElements(0, 0, true);
      const lifelines = els.filter(
        (e) => e.type === 'line' && (e as { strokeStyle?: string }).strokeStyle === 'dashed',
      );
      expect(lifelines).toHaveLength(2);
    });

    it('has 3 arrows with labels', () => {
      const els = sequence.buildElements(0, 0, true);
      const arrows = els.filter((e) => e.type === 'arrow');
      expect(arrows).toHaveLength(3);
      for (const a of arrows) {
        expect((a as { label?: string }).label).toBeTruthy();
      }
    });
  });

  describe('translate / bounding-box centering', () => {
    it('buildElements(200, 300, true) centers near (200, 300)', () => {
      for (const p of PRESETS) {
        const els = p.buildElements(200, 300, true);
        const { minX, minY, maxX, maxY } = getBBox(els);
        const bbCx = (minX + maxX) / 2;
        const bbCy = (minY + maxY) / 2;
        expect(bbCx).toBeCloseTo(200, 0);
        expect(bbCy).toBeCloseTo(300, 0);
      }
    });
  });

  describe('dark vs light colors', () => {
    it('dark and light produce different fillColors on shape elements', () => {
      for (const p of PRESETS) {
        const dark  = p.buildElements(0, 0, true);
        const light = p.buildElements(0, 0, false);
        const darkShapes  = dark.filter((e) => ['rectangle','ellipse','rhombus'].includes(e.type));
        const lightShapes = light.filter((e) => ['rectangle','ellipse','rhombus'].includes(e.type));
        if (darkShapes.length === 0 || lightShapes.length === 0) continue;
        expect(darkShapes[0]!.fillColor).not.toBe(lightShapes[0]!.fillColor);
      }
    });
  });
});
