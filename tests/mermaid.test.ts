import { describe, it, expect } from 'vitest';
import { parseDiagram, buildElements, parseSequenceDiagram, buildSequenceElements } from '../src/io/mermaid';
import type { ArrowElement, LineElement, RectangleElement, EllipseElement, RhombusElement } from '../src/elements/element';

const STROKE = '#e2e2ef';

// ── parseDiagram ───────────────────────────────────────────────────────────────

describe('parseDiagram', () => {
  it('returns null for unsupported diagram types', () => {
    expect(parseDiagram('sequenceDiagram\n  A->>B: msg')).toBeNull();
    expect(parseDiagram('pie title Pets\n  "Dogs" : 386')).toBeNull();
    expect(parseDiagram('')).toBeNull();
  });

  it('returns null when first content line is not a header', () => {
    expect(parseDiagram('A --> B')).toBeNull();
  });

  it('parses graph TD header', () => {
    const d = parseDiagram('graph TD\n  A --> B');
    expect(d).not.toBeNull();
    expect(d!.direction).toBe('TD');
  });

  it('normalises TB to TD', () => {
    const d = parseDiagram('graph TB\n  A --> B');
    expect(d!.direction).toBe('TD');
  });

  it('parses flowchart LR header', () => {
    const d = parseDiagram('flowchart LR\n  A --> B');
    expect(d!.direction).toBe('LR');
  });

  it('ignores comment lines', () => {
    const d = parseDiagram('graph TD\n  %% this is a comment\n  A --> B');
    expect(d!.nodes.size).toBe(2);
    expect(d!.edges).toHaveLength(1);
  });

  // ── Node shapes ──────────────────────────────────────────────────────────────

  it('parses rectangle node [label]', () => {
    const d = parseDiagram('graph TD\n  A[My Label]');
    expect(d!.nodes.get('A')).toMatchObject({ id: 'A', label: 'My Label', shape: 'rectangle' });
  });

  it('parses ellipse node (label)', () => {
    const d = parseDiagram('graph TD\n  A(Rounded)');
    expect(d!.nodes.get('A')).toMatchObject({ shape: 'ellipse', label: 'Rounded' });
  });

  it('parses circle node ((label))', () => {
    const d = parseDiagram('graph TD\n  A((Circle))');
    expect(d!.nodes.get('A')).toMatchObject({ shape: 'ellipse', label: 'Circle' });
  });

  it('parses rhombus node {label}', () => {
    const d = parseDiagram('graph TD\n  A{Decision}');
    expect(d!.nodes.get('A')).toMatchObject({ shape: 'rhombus', label: 'Decision' });
  });

  it('parses asymmetric node >label]', () => {
    const d = parseDiagram('graph TD\n  A>Asymmetric]');
    expect(d!.nodes.get('A')).toMatchObject({ shape: 'rectangle', label: 'Asymmetric' });
  });

  it('parses bare id node', () => {
    const d = parseDiagram('graph TD\n  A --> B');
    expect(d!.nodes.get('A')).toMatchObject({ id: 'A', label: 'A', shape: 'rectangle' });
  });

  it('strips surrounding quotes from labels', () => {
    const d = parseDiagram('graph TD\n  A["quoted label"]');
    expect(d!.nodes.get('A')!.label).toBe('quoted label');
  });

  // ── Edges ────────────────────────────────────────────────────────────────────

  it('parses --> as arrow', () => {
    const d = parseDiagram('graph TD\n  A --> B');
    expect(d!.edges).toHaveLength(1);
    expect(d!.edges[0]).toMatchObject({ from: 'A', to: 'B', edgeKind: 'arrow', dashed: false, label: '' });
  });

  it('parses --- as line', () => {
    const d = parseDiagram('graph TD\n  A --- B');
    expect(d!.edges[0]).toMatchObject({ edgeKind: 'line', dashed: false });
  });

  it('parses -.-> as dashed arrow', () => {
    const d = parseDiagram('graph TD\n  A -.-> B');
    expect(d!.edges[0]).toMatchObject({ edgeKind: 'arrow', dashed: true });
  });

  it('parses ==> as arrow', () => {
    const d = parseDiagram('graph TD\n  A ==> B');
    expect(d!.edges[0]).toMatchObject({ edgeKind: 'arrow' });
  });

  it('parses -->|label| edge label', () => {
    const d = parseDiagram('graph TD\n  A -->|Yes| B');
    expect(d!.edges[0]).toMatchObject({ from: 'A', to: 'B', label: 'Yes' });
  });

  it('parses -- label --> edge label', () => {
    const d = parseDiagram('graph TD\n  A -- my label --> B');
    expect(d!.edges[0]).toMatchObject({ from: 'A', to: 'B', label: 'my label' });
  });

  it('parses chained edges on one line', () => {
    const d = parseDiagram('graph TD\n  A --> B --> C');
    expect(d!.nodes.size).toBe(3);
    expect(d!.edges).toHaveLength(2);
    expect(d!.edges[0]).toMatchObject({ from: 'A', to: 'B' });
    expect(d!.edges[1]).toMatchObject({ from: 'B', to: 'C' });
  });

  it('parses inline shape declarations on edge lines', () => {
    const d = parseDiagram('graph TD\n  A[Start] --> B{Decision}');
    expect(d!.nodes.get('A')).toMatchObject({ shape: 'rectangle', label: 'Start' });
    expect(d!.nodes.get('B')).toMatchObject({ shape: 'rhombus', label: 'Decision' });
    expect(d!.edges).toHaveLength(1);
  });

  it('skips subgraph / end / style / classDef lines', () => {
    const text = [
      'graph TD',
      '  subgraph cluster',
      '  A --> B',
      '  end',
      '  classDef foo fill:#f00',
      '  style A fill:#f00',
    ].join('\n');
    const d = parseDiagram(text);
    expect(d!.nodes.size).toBe(2);
    expect(d!.edges).toHaveLength(1);
  });

  it('handles a diagram with a cycle', () => {
    const d = parseDiagram('graph TD\n  A --> B\n  B --> A');
    expect(d!.nodes.size).toBe(2);
    expect(d!.edges).toHaveLength(2);
  });
});

// ── buildElements ──────────────────────────────────────────────────────────────

describe('buildElements', () => {
  it('produces one shape element per node', () => {
    const d = parseDiagram('graph TD\n  A[Rect] --> B{Diamond}')!;
    const els = buildElements(d, STROKE);
    const shapes = els.filter(e => e.type === 'rectangle' || e.type === 'rhombus');
    expect(shapes).toHaveLength(2);
  });

  it('produces one connector per edge', () => {
    const d = parseDiagram('graph TD\n  A --> B\n  B --> C')!;
    const els = buildElements(d, STROKE);
    const arrows = els.filter(e => e.type === 'arrow' || e.type === 'line');
    expect(arrows).toHaveLength(2);
  });

  it('maps node shapes to correct element types', () => {
    const d = parseDiagram('graph TD\n  R[Rect]\n  E(Ellipse)\n  D{Diamond}')!;
    const els = buildElements(d, STROKE);
    expect(els.find(e => e.type === 'rectangle')).toBeDefined();
    expect(els.find(e => e.type === 'ellipse')).toBeDefined();
    expect(els.find(e => e.type === 'rhombus')).toBeDefined();
  });

  it('sets label on shape elements', () => {
    const d = parseDiagram('graph TD\n  A[Hello]')!;
    const els = buildElements(d, STROKE);
    const rect = els[0] as RectangleElement;
    expect(rect.label).toBe('Hello');
  });

  it('sets label on arrow elements', () => {
    const d = parseDiagram('graph TD\n  A -->|Yes| B')!;
    const els = buildElements(d, STROKE);
    const arrow = els.find(e => e.type === 'arrow') as ArrowElement;
    expect(arrow.label).toBe('Yes');
  });

  it('creates line element for --- edge', () => {
    const d = parseDiagram('graph TD\n  A --- B')!;
    const els = buildElements(d, STROKE);
    expect(els.find(e => e.type === 'line')).toBeDefined();
  });

  it('sets dashed strokeStyle for -.-> edge', () => {
    const d = parseDiagram('graph TD\n  A -.-> B')!;
    const els = buildElements(d, STROKE);
    const arrow = els.find(e => e.type === 'arrow') as ArrowElement;
    expect(arrow.strokeStyle).toBe('dashed');
  });

  it('uses the provided strokeColor on all elements', () => {
    const d = parseDiagram('graph TD\n  A --> B')!;
    const els = buildElements(d, '#ff0000');
    for (const el of els) {
      expect(el.strokeColor).toBe('#ff0000');
    }
  });

  it('connectors reference the correct element ids', () => {
    const d = parseDiagram('graph TD\n  A --> B')!;
    const els = buildElements(d, STROKE);
    const shapeA = els.find(e => e.type === 'rectangle' && (e as RectangleElement).label === 'A');
    const shapeB = els.find(e => e.type === 'rectangle' && (e as RectangleElement).label === 'B');
    const arrow = els.find(e => e.type === 'arrow') as ArrowElement;
    expect(arrow.startElementId).toBe(shapeA!.id);
    expect(arrow.endElementId).toBe(shapeB!.id);
  });

  it('LR layout places nodes on the horizontal axis', () => {
    const d = parseDiagram('graph LR\n  A --> B')!;
    const els = buildElements(d, STROKE);
    const [a, b] = els.filter(e => e.type === 'rectangle') as RectangleElement[];
    // In LR, B should be to the right of A
    expect(b!.x).toBeGreaterThan(a!.x);
  });

  it('TD layout places nodes on the vertical axis', () => {
    const d = parseDiagram('graph TD\n  A --> B')!;
    const els = buildElements(d, STROKE);
    const [a, b] = els.filter(e => e.type === 'rectangle') as RectangleElement[];
    // In TD, B should be below A
    expect(b!.y).toBeGreaterThan(a!.y);
  });

  it('shapes have unique ids', () => {
    const d = parseDiagram('graph TD\n  A --> B\n  B --> C')!;
    const els = buildElements(d, STROKE);
    const ids = els.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── parseSequenceDiagram ───────────────────────────────────────────────────────

describe('parseSequenceDiagram', () => {
  it('returns null for non-sequence diagrams', () => {
    expect(parseSequenceDiagram('graph TD\n  A --> B')).toBeNull();
    expect(parseSequenceDiagram('')).toBeNull();
    expect(parseSequenceDiagram('A->>B: msg')).toBeNull();
  });

  it('parses the sequenceDiagram header', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  A->>B: hello');
    expect(d).not.toBeNull();
  });

  it('parses explicit participant declarations in order', () => {
    const text = 'sequenceDiagram\n  participant Client\n  participant API\n  participant DB';
    const d = parseSequenceDiagram(text)!;
    expect(d.participants.map(p => p.id)).toEqual(['Client', 'API', 'DB']);
  });

  it('parses participant alias (as)', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  participant C as Client App')!;
    expect(d.participants[0]).toMatchObject({ id: 'C', label: 'Client App' });
  });

  it('parses actor keyword the same as participant', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  actor User')!;
    expect(d.participants[0]).toMatchObject({ id: 'User', label: 'User' });
  });

  it('auto-registers participants seen only in messages', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  A->>B: hi')!;
    expect(d.participants.map(p => p.id)).toContain('A');
    expect(d.participants.map(p => p.id)).toContain('B');
  });

  it('preserves participant order from declarations', () => {
    const text = 'sequenceDiagram\n  participant X\n  participant Y\n  X->>Y: msg';
    const d = parseSequenceDiagram(text)!;
    expect(d.participants[0]!.id).toBe('X');
    expect(d.participants[1]!.id).toBe('Y');
  });

  it('parses solid arrow (->>) as non-dashed', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  A->>B: call')!;
    expect(d.messages[0]).toMatchObject({ from: 'A', to: 'B', dashed: false, label: 'call' });
  });

  it('parses dashed arrow (-->>) as dashed', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  A-->>B: response')!;
    expect(d.messages[0]).toMatchObject({ dashed: true, label: 'response' });
  });

  it('parses all arrow variants', () => {
    const text = [
      'sequenceDiagram',
      '  A->>B: solid arrow',
      '  A-->>B: dashed arrow',
      '  A->B: solid no head',
      '  A-->B: dashed no head',
      '  A-xB: solid x',
      '  A--xB: dashed x',
    ].join('\n');
    const d = parseSequenceDiagram(text)!;
    expect(d.messages).toHaveLength(6);
    expect(d.messages[0]!.dashed).toBe(false);
    expect(d.messages[1]!.dashed).toBe(true);
    expect(d.messages[2]!.dashed).toBe(false);
    expect(d.messages[3]!.dashed).toBe(true);
  });

  it('parses self-messages (same participant)', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  A->>A: self')!;
    expect(d.messages[0]).toMatchObject({ from: 'A', to: 'A', label: 'self' });
  });

  it('skips loop / alt / else / end / Note block keywords but keeps messages inside', () => {
    const text = [
      'sequenceDiagram',
      '  A->>B: start',
      '  loop Every second',
      '  A->>B: inside loop',
      '  end',
      '  Note over A: note',
      '  A->>B: finish',
    ].join('\n');
    const d = parseSequenceDiagram(text)!;
    // block keywords (loop, end, Note) are skipped; messages inside blocks are kept
    expect(d.messages).toHaveLength(3);
    expect(d.messages.map(m => m.label)).toEqual(['start', 'inside loop', 'finish']);
  });

  it('ignores comment lines', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  %% comment\n  A->>B: msg')!;
    expect(d.messages).toHaveLength(1);
  });

  it('parses the full CRUD example', () => {
    const text = [
      'sequenceDiagram',
      '    participant Client',
      '    participant API',
      '    participant DB',
      '    Client->>API: GET /users',
      '    API->>DB: Read users',
      '    DB-->>API: User list',
      '    API-->>Client: 200 OK + JSON',
      '    Client->>API: POST /users',
      '    API->>DB: Insert user',
      '    DB-->>API: Created',
      '    API-->>Client: 201 Created',
    ].join('\n');
    const d = parseSequenceDiagram(text)!;
    expect(d.participants.map(p => p.id)).toEqual(['Client', 'API', 'DB']);
    expect(d.messages).toHaveLength(8);
  });
});

// ── buildSequenceElements ──────────────────────────────────────────────────────

describe('buildSequenceElements', () => {
  const simple = parseSequenceDiagram(
    'sequenceDiagram\n  participant A\n  participant B\n  A->>B: hello'
  )!;

  it('creates one rectangle per participant', () => {
    const els = buildSequenceElements(simple, STROKE);
    const rects = els.filter(e => e.type === 'rectangle');
    expect(rects).toHaveLength(2);
  });

  it('creates one lifeline (dashed line) per participant', () => {
    const els = buildSequenceElements(simple, STROKE);
    const lifelines = els.filter(e => e.type === 'line');
    expect(lifelines).toHaveLength(2);
    const ll = lifelines[0] as LineElement;
    expect(ll.strokeStyle).toBe('dashed');
  });

  it('creates one arrow per non-self message', () => {
    const els = buildSequenceElements(simple, STROKE);
    const arrows = els.filter(e => e.type === 'arrow');
    expect(arrows).toHaveLength(1);
  });

  it('sets label on message arrows', () => {
    const els = buildSequenceElements(simple, STROKE);
    const arrow = els.find(e => e.type === 'arrow') as ArrowElement;
    expect(arrow.label).toBe('hello');
  });

  it('sets dashed strokeStyle for dashed messages', () => {
    const d = parseSequenceDiagram('sequenceDiagram\n  A-->>B: resp')!;
    const els = buildSequenceElements(d, STROKE);
    const arrow = els.find(e => e.type === 'arrow') as ArrowElement;
    expect(arrow.strokeStyle).toBe('dashed');
  });

  it('places participants at different x positions', () => {
    const els = buildSequenceElements(simple, STROKE);
    const rects = els.filter(e => e.type === 'rectangle');
    expect(rects[0]!.x).not.toBe(rects[1]!.x);
  });

  it('lifelines are vertical (same x, different y)', () => {
    const els = buildSequenceElements(simple, STROKE);
    const [ll] = els.filter(e => e.type === 'line') as LineElement[];
    expect(ll!.x).toBe(ll!.x2);
    expect(ll!.y2).toBeGreaterThan(ll!.y);
  });

  it('message arrows are horizontal (same y)', () => {
    const els = buildSequenceElements(simple, STROKE);
    const [arrow] = els.filter(e => e.type === 'arrow') as ArrowElement[];
    expect(arrow!.y).toBe(arrow!.y2);
  });

  it('all elements have unique ids', () => {
    const d = parseSequenceDiagram(
      'sequenceDiagram\n  participant A\n  participant B\n  participant C\n  A->>B: 1\n  B->>C: 2'
    )!;
    const els = buildSequenceElements(d, STROKE);
    const ids = els.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the provided strokeColor', () => {
    const els = buildSequenceElements(simple, '#abcdef');
    for (const el of els) {
      expect(el.strokeColor).toBe('#abcdef');
    }
  });
});
