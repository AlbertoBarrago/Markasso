/**
 * Recording fake of `CanvasRenderingContext2D` for the `draw` family: a
 * Proxy (the idea of tests/export_parity.test.ts, generalized) that records
 * every drawing call and the graphics state at every paint. The encoding is
 * described by {@link CALL_ENCODING} and {@link STATE_ENCODING}, written into
 * the family header.
 */
import { measureTextWidth } from '../../src/core/text_metrics';

export const CALL_ENCODING =
  'Each case output is {calls, states}. calls is the ordered list of context calls, each an array ' +
  '[name, ...args] with the arguments as passed (numbers unrounded). Recorded names: beginPath, closePath, ' +
  'moveTo, lineTo, quadraticCurveTo, bezierCurveTo, arc (x, y, r, start, end, anticlockwise: always ' +
  'present, false when omitted), rect, clip and fill (one argument, the fill rule, "nonzero" when omitted), ' +
  'stroke, fillRect, strokeRect, fillText (text, x, y), drawImage (source identity: the image src string, ' +
  'then the numeric arguments), save, restore, translate, rotate, scale, setTransform (a, b, c, d, e, f), ' +
  'resetTransform, setLineDash (the array as passed). Paint calls (fill, stroke, fillRect, strokeRect, ' +
  'fillText, drawImage) carry one extra trailing argument: the index into states of the graphics state at ' +
  'that moment. Property writes are not calls (they show up in the states). measureText is not recorded. ' +
  'lineTo, quadraticCurveTo and bezierCurveTo without a current point first emit an explicit ["moveTo", x, y] ' +
  '(lineTo to its own point, the curves to their first control point), as the canvas creates that subpath ' +
  'implicitly; a lineTo then records only the moveTo. arc without a current point starts the subpath. ' +
  'Lowered calls (no direct CoreGraphics equivalent), with the current point tracked as the canvas does: ' +
  'ellipse(cx, cy, rx, ry, rot, start, end, ccw) becomes ["lineTo", P(start)] when the path has a current ' +
  'point, else ["moveTo", P(start)], then n = ceil(|sweep| / (pi / 2)) bezierCurveTo segments of equal ' +
  'angle d = sweep / n, each from angle a to a + d with k = 4 / 3 * tan(d / 4): control points ' +
  'P(a) + k * T(a) and P(a + d) - k * T(a + d), end P(a + d), where on the unit circle u(a) = (cos a, sin a), ' +
  't(a) = (-sin a, cos a), and P / T map a unit vector (ux, uy) to (cx + rx ux cos rot - ry uy sin rot, ' +
  'cy + rx ux sin rot + ry uy cos rot) (T without the center). sweep: 2 pi when !ccw and end - start >= 2 pi, ' +
  '-2 pi when ccw and start - end >= 2 pi, else (end - start) mod 2 pi into [0, 2 pi) for !ccw and minus ' +
  '(start - end) mod 2 pi into (-2 pi, 0] for ccw. ' +
  'arcTo(x1, y1, x2, y2, r) from current point P0 (none: moveTo(x1, y1) first and P0 = P1): ' +
  '["lineTo", x1, y1] when P0 = P1, P1 = P2, r = 0 or the three points are collinear (cross product 0); ' +
  'otherwise with u0 = unit(P0 - P1), u2 = unit(P2 - P1), theta = acos(u0 . u2) clamped, d = r / tan(theta / 2): ' +
  'T1 = P1 + u0 d, T2 = P1 + u2 d, center C = P1 + unit(u0 + u2) * r / sin(theta / 2), emitted as ' +
  '["lineTo", T1] and ["arc", C, r, atan2(T1 - C), atan2(T2 - C), ccw] with ccw = cross(P1 - P0, P2 - P1) < 0. ' +
  'roundRect(x, y, w, h, r) with a single radius and w, h >= 0: r is scaled by min(1, w / 2r, h / 2r), then ' +
  'moveTo(x + r, y), lineTo(x + w - r, y), arc(x + w - r, y + r, r, -pi / 2, 0), lineTo(x + w, y + h - r), ' +
  'arc(x + w - r, y + h - r, r, 0, pi / 2), lineTo(x + r, y + h), arc(x + r, y + h - r, r, pi / 2, pi), ' +
  'lineTo(x, y + r), arc(x + r, y + r, r, pi, 3 pi / 2), closePath, moveTo(x, y) (arcs anticlockwise false).';

export const STATE_ENCODING =
  'states: distinct graphics states of the case, in first-use order, each {fillStyle, strokeStyle, ' +
  'lineWidth, globalAlpha, lineCap, lineJoin, lineDash, shadowBlur, shadowColor, shadowOffsetX, ' +
  'shadowOffsetY, font, textAlign, textBaseline, transform}. transform is the current matrix [a, b, c, d, e, f] ' +
  "(canvas convention: x' = a x + c y + e, y' = b x + d y + f). Styles are the strings the code assigned " +
  '(no browser color normalization). Setters follow the canvas rules: lineWidth, shadowBlur ignore values ' +
  'that are not finite or are <= 0 (lineWidth) / < 0 (shadowBlur); globalAlpha ignores values outside [0, 1] ' +
  'or NaN; shadowOffsetX/Y ignore non-finite values; lineCap, lineJoin, textAlign, textBaseline ignore ' +
  'unknown keywords; setLineDash ignores arrays with a negative or non-finite entry and repeats odd-length ' +
  'arrays twice. Initial state: fillStyle and strokeStyle "#000000", lineWidth 1, globalAlpha 1, lineCap ' +
  '"butt", lineJoin "miter", lineDash [], shadowBlur 0, shadowColor "rgba(0, 0, 0, 0)", shadow offsets 0, ' +
  'font "10px sans-serif", textAlign "start", textBaseline "alphabetic", identity transform. save/restore ' +
  'push and pop the whole state (restore on an empty stack does nothing).';

export const MEASURE_TEXT_STUB =
  'measureText(text).width is src/core/text_metrics measureTextWidth(text, size, family, bold) with ' +
  'size, family and bold parsed from the current font "[italic ][bold ]<size>px <family>" ' +
  '(the ported metric tables, never a real font).';

type Matrix = [number, number, number, number, number, number];

interface GState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  lineCap: string;
  lineJoin: string;
  lineDash: number[];
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  transform: Matrix;
}

function initialState(): GState {
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDash: [],
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    transform: [1, 0, 0, 1, 0, 0],
  };
}

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const ENUMS: Readonly<Record<string, ReadonlyArray<string>>> = {
  lineCap: ['butt', 'round', 'square'],
  lineJoin: ['miter', 'round', 'bevel'],
  textAlign: ['start', 'end', 'left', 'right', 'center'],
  textBaseline: [
    'top',
    'hanging',
    'middle',
    'alphabetic',
    'ideographic',
    'bottom',
  ],
};

/** Properties written by the renderer that do not affect the recording. */
const IGNORED_PROPS = new Set([
  'imageSmoothingEnabled',
  'imageSmoothingQuality',
]);

export type Call = unknown[];

export interface Recording {
  readonly calls: Call[];
  readonly states: GState[];
}

const TAU = Math.PI * 2;

export function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  recording: Recording;
} {
  const calls: Call[] = [];
  const states: GState[] = [];
  const stateKeys = new Map<string, number>();
  let state = initialState();
  const stack: GState[] = [];
  /** Current point (null when the path has none) and subpath start. */
  let current: [number, number] | null = null;
  let subpathStart: [number, number] | null = null;
  const ignored = new Map<string, unknown>();

  const stateIndex = (): number => {
    const snap = structuredClone(state);
    const key = JSON.stringify(snap);
    let index = stateKeys.get(key);
    if (index === undefined) {
      index = states.length;
      states.push(snap);
      stateKeys.set(key, index);
    }
    return index;
  };
  const moveTo = (x: number, y: number) => {
    calls.push(['moveTo', x, y]);
    current = [x, y];
    subpathStart = [x, y];
  };
  const lineTo = (x: number, y: number) => {
    if (!current) {
      moveTo(x, y);
      return;
    }
    calls.push(['lineTo', x, y]);
    current = [x, y];
  };
  const arc = (
    x: number,
    y: number,
    r: number,
    start: number,
    end: number,
    ccw = false,
  ) => {
    calls.push(['arc', x, y, r, start, end, ccw]);
    const sx = x + r * Math.cos(start);
    const sy = y + r * Math.sin(start);
    if (!current) subpathStart = [sx, sy];
    current = [x + r * Math.cos(end), y + r * Math.sin(end)];
  };
  const ellipse = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rot: number,
    start: number,
    end: number,
    ccw = false,
  ) => {
    let sweep: number;
    if (!ccw && end - start >= TAU) sweep = TAU;
    else if (ccw && start - end >= TAU) sweep = -TAU;
    else if (!ccw) sweep = (((end - start) % TAU) + TAU) % TAU;
    else sweep = -((((start - end) % TAU) + TAU) % TAU);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const P = (a: number): [number, number] => {
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      return [
        cx + rx * ux * cr - ry * uy * sr,
        cy + rx * ux * sr + ry * uy * cr,
      ];
    };
    const T = (a: number): [number, number] => {
      const ux = -Math.sin(a);
      const uy = Math.cos(a);
      return [rx * ux * cr - ry * uy * sr, rx * ux * sr + ry * uy * cr];
    };
    const [sx, sy] = P(start);
    if (current) lineTo(sx, sy);
    else moveTo(sx, sy);
    const n = Math.ceil(Math.abs(sweep) / (Math.PI / 2));
    const d = n > 0 ? sweep / n : 0;
    const k = (4 / 3) * Math.tan(d / 4);
    for (let i = 0; i < n; i++) {
      const a0 = start + d * i;
      const a1 = a0 + d;
      const p0 = P(a0);
      const t0 = T(a0);
      const p1 = P(a1);
      const t1 = T(a1);
      calls.push([
        'bezierCurveTo',
        p0[0] + k * t0[0],
        p0[1] + k * t0[1],
        p1[0] - k * t1[0],
        p1[1] - k * t1[1],
        p1[0],
        p1[1],
      ]);
      current = p1;
    }
  };
  const arcTo = (x1: number, y1: number, x2: number, y2: number, r: number) => {
    if (!current) moveTo(x1, y1);
    const [x0, y0] = current!;
    const cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
    if (
      (x0 === x1 && y0 === y1) ||
      (x1 === x2 && y1 === y2) ||
      r === 0 ||
      cross === 0
    ) {
      lineTo(x1, y1);
      return;
    }
    const l0 = Math.hypot(x0 - x1, y0 - y1);
    const l2 = Math.hypot(x2 - x1, y2 - y1);
    const u0x = (x0 - x1) / l0;
    const u0y = (y0 - y1) / l0;
    const u2x = (x2 - x1) / l2;
    const u2y = (y2 - y1) / l2;
    const theta = Math.acos(Math.max(-1, Math.min(1, u0x * u2x + u0y * u2y)));
    const d = r / Math.tan(theta / 2);
    const t1x = x1 + u0x * d;
    const t1y = y1 + u0y * d;
    const t2x = x1 + u2x * d;
    const t2y = y1 + u2y * d;
    const bx = u0x + u2x;
    const by = u0y + u2y;
    const bl = Math.hypot(bx, by);
    const h = r / Math.sin(theta / 2);
    const ccx = x1 + (bx / bl) * h;
    const ccy = y1 + (by / bl) * h;
    lineTo(t1x, t1y);
    arc(
      ccx,
      ccy,
      r,
      Math.atan2(t1y - ccy, t1x - ccx),
      Math.atan2(t2y - ccy, t2x - ccx),
      cross < 0,
    );
    current = [t2x, t2y];
  };
  const roundRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    radius: unknown,
  ) => {
    if (typeof radius !== 'number' || w < 0 || h < 0) {
      throw new Error('recordingContext: unsupported roundRect arguments');
    }
    const r = radius * Math.min(1, w / (2 * radius), h / (2 * radius));
    moveTo(x + r, y);
    lineTo(x + w - r, y);
    arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    lineTo(x + w, y + h - r);
    arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    lineTo(x + r, y + h);
    arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    lineTo(x, y + r);
    arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2);
    closePath();
    moveTo(x, y);
  };
  const closePath = () => {
    calls.push(['closePath']);
    if (subpathStart) current = [...subpathStart];
  };
  const transform = (n: Matrix) => {
    state.transform = multiply(state.transform, n);
  };

  const methods: Record<string, (...args: never[]) => unknown> = {
    beginPath: () => {
      calls.push(['beginPath']);
      current = null;
      subpathStart = null;
    },
    closePath,
    moveTo,
    lineTo,
    quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => {
      if (!current) moveTo(cpx, cpy);
      calls.push(['quadraticCurveTo', cpx, cpy, x, y]);
      current = [x, y];
    },
    bezierCurveTo: (
      c1x: number,
      c1y: number,
      c2x: number,
      c2y: number,
      x: number,
      y: number,
    ) => {
      if (!current) moveTo(c1x, c1y);
      calls.push(['bezierCurveTo', c1x, c1y, c2x, c2y, x, y]);
      current = [x, y];
    },
    arc,
    ellipse,
    arcTo,
    roundRect,
    rect: (x: number, y: number, w: number, h: number) => {
      calls.push(['rect', x, y, w, h]);
      current = [x, y];
      subpathStart = [x, y];
    },
    clip: (rule?: string) => {
      calls.push(['clip', rule ?? 'nonzero']);
    },
    fill: (rule?: string) => {
      calls.push(['fill', rule ?? 'nonzero', stateIndex()]);
    },
    stroke: () => {
      calls.push(['stroke', stateIndex()]);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      calls.push(['fillRect', x, y, w, h, stateIndex()]);
    },
    strokeRect: (x: number, y: number, w: number, h: number) => {
      calls.push(['strokeRect', x, y, w, h, stateIndex()]);
    },
    fillText: (text: string, x: number, y: number, maxWidth?: number) => {
      if (maxWidth !== undefined) {
        throw new Error('recordingContext: fillText maxWidth not encoded');
      }
      calls.push(['fillText', text, x, y, stateIndex()]);
    },
    drawImage: (image: { src: string }, ...rest: number[]) => {
      calls.push(['drawImage', image.src, ...rest, stateIndex()]);
    },
    save: () => {
      calls.push(['save']);
      stack.push(structuredClone(state));
    },
    restore: () => {
      calls.push(['restore']);
      const popped = stack.pop();
      if (popped) state = popped;
    },
    translate: (x: number, y: number) => {
      calls.push(['translate', x, y]);
      transform([1, 0, 0, 1, x, y]);
    },
    rotate: (angle: number) => {
      calls.push(['rotate', angle]);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      transform([c, s, -s, c, 0, 0]);
    },
    scale: (x: number, y: number) => {
      calls.push(['scale', x, y]);
      transform([x, 0, 0, y, 0, 0]);
    },
    setTransform: (
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
    ) => {
      calls.push(['setTransform', a, b, c, d, e, f]);
      state.transform = [a, b, c, d, e, f];
    },
    resetTransform: () => {
      calls.push(['resetTransform']);
      state.transform = [1, 0, 0, 1, 0, 0];
    },
    setLineDash: (segments: number[]) => {
      calls.push(['setLineDash', [...segments]]);
      if (segments.some((v) => !Number.isFinite(v) || v < 0)) return;
      state.lineDash =
        segments.length % 2 === 1 ? [...segments, ...segments] : [...segments];
    },
    measureText: (text: string) => {
      const m = state.font.match(/^(italic )?(bold )?(\S+)px (.*)$/);
      if (!m) throw new Error(`recordingContext: unparsed font ${state.font}`);
      return {
        width: measureTextWidth(text, Number(m[3]), m[4]!, m[2] !== undefined),
      };
    },
  };

  const setters: Record<string, (value: unknown) => void> = {
    fillStyle: (v) => {
      state.fillStyle = String(v);
    },
    strokeStyle: (v) => {
      state.strokeStyle = String(v);
    },
    lineWidth: (v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) state.lineWidth = n;
    },
    globalAlpha: (v) => {
      const n = Number(v);
      if (n >= 0 && n <= 1) state.globalAlpha = n;
    },
    shadowBlur: (v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) state.shadowBlur = n;
    },
    shadowColor: (v) => {
      state.shadowColor = String(v);
    },
    shadowOffsetX: (v) => {
      const n = Number(v);
      if (Number.isFinite(n)) state.shadowOffsetX = n;
    },
    shadowOffsetY: (v) => {
      const n = Number(v);
      if (Number.isFinite(n)) state.shadowOffsetY = n;
    },
    font: (v) => {
      state.font = String(v);
    },
  };
  for (const key of Object.keys(ENUMS)) {
    setters[key] = (v) => {
      if (ENUMS[key]!.includes(String(v))) {
        (state as unknown as Record<string, unknown>)[key] = String(v);
      }
    };
  }

  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        const method = methods[prop];
        if (method) return method;
        if (prop in setters) {
          return (state as unknown as Record<string, unknown>)[prop];
        }
        if (IGNORED_PROPS.has(prop)) return ignored.get(prop);
        throw new Error(`recordingContext: unexpected read of ${prop}`);
      },
      set(_target, prop, value) {
        if (typeof prop !== 'string') return false;
        const setter = setters[prop];
        if (setter) setter(value);
        else if (IGNORED_PROPS.has(prop)) ignored.set(prop, value);
        else throw new Error(`recordingContext: unexpected write of ${prop}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  return { ctx, recording: { calls, states } };
}
