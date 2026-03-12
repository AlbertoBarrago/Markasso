import type { Element } from '../elements/element';
import type { Viewport } from '../core/viewport';
import type { History } from '../engine/history';
import { fitToElements } from '../core/viewport';

// ── Format ──────────────────────────────────────────────────────────────────

const FORMAT_VERSION = 1;

interface MarkassoFile {
  version: number;
  viewport: Viewport;
  elements: Element[];
}

// ── Export ──────────────────────────────────────────────────────────────────

export function exportMarkasso(scene: { elements: ReadonlyArray<Element>; viewport: Viewport }): void {
  const file: MarkassoFile = {
    version: FORMAT_VERSION,
    viewport: { ...scene.viewport },
    elements: scene.elements as Element[],
  };
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'markasso-export.markasso';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Import ──────────────────────────────────────────────────────────────────

export function importMarkasso(file: File, history: History): void {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const raw = ev.target?.result as string;
    if (!raw) return;
    try {
      const validated = validateMarkassoFile(JSON.parse(raw) as unknown);
      if (!validated) {
        alert('This file does not appear to be a valid .markasso file.');
        return;
      }
      const viewport: Viewport = validated.viewport ?? fitToElements(
        validated.elements,
        window.innerWidth,
        window.innerHeight,
      );
      history.dispatch({ type: 'LOAD_SCENE', elements: validated.elements, viewport });
    } catch {
      alert('Failed to read .markasso file. The file may be corrupted.');
    }
  };
  reader.readAsText(file);
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateMarkassoFile(data: unknown): MarkassoFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d['version'] !== 'number') return null;
  if (d['version'] > FORMAT_VERSION) {
    console.warn(`[Markasso] File version ${d['version']} is newer than supported (${FORMAT_VERSION}). Some elements may not load correctly.`);
  }
  if (!Array.isArray(d['elements'])) return null;
  for (const el of d['elements'] as unknown[]) {
    if (typeof el !== 'object' || el === null) return null;
    const e = el as Record<string, unknown>;
    if (typeof e['type'] !== 'string' || typeof e['id'] !== 'string') return null;
  }
  let viewport: Viewport | undefined;
  if (typeof d['viewport'] === 'object' && d['viewport'] !== null) {
    const v = d['viewport'] as Record<string, unknown>;
    if (typeof v['offsetX'] === 'number' && typeof v['offsetY'] === 'number' && typeof v['zoom'] === 'number') {
      viewport = { offsetX: v['offsetX'], offsetY: v['offsetY'], zoom: v['zoom'] };
    }
  }
  return {
    version: d['version'] as number,
    viewport: viewport ?? { offsetX: 0, offsetY: 0, zoom: 1 },
    elements: d['elements'] as Element[],
  };
}
