/**
 * `freehand` family: stroke building and rendering geometry.
 * - `finishFreehandStroke` (src/tools/freehand_stroke.ts): two centered
 *   smoothing passes then RDP simplification (epsilon 0.5), points and
 *   optional pressures.
 * - `buildFreehandOutline` (src/rendering/freehand_outline.ts): Catmull-Rom
 *   centerline, per-sample radius from pressure, ribbon with round caps.
 * - `penToolStroke`: the synthesized pressure of src/tools/pen_tool.ts. A
 *   real PenTool is driven with pointer samples against a real History:
 *   input {zoom, samples: [{x, y, t, pointerType?, pressure?}]} where x/y
 *   are world coordinates (the tool's worldX/worldY), t is the event
 *   timeStamp in ms, and pointerType/pressure are the PointerEvent fields
 *   (absent means a mouse without pressure). The first sample is the press,
 *   the others moves, then a release at the last sample. Output: `raw` is the
 *   tool's preview (recorded points and pressures, null when fewer than two
 *   points were kept) just before the release, `element` the committed
 *   freehand element's points and pressures (null when none was created).
 * Strokes are deterministic: fixed-seed PRNG (common.ts `prng`).
 * Cases named `test: ...` are calls recorded from tests/freehand_outline.test.ts.
 */
import type { FreehandElement } from '../../src/elements/element';
import { History } from '../../src/engine/history';
import { buildFreehandOutline } from '../../src/rendering/freehand_outline';
import { finishFreehandStroke } from '../../src/tools/freehand_stroke';
import { PenTool } from '../../src/tools/pen_tool';
import type { ToolContext } from '../../src/tools/tool';
import { Family, prng } from './common';
import type { LiftedCall } from './lift';
import { makeScene } from './samples';

type Pt = [number, number];

interface Stroke {
  readonly label: string;
  readonly points: Pt[];
  readonly pressures: number[];
}

/** Deterministic stroke shapes, each with a pressure profile. */
function strokes(): Stroke[] {
  const rand = prng(0x66726565);
  const out: Stroke[] = [];
  const add = (label: string, points: Pt[]) => {
    const pressures = points.map((_, i) =>
      Math.min(
        1,
        Math.max(0, 0.5 + 0.4 * Math.sin(i * 0.7) + (rand() - 0.5) * 0.2),
      ),
    );
    out.push({ label, points, pressures });
  };
  add('empty', []);
  add('single point', [[10, 10]]);
  add('two points', [
    [0, 0],
    [100, 0],
  ]);
  add('two equal points', [
    [5, 5],
    [5, 5],
  ]);
  add('three collinear', [
    [0, 0],
    [50, 0],
    [100, 0],
  ]);
  add('three bent', [
    [0, 0],
    [50, 30],
    [100, 0],
  ]);
  add('duplicates', [
    [0, 0],
    [0, 0],
    [10, 0],
    [10, 0],
    [10, 10],
    [10, 10],
  ]);
  for (const n of [5, 20, 100, 400]) {
    const line: Pt[] = [];
    for (let i = 0; i < n; i++) {
      line.push([i * 3 + (rand() - 0.5) * 0.6, 50 + (rand() - 0.5) * 0.6]);
    }
    add(`noisy line ${n}`, line);
  }
  const circle: Pt[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    circle.push([200 + 80 * Math.cos(a), 200 + 50 * Math.sin(a)]);
  }
  add('ellipse loop', circle);
  const zigzag: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    zigzag.push([i * 6, i % 2 === 0 ? 0 : 18 + rand() * 4]);
  }
  add('zigzag', zigzag);
  for (let s = 0; s < 6; s++) {
    const walk: Pt[] = [[0, 0]];
    let angle = rand() * Math.PI * 2;
    for (let i = 1; i < 30 + s * 25; i++) {
      angle += (rand() - 0.5) * 0.9;
      const step = 1 + rand() * 8;
      const [px, py] = walk[i - 1]!;
      walk.push([px + Math.cos(angle) * step, py + Math.sin(angle) * step]);
    }
    add(`random walk ${s}`, walk);
  }
  const tight: Pt[] = [];
  for (let i = 0; i < 50; i++) tight.push([rand() * 0.8, rand() * 0.8]);
  add('sub-epsilon jitter', tight);
  add('large coordinates', [
    [1e6, -1e6],
    [1e6 + 13.5, -1e6 + 2.25],
    [1e6 + 40, -1e6 - 9],
    [1e6 + 41, -1e6 - 30],
  ]);
  return out;
}

function makeCtx(history: History): ToolContext {
  return {
    history,
    canvas: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
    } as HTMLCanvasElement,
    onPreviewUpdate: () => {},
  };
}

interface PenSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly pointerType?: string;
  readonly pressure?: number;
}

/** Drives a PenTool through `samples` (see the header). */
export function penToolStroke(
  zoom: number,
  samples: ReadonlyArray<PenSample>,
): {
  raw: { points: unknown; pressures: unknown } | null;
  element: { points: unknown; pressures: unknown } | null;
} {
  const history = new History(
    makeScene([], [], {}, { offsetX: 0, offsetY: 0, zoom }),
  );
  const ctx = makeCtx(history);
  const tool = new PenTool();
  const ev = (s: PenSample) =>
    ({
      clientX: s.x * zoom,
      clientY: s.y * zoom,
      timeStamp: s.t,
      shiftKey: false,
      ...(s.pointerType !== undefined && { pointerType: s.pointerType }),
      ...(s.pressure !== undefined && { pressure: s.pressure }),
      preventDefault: () => {},
    }) as unknown as MouseEvent;
  const [first, ...rest] = samples;
  if (!first) throw new Error('penToolStroke: no samples');
  tool.onMouseDown(ev(first), first.x, first.y, ctx);
  for (const s of rest) tool.onMouseMove(ev(s), s.x, s.y, ctx);
  const preview = tool.preview;
  const raw = preview
    ? {
        points: structuredClone(preview.points),
        pressures: structuredClone(preview.pressures),
      }
    : null;
  const last = samples[samples.length - 1]!;
  tool.onMouseUp(ev(last), last.x, last.y, ctx);
  const el = history.present.elements.find(
    (e): e is FreehandElement => e.type === 'freehand',
  );
  return {
    raw,
    element: el
      ? {
          points: structuredClone(el.points),
          pressures: structuredClone(el.pressures),
        }
      : null,
  };
}

export function buildFreehand(lifted: ReadonlyArray<[string, LiftedCall[]]>) {
  const fam = new Family('freehand', {
    inputs: 'TS parameter names; points are [x, y] arrays.',
    penToolStroke:
      'PenTool driven with {zoom, samples: [{x, y, t, pointerType?, pressure?}]} (world coordinates, ' +
      'timeStamp in ms; first sample = press, the rest = moves, release at the last). Output {raw, element}: ' +
      'raw = tool.preview {points, pressures} before the release (null if none), element = committed ' +
      'freehand {points, pressures} (null if none).',
  });

  const seen = new Set<string>();
  for (const [testName, calls] of lifted) {
    calls.forEach((call, i) => {
      const key = JSON.stringify([call.fn, call.input]);
      if (seen.has(key)) return;
      seen.add(key);
      fam.add(`test: ${testName} #${i}`, call.fn, call.input, call.output);
    });
  }

  const all = strokes();
  for (const s of all) {
    fam.add(
      `finish ${s.label}`,
      'finishFreehandStroke',
      { points: s.points },
      finishFreehandStroke(s.points),
    );
    fam.add(
      `finish ${s.label} with pressure`,
      'finishFreehandStroke',
      { points: s.points, pressures: s.pressures },
      finishFreehandStroke(s.points, s.pressures),
    );
  }

  for (const s of all) {
    const finished = finishFreehandStroke(s.points, s.pressures);
    const inputs: Array<[string, Pt[], number[] | undefined]> = [
      ['raw', s.points, s.pressures],
      ['raw no pressure', s.points, undefined],
      ['finished', finished.points as Pt[], finished.pressures],
    ];
    if (s.points.length > 1) {
      inputs.push(['mismatched pressure', s.points, s.pressures.slice(1)]);
    }
    for (const [il, points, pressures] of inputs) {
      for (const strokeWidth of [1, 4, 12]) {
        if (s.points.length > 100 && strokeWidth !== 4) continue;
        fam.add(
          `outline ${s.label} ${il} width ${strokeWidth}`,
          'buildFreehandOutline',
          { points, pressures, strokeWidth },
          buildFreehandOutline(points, pressures, strokeWidth),
        );
      }
    }
  }
  const bent = all.find((s) => s.label === 'random walk 1')!;
  for (const options of [
    { sampleStep: 1 },
    { sampleStep: 10 },
    { minRadiusRatio: 0 },
    { minRadiusRatio: 0.9 },
    { sampleStep: 0.5, minRadiusRatio: 0.5 },
  ]) {
    fam.add(
      `outline options ${JSON.stringify(options)}`,
      'buildFreehandOutline',
      {
        points: bent.points,
        pressures: bent.pressures,
        strokeWidth: 6,
        options,
      },
      buildFreehandOutline(bent.points, bent.pressures, 6, options),
    );
  }
  fam.add(
    'outline zero width',
    'buildFreehandOutline',
    { points: bent.points, strokeWidth: 0 },
    buildFreehandOutline(bent.points, undefined, 0),
  );

  // Synthesized pressure: timestamps drive the speed mapping.
  const rand = prng(0x70656e73);
  const timed = (
    n: number,
    dtFn: (i: number) => number,
    stepFn: (i: number) => number,
  ): PenSample[] => {
    const out: PenSample[] = [];
    let t = 1000;
    let x = 0;
    for (let i = 0; i < n; i++) {
      out.push({ x, y: Math.sin(i * 0.3) * 20, t });
      t += dtFn(i);
      x += stepFn(i);
    }
    return out;
  };
  const penCases: Array<[string, number, PenSample[]]> = [
    [
      'steady slow',
      1,
      timed(
        30,
        () => 16,
        () => 0.5,
      ),
    ],
    [
      'steady fast',
      1,
      timed(
        30,
        () => 8,
        () => 15,
      ),
    ],
    [
      'accelerating',
      1,
      timed(
        40,
        () => 16,
        (i) => 0.5 + i * 0.6,
      ),
    ],
    [
      'zero dt',
      1,
      timed(
        10,
        (i) => (i % 2 === 0 ? 0 : 16),
        () => 5,
      ),
    ],
    [
      'pause gap',
      1,
      timed(
        20,
        (i) => (i === 9 ? 400 : 16),
        () => 4,
      ),
    ],
    [
      'exactly 150 ms gap',
      1,
      timed(
        12,
        (i) => (i === 5 ? 150 : 10),
        () => 6,
      ),
    ],
    [
      'random timing',
      1,
      timed(
        60,
        () => 4 + Math.floor(rand() * 30),
        () => rand() * 12,
      ),
    ],
    [
      'min distance filter zoom 1',
      1,
      timed(
        20,
        () => 16,
        () => 1.5,
      ),
    ],
    [
      'min distance filter zoom 4',
      4,
      timed(
        20,
        () => 16,
        () => 0.6,
      ),
    ],
    [
      'min distance filter zoom 0.25',
      0.25,
      timed(
        20,
        () => 16,
        () => 6,
      ),
    ],
    ['tap', 1, [{ x: 50, y: 50, t: 0 }]],
    [
      'tap with jitter',
      1,
      [
        { x: 50, y: 50, t: 0 },
        { x: 51, y: 50.5, t: 16 },
      ],
    ],
    [
      'stylus pressure',
      1,
      timed(
        25,
        () => 12,
        () => 3,
      ).map((s, i) => ({
        ...s,
        pointerType: 'pen',
        pressure: 0.2 + 0.6 * Math.abs(Math.sin(i * 0.25)),
      })),
    ],
    [
      'stylus zero pressure falls back to speed',
      1,
      timed(
        15,
        () => 12,
        () => 3,
      ).map((s, i) => ({
        ...s,
        pointerType: 'pen',
        pressure: i % 3 === 0 ? 0 : 0.5,
      })),
    ],
    [
      'touch ignores pressure',
      1,
      timed(
        15,
        () => 12,
        () => 3,
      ).map((s) => ({
        ...s,
        pointerType: 'touch',
        pressure: 0.9,
      })),
    ],
  ];
  for (const [label, zoom, samples] of penCases) {
    fam.add(
      `pen ${label}`,
      'penToolStroke',
      { zoom, samples },
      penToolStroke(zoom, samples),
    );
  }
  return fam;
}
