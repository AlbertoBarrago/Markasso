import type {
  Element,
  RectangleElement,
  EllipseElement,
  RhombusElement,
  ArrowElement,
  LineElement,
} from '../elements/element';
import type { History } from '../engine/history';
import { fitToElements } from '../core/viewport';

// ── Types ──────────────────────────────────────────────────────────────────────

type NodeShape = 'rectangle' | 'ellipse' | 'rhombus';
type Direction = 'TD' | 'LR' | 'RL' | 'BT';

interface MermaidNode {
  id: string;
  label: string;
  shape: NodeShape;
}

interface MermaidEdge {
  from: string;
  to: string;
  edgeKind: 'arrow' | 'line';
  dashed: boolean;
  label: string;
}

export interface ParsedDiagram {
  direction: Direction;
  nodes: Map<string, MermaidNode>;
  edges: MermaidEdge[];
}

// ── Sequence diagram types ─────────────────────────────────────────────────────

interface SequenceParticipant {
  id: string;
  label: string;
}

interface SequenceMessage {
  from: string;
  to: string;
  dashed: boolean;
  label: string;
}

export interface ParsedSequenceDiagram {
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
}

// ── Layout constants ───────────────────────────────────────────────────────────

const NODE_W = 140;
const NODE_H = 60;
const RHOMBUS_W = 160;
const RHOMBUS_H = 80;
const H_GAP = 60;
const V_GAP = 80;

// Sequence diagram layout constants
const SEQ_PART_W = 140;
const SEQ_PART_H = 50;
const SEQ_PART_SPACING = 240; // center-to-center horizontal distance
const SEQ_MSG_FIRST_Y = SEQ_PART_H + 50;
const SEQ_MSG_SPACING = 60;

// ── Public API ─────────────────────────────────────────────────────────────────

export function importMermaid(file: File, history: History): void {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const raw = ev.target?.result as string;
    if (!raw) return;
    importMermaidText(raw, history);
  };
  reader.readAsText(file);
}

export function importMermaidText(text: string, history: History): void {
  try {
    const resolvedTheme = document.documentElement.getAttribute('data-theme');
    const strokeColor = resolvedTheme === 'light' ? '#000000' : '#e2e2ef';

    // Try flowchart / graph
    const flowchart = parseDiagram(text);
    if (flowchart) {
      if (flowchart.nodes.size === 0) { alert('No nodes found in the Mermaid diagram.'); return; }
      const elements = buildElements(flowchart, strokeColor);
      if (elements.length === 0) { alert('No elements could be created from this diagram.'); return; }
      dispatchElements(elements, history);
      return;
    }

    // Try sequenceDiagram
    const sequence = parseSequenceDiagram(text);
    if (sequence) {
      if (sequence.participants.length === 0) { alert('No participants found in the sequence diagram.'); return; }
      const elements = buildSequenceElements(sequence, strokeColor);
      if (elements.length === 0) { alert('No elements could be created from this diagram.'); return; }
      dispatchElements(elements, history);
      return;
    }

    alert(
      'This does not appear to be a supported Mermaid diagram.\n' +
      'Supported types: flowchart / graph, sequenceDiagram.',
    );
  } catch (err) {
    console.error('[Markasso] Mermaid import error:', err);
    alert('Failed to parse the Mermaid diagram.');
  }
}

function dispatchElements(elements: Element[], history: History): void {
  history.dispatch({ type: 'CREATE_ELEMENTS', elements });
  const vp = fitToElements(elements, window.innerWidth, window.innerHeight);
  history.dispatch({ type: 'SET_VIEWPORT', offsetX: vp.offsetX, offsetY: vp.offsetY, zoom: vp.zoom });
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/** Exported for testing. Parses a Mermaid flowchart text into nodes and edges. */
export function parseDiagram(text: string): ParsedDiagram | null {
  const lines = text.split('\n').map((l) => l.trim());

  let direction: Direction = 'TD';
  let headerIdx = -1;

  // Find header line (first non-blank, non-comment)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;

    const m = line.match(/^(?:graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/i);
    if (m) {
      const dir = (m[1] ?? '').toUpperCase();
      direction = (dir === 'TB' ? 'TD' : dir) as Direction;
      headerIdx = i;
      break;
    }
    return null; // first content line is not a supported header
  }

  if (headerIdx === -1) return null;

  const nodes = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    let line = lines[i] ?? '';

    // Strip inline comments
    line = line.replace(/%%.*$/, '').trim();
    if (!line) continue;

    // Skip structural / style keywords
    if (/^(?:subgraph|end|style|classDef|class|linkStyle)\b/.test(line)) continue;

    // Normalize labeled edges: "-- label -->" → "-->|label|"
    line = line.replace(/--\s+([^-]+?)\s+-->/g, '-->|$1|');
    line = line.replace(/--\s+([^-]+?)\s+---/g, '---|$1|');
    line = line.replace(/==\s+([^=]+?)\s+==>/g, '==>|$1|');

    // Split by edge operators; two capturing groups → (edgeOp, label)
    // Yields: [node0, edgeOp1, label1, node1, edgeOp2, label2, node2, ...]
    const parts = line.split(/(==>|-.->|-\.-|-->|---)(?:\|([^|]*)\|)?/);

    if (parts.length === 1) {
      // No edge on this line — standalone node declaration
      const info = parseNodeToken((parts[0] ?? '').trim());
      if (info) ensureNode(info, nodes);
      continue;
    }

    // Walk the alternating (node, edgeOp, label) triplets
    // Index 0 = first node; then every 3 indices: +1=edgeOp, +2=label, +3=next node
    let prevId: string | null = null;

    for (let idx = 0; idx < parts.length; idx += 3) {
      const token = (parts[idx] ?? '').trim();
      if (!token) continue;

      const info = parseNodeToken(token);
      if (!info) continue;

      ensureNode(info, nodes);

      if (prevId !== null) {
        // Edge info sits at the two slots just before the current node index
        const edgeOp = (parts[idx - 2] ?? '').trim();
        const edgeLabel = (parts[idx - 1] ?? '').trim();
        if (edgeOp) {
          edges.push(buildEdge(prevId, info.id, edgeOp, edgeLabel));
        }
      }

      prevId = info.id;
    }
  }

  return { direction, nodes, edges };
}

// ── Node token parsing ─────────────────────────────────────────────────────────

function parseNodeToken(token: string): MermaidNode | null {
  const t = token.trim();
  if (!t) return null;

  // Circle: id((label))
  let m = t.match(/^([A-Za-z0-9_]+)\(\(([^)]*)\)\)$/);
  if (m) return { id: m[1]!, label: cleanLabel(m[2] ?? ''), shape: 'ellipse' };

  // Rectangle: id[label]
  m = t.match(/^([A-Za-z0-9_]+)\[([^\]]*)\]$/);
  if (m) return { id: m[1]!, label: cleanLabel(m[2] ?? ''), shape: 'rectangle' };

  // Diamond: id{label}
  m = t.match(/^([A-Za-z0-9_]+)\{([^}]*)\}$/);
  if (m) return { id: m[1]!, label: cleanLabel(m[2] ?? ''), shape: 'rhombus' };

  // Rounded / stadium: id(label)
  m = t.match(/^([A-Za-z0-9_]+)\(([^)]*)\)$/);
  if (m) return { id: m[1]!, label: cleanLabel(m[2] ?? ''), shape: 'ellipse' };

  // Asymmetric: id>label]
  m = t.match(/^([A-Za-z0-9_]+)>([^\]]*)\]$/);
  if (m) return { id: m[1]!, label: cleanLabel(m[2] ?? ''), shape: 'rectangle' };

  // Bare id (no shape notation)
  m = t.match(/^[A-Za-z0-9_]+$/);
  if (m) return { id: t, label: t, shape: 'rectangle' };

  return null;
}

function cleanLabel(s: string): string {
  return s.replace(/^["']|["']$/g, '').trim();
}

function ensureNode(info: MermaidNode, nodes: Map<string, MermaidNode>): void {
  const existing = nodes.get(info.id);
  if (!existing) {
    nodes.set(info.id, info);
    return;
  }
  // Prefer the definition that carries explicit shape / label over a bare id
  if (existing.label === existing.id && info.label !== info.id) {
    nodes.set(info.id, info);
  }
}

function buildEdge(from: string, to: string, edgeOp: string, label: string): MermaidEdge {
  const dashed = edgeOp === '-.->'; // -.-  is undirected dashed; -.-> is directed dashed
  const edgeKind: 'arrow' | 'line' =
    edgeOp === '---' || edgeOp === '-.-' ? 'line' : 'arrow';
  return { from, to, edgeKind, dashed, label };
}

// ── Layout ─────────────────────────────────────────────────────────────────────

function computeLayout(
  nodes: Map<string, MermaidNode>,
  edges: MermaidEdge[],
  direction: Direction,
): Map<string, { x: number; y: number }> {
  const nodeIds = [...nodes.keys()];

  // Build adjacency list and in-degree map
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));

  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    if (!inDegree.has(edge.to)) inDegree.set(edge.to, 0);
    adj.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  // BFS from root nodes (in-degree 0) to assign depth levels
  const levelMap = new Map<string, number>();
  const roots = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const startNodes = roots.length > 0 ? roots : nodeIds.slice(0, 1); // fallback for pure cycles

  const queue: string[] = [...startNodes];
  for (const r of startNodes) levelMap.set(r, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levelMap.get(current)!;
    for (const neighbor of adj.get(current) ?? []) {
      if ((levelMap.get(neighbor) ?? -1) < currentLevel + 1) {
        levelMap.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      }
    }
  }

  // Assign any nodes not reachable from roots
  for (const id of nodeIds) {
    if (!levelMap.has(id)) levelMap.set(id, 0);
  }

  // Group nodes by level
  const levels = new Map<number, string[]>();
  for (const [id, level] of levelMap) {
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level)!.push(id);
  }

  const maxLevel = Math.max(...levels.keys(), 0);
  const isHorizontal = direction === 'LR' || direction === 'RL';

  // Cross-axis span using the widest level for centering
  const maxNodesInLevel = Math.max(...[...levels.values()].map((l) => l.length));
  const crossUnit = isHorizontal ? NODE_H + H_GAP : NODE_W + H_GAP;
  const maxCrossSpan = (maxNodesInLevel - 1) * crossUnit;

  const positions = new Map<string, { x: number; y: number }>();

  for (const [level, levelNodes] of levels) {
    const count = levelNodes.length;
    const crossSpan = (count - 1) * crossUnit;
    const crossStart = (maxCrossSpan - crossSpan) / 2;

    const mainStep = isHorizontal ? NODE_W + V_GAP : NODE_H + V_GAP;
    const mainAxis = isHorizontal
      ? (direction === 'RL' ? maxLevel - level : level) * mainStep
      : (direction === 'BT' ? maxLevel - level : level) * mainStep;

    levelNodes.forEach((id, i) => {
      const crossAxis = crossStart + i * crossUnit;
      positions.set(id, isHorizontal
        ? { x: mainAxis, y: crossAxis }
        : { x: crossAxis, y: mainAxis });
    });
  }

  return positions;
}

// ── Element builder ────────────────────────────────────────────────────────────

/** Exported for testing. Converts a parsed diagram to Markasso elements. */
export function buildElements(diagram: ParsedDiagram, strokeColor: string): Element[] {
  const { nodes, edges, direction } = diagram;
  const positions = computeLayout(nodes, edges, direction);

  // Map mermaid node id → Markasso element id
  const idMap = new Map<string, string>();
  const shapeElements: Element[] = [];

  for (const [nodeId, node] of nodes) {
    const pos = positions.get(nodeId) ?? { x: 0, y: 0 };
    const elemId = crypto.randomUUID();
    idMap.set(nodeId, elemId);

    const base = {
      id: elemId,
      x: pos.x,
      y: pos.y,
      strokeColor,
      fillColor: 'transparent' as const,
      strokeWidth: 1.5,
      opacity: 1,
      roughness: 0,
    };

    if (node.shape === 'ellipse') {
      const el: EllipseElement = {
        ...base,
        type: 'ellipse',
        width: NODE_W,
        height: NODE_H,
        ...(node.label ? { label: node.label, labelFontSize: 14 } : {}),
      };
      shapeElements.push(el);
    } else if (node.shape === 'rhombus') {
      const el: RhombusElement = {
        ...base,
        type: 'rhombus',
        width: RHOMBUS_W,
        height: RHOMBUS_H,
        ...(node.label ? { label: node.label, labelFontSize: 14 } : {}),
      };
      shapeElements.push(el);
    } else {
      const el: RectangleElement = {
        ...base,
        type: 'rectangle',
        width: NODE_W,
        height: NODE_H,
        ...(node.label ? { label: node.label, labelFontSize: 14 } : {}),
      };
      shapeElements.push(el);
    }
  }

  const connectorElements: Element[] = [];

  for (const edge of edges) {
    const fromElemId = idMap.get(edge.from);
    const toElemId = idMap.get(edge.to);
    if (!fromElemId || !toElemId) continue;

    const fromPos = positions.get(edge.from);
    const toPos = positions.get(edge.to);
    if (!fromPos || !toPos) continue;

    const fromNode = nodes.get(edge.from)!;
    const toNode = nodes.get(edge.to)!;

    const fW = fromNode.shape === 'rhombus' ? RHOMBUS_W : NODE_W;
    const fH = fromNode.shape === 'rhombus' ? RHOMBUS_H : NODE_H;
    const tW = toNode.shape === 'rhombus' ? RHOMBUS_W : NODE_W;
    const tH = toNode.shape === 'rhombus' ? RHOMBUS_H : NODE_H;

    // Connect center-to-center; startElementId/endElementId let the renderer snap to borders
    const x1 = fromPos.x + fW / 2;
    const y1 = fromPos.y + fH / 2;
    const x2 = toPos.x + tW / 2;
    const y2 = toPos.y + tH / 2;

    const connectorBase = {
      id: crypto.randomUUID(),
      x: x1,
      y: y1,
      x2,
      y2,
      strokeColor,
      fillColor: 'transparent' as const,
      strokeWidth: 1.5,
      opacity: 1,
      roughness: 0,
      startElementId: fromElemId,
      endElementId: toElemId,
      ...(edge.dashed ? { strokeStyle: 'dashed' as const } : {}),
    };

    if (edge.edgeKind === 'arrow') {
      const el: ArrowElement = {
        ...connectorBase,
        type: 'arrow',
        ...(edge.label ? { label: edge.label, labelFontSize: 12 } : {}),
      };
      connectorElements.push(el);
    } else {
      const el: LineElement = {
        ...connectorBase,
        type: 'line',
      };
      connectorElements.push(el);
    }
  }

  // Shapes first, connectors on top
  return [...shapeElements, ...connectorElements];
}

// ── Sequence diagram parser ────────────────────────────────────────────────────

/** Exported for testing. Parses a Mermaid sequenceDiagram text. */
export function parseSequenceDiagram(text: string): ParsedSequenceDiagram | null {
  const lines = text.split('\n').map((l) => l.trim());

  // Find header
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line || line.startsWith('%%')) continue;
    if (/^sequenceDiagram\b/i.test(line)) { headerIdx = i; break; }
    return null;
  }
  if (headerIdx === -1) return null;

  const participantOrder: string[] = [];
  const participantMap = new Map<string, SequenceParticipant>();
  const messages: SequenceMessage[] = [];

  // Message arrow pattern: From ->> To: label  (handles ->>, -->>, ->, -->, -x, --x)
  const msgRe = /^([A-Za-z0-9_]+)\s*(->>|-->>|->|-->|-x|--x)\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/;
  // Participant declaration: participant Id as Label  OR  participant Id  OR  actor Id
  const partRe = /^(?:participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/i;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').replace(/%%.*$/, '').trim();
    if (!line) continue;

    // Skip block keywords
    if (/^(?:loop|alt|else|opt|par|and|critical|break|end|rect|Note)\b/i.test(line)) continue;

    const partMatch = line.match(partRe);
    if (partMatch) {
      const id = partMatch[1]!;
      const label = (partMatch[2] ?? id).trim();
      if (!participantMap.has(id)) {
        participantMap.set(id, { id, label });
        participantOrder.push(id);
      }
      continue;
    }

    const msgMatch = line.match(msgRe);
    if (msgMatch) {
      const from = msgMatch[1]!;
      const arrow = msgMatch[2]!;
      const to = msgMatch[3]!;
      const label = (msgMatch[4] ?? '').trim();
      const dashed = arrow.startsWith('--');

      // Auto-register participants seen in messages (preserving encounter order)
      for (const id of [from, to]) {
        if (!participantMap.has(id)) {
          participantMap.set(id, { id, label: id });
          participantOrder.push(id);
        }
      }

      messages.push({ from, to, dashed, label });
    }
  }

  const participants = participantOrder.map((id) => participantMap.get(id)!);
  return { participants, messages };
}

// ── Sequence diagram builder ───────────────────────────────────────────────────

/** Exported for testing. Converts a parsed sequence diagram to Markasso elements. */
export function buildSequenceElements(diagram: ParsedSequenceDiagram, strokeColor: string): Element[] {
  const { participants, messages } = diagram;
  const elements: Element[] = [];

  // Map participant id → column index
  const colIndex = new Map<string, number>(participants.map((p, i) => [p.id, i]));
  const centerX = (id: string) => (colIndex.get(id) ?? 0) * SEQ_PART_SPACING + SEQ_PART_W / 2;

  const totalHeight = SEQ_MSG_FIRST_Y + messages.length * SEQ_MSG_SPACING + 40;

  const base = {
    strokeColor,
    fillColor: 'transparent' as const,
    strokeWidth: 1.5,
    opacity: 1,
    roughness: 0,
  };

  // Participant boxes
  for (const p of participants) {
    const cx = centerX(p.id);
    const el: RectangleElement = {
      ...base,
      id: crypto.randomUUID(),
      type: 'rectangle',
      x: cx - SEQ_PART_W / 2,
      y: 0,
      width: SEQ_PART_W,
      height: SEQ_PART_H,
      ...(p.label ? { label: p.label, labelFontSize: 13 } : {}),
    };
    elements.push(el);
  }

  // Lifelines (dashed vertical lines)
  for (const p of participants) {
    const cx = centerX(p.id);
    const el: LineElement = {
      ...base,
      id: crypto.randomUUID(),
      type: 'line',
      x: cx,
      y: SEQ_PART_H,
      x2: cx,
      y2: totalHeight,
      strokeStyle: 'dashed',
      strokeWidth: 1,
    };
    elements.push(el);
  }

  // Message arrows
  messages.forEach((msg, i) => {
    const y = SEQ_MSG_FIRST_Y + i * SEQ_MSG_SPACING;
    const x1 = centerX(msg.from);
    const x2 = centerX(msg.to);
    const isSelf = msg.from === msg.to;

    if (isSelf) {
      // Self-message: two short arrows forming a bracket shape
      const offset = SEQ_PART_SPACING * 0.3;
      const leg1: LineElement = {
        ...base,
        id: crypto.randomUUID(),
        type: 'line',
        x: x1,
        y,
        x2: x1 + offset,
        y2: y,
        ...(msg.dashed ? { strokeStyle: 'dashed' as const } : {}),
      };
      const leg2: ArrowElement = {
        ...base,
        id: crypto.randomUUID(),
        type: 'arrow',
        x: x1 + offset,
        y,
        x2: x1 + offset,
        y2: y + SEQ_MSG_SPACING * 0.6,
        ...(msg.dashed ? { strokeStyle: 'dashed' as const } : {}),
        ...(msg.label ? { label: msg.label, labelFontSize: 12 } : {}),
      };
      elements.push(leg1, leg2);
    } else {
      const el: ArrowElement = {
        ...base,
        id: crypto.randomUUID(),
        type: 'arrow',
        x: x1,
        y,
        x2,
        y2: y,
        ...(msg.dashed ? { strokeStyle: 'dashed' as const } : {}),
        ...(msg.label ? { label: msg.label, labelFontSize: 12 } : {}),
      };
      elements.push(el);
    }
  });

  return elements;
}
