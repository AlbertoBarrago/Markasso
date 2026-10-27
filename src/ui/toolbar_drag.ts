/**
 * Lets the user move the tools toolbar anywhere inside the viewport through
 * its drag handle. Dragging is never the only way (WCAG 2.5.7): a click on the
 * handle enters a place mode where the next click positions the toolbar, and
 * the arrow keys move it from the keyboard. Double-click or Home puts it back
 * in its default bottom-center position.
 */

const STORAGE_KEY = 'markasso-toolbar-pos';
const DRAG_THRESHOLD = 3; // px of pointer travel before a press becomes a drag
const KEY_STEP = 16; // px per arrow key press, ×4 with Shift
const EDGE = 8; // px kept between the toolbar and the viewport edges

interface Pos {
  x: number;
  y: number;
}

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pos>;
    return typeof p.x === 'number' && typeof p.y === 'number'
      ? { x: p.x, y: p.y }
      : null;
  } catch {
    return null;
  }
}

function savePos(pos: Pos | null): void {
  try {
    if (pos) localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function initToolbarDrag(
  pill: HTMLElement,
  handle: HTMLButtonElement,
): void {
  // Top-left corner in CSS pixels, or null for the default position.
  let pos: Pos | null = loadPos();
  let placing = false;

  function clamp(p: Pos): Pos {
    const maxX = Math.max(EDGE, window.innerWidth - pill.offsetWidth - EDGE);
    const maxY = Math.max(EDGE, window.innerHeight - pill.offsetHeight - EDGE);
    return {
      x: Math.round(Math.min(Math.max(p.x, EDGE), maxX)),
      y: Math.round(Math.min(Math.max(p.y, EDGE), maxY)),
    };
  }

  function apply(): void {
    if (pos) pos = clamp(pos);
    pill.classList.toggle('tb-island-tools--moved', pos !== null);
    // Panels open below the toolbar when it sits in the upper half.
    pill.classList.toggle(
      'tb-island-tools--below',
      pos !== null && pos.y + pill.offsetHeight / 2 < window.innerHeight / 2,
    );
    pill.style.left = pos ? `${pos.x}px` : '';
    pill.style.top = pos ? `${pos.y}px` : '';
  }

  function moveTo(p: Pos | null): void {
    pos = p;
    apply();
    savePos(pos);
  }

  function currentPos(): Pos {
    const r = pill.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  let press: {
    id: number;
    dx: number;
    dy: number;
    sx: number;
    sy: number;
  } | null = null;
  let dragged = false;

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const start = currentPos();
    press = {
      id: e.pointerId,
      dx: e.clientX - start.x,
      dy: e.clientY - start.y,
      sx: e.clientX,
      sy: e.clientY,
    };
    dragged = false;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (
      !dragged &&
      Math.hypot(e.clientX - press.sx, e.clientY - press.sy) < DRAG_THRESHOLD
    )
      return;
    if (!dragged) {
      dragged = true;
      setPlacing(false);
      pill.classList.add('tb-island-tools--dragging');
    }
    pos = { x: e.clientX - press.dx, y: e.clientY - press.dy };
    apply();
  });
  const endPress = (e: PointerEvent): void => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    if (dragged) {
      pill.classList.remove('tb-island-tools--dragging');
      savePos(pos);
    }
  };
  handle.addEventListener('pointerup', endPress);
  handle.addEventListener('pointercancel', endPress);

  // ── Place mode: click the handle, then click where the toolbar goes ──────
  function setPlacing(on: boolean): void {
    placing = on;
    handle.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('toolbar-placing', on);
  }

  handle.addEventListener('click', () => {
    // The click that ends a drag is not a request for place mode.
    if (dragged) {
      dragged = false;
      return;
    }
    setPlacing(!placing);
  });

  // Capture phase, so the placing click never reaches the canvas or a tool.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!placing || handle.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      setPlacing(false);
      // Center the toolbar on the clicked point.
      moveTo({
        x: e.clientX - pill.offsetWidth / 2,
        y: e.clientY - pill.offsetHeight / 2,
      });
      // Swallow the click that follows this pointerdown as well.
      window.addEventListener(
        'click',
        (ce) => {
          ce.preventDefault();
          ce.stopPropagation();
        },
        { capture: true, once: true },
      );
    },
    { capture: true },
  );

  // ── Reset and keyboard ────────────────────────────────────────────────────
  handle.addEventListener('dblclick', () => {
    setPlacing(false);
    moveTo(null);
  });

  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && placing) {
      e.stopPropagation();
      setPlacing(false);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      moveTo(null);
      return;
    }
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const from = currentPos();
    moveTo({ x: from.x + d[0], y: from.y + d[1] });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && placing) setPlacing(false);
  });

  window.addEventListener('resize', () => {
    if (pos) apply();
  });

  // The pill has no size until it is in the document and laid out.
  requestAnimationFrame(apply);
}
