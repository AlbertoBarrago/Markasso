import { describe, expect, it } from 'vitest';
import { cloneElementsWithOffset } from '../src/elements/clone';
import type { Element } from '../src/elements/element';

const base = {
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
} as const;

describe('cloneElementsWithOffset', () => {
  it('offsets point geometry and creates deterministic IDs', () => {
    const elements: Element[] = [
      {
        ...base,
        id: 'polygon',
        type: 'polygon',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [10, 5],
        ],
        closed: false,
      },
    ];

    const cloned = cloneElementsWithOffset(elements, 20, -5, () => 'clone');
    expect(cloned[0]).toMatchObject({ id: 'clone', x: 20, y: -5 });
    expect(cloned[0]?.type === 'polygon' && cloned[0].points).toEqual([
      [20, -5],
      [30, 0],
    ]);
  });

  it('remaps connector references and group IDs within the cloned set', () => {
    const ids = ['rect-copy', 'line-copy', 'group-copy'][Symbol.iterator]();
    const elements: Element[] = [
      {
        ...base,
        id: 'rect',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        groupId: 'group',
      },
      {
        ...base,
        id: 'line',
        type: 'line',
        x: 5,
        y: 5,
        x2: 20,
        y2: 20,
        startElementId: 'rect',
        endElementId: 'outside',
        groupId: 'group',
      },
    ];

    const cloned = cloneElementsWithOffset(
      elements,
      0,
      0,
      () => ids.next().value!,
    );
    expect(cloned[0]?.groupId).toBe('group-copy');
    expect(cloned[1]?.groupId).toBe('group-copy');
    expect(cloned[1]).toMatchObject({
      id: 'line-copy',
      startElementId: 'rect-copy',
    });
    expect(cloned[1]).not.toHaveProperty('endElementId');
  });

  it('detaches a partial group clone', () => {
    const element: Element = {
      ...base,
      id: 'rect',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      groupId: 'group',
    };

    expect(
      cloneElementsWithOffset([element], 0, 0, () => 'copy')[0],
    ).not.toHaveProperty('groupId');
  });
});
