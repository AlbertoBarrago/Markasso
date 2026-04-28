import type {
  Element,
  RectangleElement,
  EllipseElement,
  RhombusElement,
  ArrowElement,
  LineElement,
  TextElement,
} from '../elements/element';

export interface PresetDef {
  id: string;
  labelKey: string;
  icon: string;
  buildElements(cx: number, cy: number, isDark: boolean): Element[];
}

// ── Color palette (mirrors MERMAID_COLORS in mermaid.ts) ──────────────────────

const PRESET_COLORS = {
  dark: {
    rectangle: { fill: 'rgba(77,150,255,0.18)',  stroke: '#4d96ff' },
    rhombus:   { fill: 'rgba(255,107,107,0.18)', stroke: '#ff6b6b' },
    ellipse:   { fill: 'rgba(107,203,119,0.18)', stroke: '#6bcb77' },
  },
  light: {
    rectangle: { fill: 'rgba(77,150,255,0.14)',  stroke: '#1a6fd4' },
    rhombus:   { fill: 'rgba(220,50,50,0.10)',   stroke: '#c0392b' },
    ellipse:   { fill: 'rgba(40,160,70,0.10)',   stroke: '#27ae60' },
  },
} as const;

const BASE = { strokeWidth: 1.5, opacity: 1, roughness: 0 } as const;

// ── Bounding-box center translation ───────────────────────────────────────────

function translate(els: Element[], cx: number, cy: number): Element[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of els) {
    if (
      el.type === 'rectangle' ||
      el.type === 'ellipse' ||
      el.type === 'rhombus' ||
      el.type === 'text' ||
      el.type === 'image'
    ) {
      const w = 'width' in el ? el.width : 0;
      const h = 'height' in el ? el.height : 0;
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + w);
      maxY = Math.max(maxY, el.y + h);
    } else if (el.type === 'arrow' || el.type === 'line') {
      minX = Math.min(minX, el.x, el.x2);
      minY = Math.min(minY, el.y, el.y2);
      maxX = Math.max(maxX, el.x, el.x2);
      maxY = Math.max(maxY, el.y, el.y2);
    }
  }

  const bbCx = (minX + maxX) / 2;
  const bbCy = (minY + maxY) / 2;
  const dx = cx - bbCx;
  const dy = cy - bbCy;

  return els.map((el) => {
    if (el.type === 'arrow' || el.type === 'line') {
      return { ...el, x: el.x + dx, y: el.y + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    }
    return { ...el, x: el.x + dx, y: el.y + dy };
  });
}

// ── Preset: Flowchart ─────────────────────────────────────────────────────────

function buildFlowchart(cx: number, cy: number, isDark: boolean): Element[] {
  const pal = isDark ? PRESET_COLORS.dark : PRESET_COLORS.light;
  const arrowStroke = isDark ? '#e2e2ef' : '#000000';

  const startId  = crypto.randomUUID();
  const processId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const endId    = crypto.randomUUID();

  const start: EllipseElement = {
    ...BASE, id: startId, type: 'ellipse',
    x: -70, y: -220, width: 140, height: 50,
    strokeColor: pal.ellipse.stroke, fillColor: pal.ellipse.fill,
    label: 'Start',
  };
  const process: RectangleElement = {
    ...BASE, id: processId, type: 'rectangle',
    x: -80, y: -120, width: 160, height: 55,
    strokeColor: pal.rectangle.stroke, fillColor: pal.rectangle.fill,
    label: 'Process',
  };
  const decision: RhombusElement = {
    ...BASE, id: decisionId, type: 'rhombus',
    x: -80, y: -5, width: 160, height: 80,
    strokeColor: pal.rhombus.stroke, fillColor: pal.rhombus.fill,
    label: 'Decision?',
  };
  const end: EllipseElement = {
    ...BASE, id: endId, type: 'ellipse',
    x: -70, y: 145, width: 140, height: 50,
    strokeColor: pal.ellipse.stroke, fillColor: pal.ellipse.fill,
    label: 'End',
  };

  const arrow1: ArrowElement = {
    ...BASE, id: crypto.randomUUID(), type: 'arrow',
    x: 0, y: -170, x2: 0, y2: -120,
    strokeColor: arrowStroke, fillColor: 'transparent',
    startElementId: startId, endElementId: processId,
  };
  const arrow2: ArrowElement = {
    ...BASE, id: crypto.randomUUID(), type: 'arrow',
    x: 0, y: -65, x2: 0, y2: -5,
    strokeColor: arrowStroke, fillColor: 'transparent',
    startElementId: processId, endElementId: decisionId,
  };
  const arrow3: ArrowElement = {
    ...BASE, id: crypto.randomUUID(), type: 'arrow',
    x: 0, y: 75, x2: 0, y2: 145,
    strokeColor: arrowStroke, fillColor: 'transparent',
    startElementId: decisionId, endElementId: endId,
  };

  return translate([start, process, decision, end, arrow1, arrow2, arrow3], cx, cy);
}

// ── Preset: Mind Map ──────────────────────────────────────────────────────────

function buildMindMap(cx: number, cy: number, isDark: boolean): Element[] {
  const pal = isDark ? PRESET_COLORS.dark : PRESET_COLORS.light;
  const lineStroke = isDark ? '#e2e2ef' : '#000000';

  const centerId = crypto.randomUUID();
  const center: RectangleElement = {
    ...BASE, id: centerId, type: 'rectangle',
    x: -70, y: -30, width: 140, height: 60,
    strokeColor: pal.rectangle.stroke, fillColor: pal.rectangle.fill,
    label: 'Main Topic', cornerRadius: 8,
  };

  const radius = 180;
  const satelliteCount = 5;
  const els: Element[] = [center];

  for (let i = 0; i < satelliteCount; i++) {
    const angle = (i / satelliteCount) * 2 * Math.PI - Math.PI / 2;
    const satCx = Math.round(radius * Math.cos(angle));
    const satCy = Math.round(radius * Math.sin(angle));

    const satId = crypto.randomUUID();
    const sat: EllipseElement = {
      ...BASE, id: satId, type: 'ellipse',
      x: satCx - 55, y: satCy - 23, width: 110, height: 46,
      strokeColor: pal.ellipse.stroke, fillColor: pal.ellipse.fill,
      label: `Topic ${i + 1}`,
    };

    const line: LineElement = {
      ...BASE, id: crypto.randomUUID(), type: 'line',
      x: 0, y: 0, x2: satCx, y2: satCy,
      strokeColor: lineStroke, fillColor: 'transparent',
      strokeWidth: 1.2,
      startElementId: centerId, endElementId: satId,
    };

    els.push(line, sat);
  }

  return translate(els, cx, cy);
}

// ── Preset: SWOT Analysis ─────────────────────────────────────────────────────

function buildSwot(cx: number, cy: number, isDark: boolean): Element[] {
  const pal = isDark ? PRESET_COLORS.dark : PRESET_COLORS.light;
  const textStroke = isDark ? '#e2e2ef' : '#1a1a28';

  const cellW = 175;
  const cellH = 135;
  const gap = 10;

  const title: TextElement = {
    ...BASE, id: crypto.randomUUID(), type: 'text',
    x: -(cellW + gap / 2), y: -185,
    width: (cellW * 2 + gap), height: 28,
    content: 'SWOT Analysis',
    fontSize: 15, fontFamily: 'Arial, sans-serif',
    textAlign: 'center',
    strokeColor: textStroke, fillColor: 'transparent',
    strokeWidth: 0,
  };

  const cells: { label: string; x: number; y: number; color: { fill: string; stroke: string } }[] = [
    { label: 'Strengths',     x: -(cellW + gap / 2), y: -150, color: pal.ellipse },
    { label: 'Weaknesses',    x: gap / 2,            y: -150, color: pal.rhombus },
    { label: 'Opportunities', x: -(cellW + gap / 2), y: -150 + cellH + gap, color: pal.ellipse },
    { label: 'Threats',       x: gap / 2,            y: -150 + cellH + gap, color: pal.rhombus },
  ];

  const rects: RectangleElement[] = cells.map((c) => ({
    ...BASE, id: crypto.randomUUID(), type: 'rectangle',
    x: c.x, y: c.y, width: cellW, height: cellH,
    strokeColor: c.color.stroke, fillColor: c.color.fill,
    label: c.label, cornerRadius: 4,
  }));

  return translate([title, ...rects], cx, cy);
}

// ── Preset: Sequence Diagram ──────────────────────────────────────────────────

function buildSequence(cx: number, cy: number, isDark: boolean): Element[] {
  const pal = isDark ? PRESET_COLORS.dark : PRESET_COLORS.light;
  const arrowStroke = isDark ? '#e2e2ef' : '#000000';

  const actorW = 140;
  const actorH = 50;
  const spacing = 260;

  const actorA: RectangleElement = {
    ...BASE, id: crypto.randomUUID(), type: 'rectangle',
    x: 0, y: 0, width: actorW, height: actorH,
    strokeColor: pal.rectangle.stroke, fillColor: pal.rectangle.fill,
    label: 'Actor A',
  };
  const actorB: RectangleElement = {
    ...BASE, id: crypto.randomUUID(), type: 'rectangle',
    x: spacing, y: 0, width: actorW, height: actorH,
    strokeColor: pal.ellipse.stroke, fillColor: pal.ellipse.fill,
    label: 'Actor B',
  };

  const lifelineAx = actorW / 2;
  const lifelineBx = spacing + actorW / 2;
  const lifelineTop = actorH;
  const lifelineBot = actorH + 210;

  const lifelineA: LineElement = {
    ...BASE, id: crypto.randomUUID(), type: 'line',
    x: lifelineAx, y: lifelineTop, x2: lifelineAx, y2: lifelineBot,
    strokeColor: arrowStroke, fillColor: 'transparent',
    strokeWidth: 1, strokeStyle: 'dashed', opacity: 0.35,
  };
  const lifelineB: LineElement = {
    ...BASE, id: crypto.randomUUID(), type: 'line',
    x: lifelineBx, y: lifelineTop, x2: lifelineBx, y2: lifelineBot,
    strokeColor: arrowStroke, fillColor: 'transparent',
    strokeWidth: 1, strokeStyle: 'dashed', opacity: 0.35,
  };

  const msgY1 = actorH + 60;
  const msgY2 = actorH + 120;
  const msgY3 = actorH + 180;

  const req: ArrowElement = {
    ...BASE, id: crypto.randomUUID(), type: 'arrow',
    x: lifelineAx, y: msgY1, x2: lifelineBx, y2: msgY1,
    strokeColor: arrowStroke, fillColor: 'transparent',
    label: 'Request',
  };
  const resp: ArrowElement = {
    ...BASE, id: crypto.randomUUID(), type: 'arrow',
    x: lifelineBx, y: msgY2, x2: lifelineAx, y2: msgY2,
    strokeColor: arrowStroke, fillColor: 'transparent',
    strokeStyle: 'dashed', label: 'Response',
  };
  const ack: ArrowElement = {
    ...BASE, id: crypto.randomUUID(), type: 'arrow',
    x: lifelineAx, y: msgY3, x2: lifelineBx, y2: msgY3,
    strokeColor: arrowStroke, fillColor: 'transparent',
    label: 'Ack',
  };

  return translate([actorA, actorB, lifelineA, lifelineB, req, resp, ack], cx, cy);
}

// ── Icons (18×18 SVG thumbnails) ──────────────────────────────────────────────

const IC_FLOWCHART = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="10" height="5" rx="1"/><path d="M10 7v2"/><path d="M6 9h8l-4 5z"/><path d="M10 14v2"/><ellipse cx="10" cy="17.5" rx="4" ry="1.5"/></svg>`;
const IC_MINDMAP   = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5"/><circle cx="10" cy="3" r="1.5"/><circle cx="17" cy="7" r="1.5"/><circle cx="17" cy="13" r="1.5"/><circle cx="3" cy="7" r="1.5"/><circle cx="3" cy="13" r="1.5"/><line x1="10" y1="7.5" x2="10" y2="4.5"/><line x1="12.2" y1="8.7" x2="15.7" y2="7.9"/><line x1="12.2" y1="11.3" x2="15.7" y2="12.1"/><line x1="7.8" y1="8.7" x2="4.3" y2="7.9"/><line x1="7.8" y1="11.3" x2="4.3" y2="12.1"/></svg>`;
const IC_SWOT      = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>`;
const IC_SEQUENCE  = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="6" height="4" rx="1"/><rect x="12" y="2" width="6" height="4" rx="1"/><line x1="5" y1="6" x2="5" y2="18" stroke-dasharray="1.5 1.5" opacity="0.5"/><line x1="15" y1="6" x2="15" y2="18" stroke-dasharray="1.5 1.5" opacity="0.5"/><path d="M5 9h10M15 13H5"/><path d="M13 8l2 1-2 1"/><path d="M7 12l-2 1 2 1"/></svg>`;

// ── Exports ───────────────────────────────────────────────────────────────────

export const PRESETS: PresetDef[] = [
  { id: 'flowchart', labelKey: 'presetFlowchart', icon: IC_FLOWCHART, buildElements: buildFlowchart },
  { id: 'mindmap',   labelKey: 'presetMindMap',   icon: IC_MINDMAP,   buildElements: buildMindMap },
  { id: 'swot',      labelKey: 'presetSwot',      icon: IC_SWOT,      buildElements: buildSwot },
  { id: 'sequence',  labelKey: 'presetSequence',  icon: IC_SEQUENCE,  buildElements: buildSequence },
];
