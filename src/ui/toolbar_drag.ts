import { t } from '../i18n';
import {
  type DockId,
  nearestDock,
  type ToolbarDock,
  toolbarDocks,
} from './toolbar_docking';

const STORAGE_KEY = 'markasso-toolbar-pos';
const HINTS = '#hint-bar, #shortcuts-hint';
const OBSTACLES =
  '.tb-island-topleft, .tb-island-topright, #minimap, #zoom-controls, #history-controls';

/** Docking supports dragging, click-to-place and keyboard navigation. */
export function initToolbarDrag(
  pill: HTMLElement,
  handle: HTMLButtonElement,
): void {
  let anchor: DockId = 'bottom-center';
  let legacy: { x: number; y: number } | undefined;
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    );
    if (
      typeof saved === 'string' &&
      /^(top|bottom)-(left|center|right)$/.test(saved)
    )
      anchor = saved as DockId;
    else if (
      saved &&
      typeof saved === 'object' &&
      'x' in saved &&
      'y' in saved &&
      typeof saved.x === 'number' &&
      typeof saved.y === 'number' &&
      Number.isFinite(saved.x) &&
      Number.isFinite(saved.y)
    )
      legacy = { x: saved.x, y: saved.y };
  } catch {
    /* Storage may be unavailable. */
  }
  let docks: ToolbarDock[] = [];
  let placing = false;
  let target: ToolbarDock | undefined;
  let dragged = false;
  let press:
    | { id: number; x: number; y: number; dx: number; dy: number }
    | undefined;
  const preview = document.createElement('div');
  preview.className = 'toolbar-dock-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.hidden = true;
  const magnets = document.createElement('div');
  magnets.className = 'toolbar-dock-magnets';
  magnets.setAttribute('aria-hidden', 'true');
  const guide = document.createElement('div');
  guide.className = 'toolbar-dock-guide';
  guide.setAttribute('role', 'status');
  guide.hidden = true;
  guide.textContent = t('toolbarDockGuide');
  document.body.append(preview, magnets, guide);

  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(anchor));
    } catch {
      /* ignore */
    }
  }
  function showTarget(dock: ToolbarDock | undefined): void {
    target = dock;
    preview.hidden = !dock;
    if (!dock) return;
    preview.style.left = `${dock.x}px`;
    preview.style.top = `${dock.y}px`;
    preview.style.width = `${pill.offsetWidth}px`;
    preview.style.height = `${pill.offsetHeight}px`;
  }
  function showMagnets(): void {
    magnets.replaceChildren();
    guide.hidden = !placing && !dragged;
    if (!placing && !dragged) return;
    for (const dock of docks) {
      const marker = document.createElement('span');
      marker.textContent = {
        'top-left': '↖',
        'top-center': '↑',
        'top-right': '↗',
        'bottom-left': '↙',
        'bottom-center': '↓',
        'bottom-right': '↘',
      }[dock.id];
      marker.style.left = `${dock.x + pill.offsetWidth / 2}px`;
      marker.style.top = `${dock.y + pill.offsetHeight / 2}px`;
      magnets.append(marker);
    }
  }
  function apply(): void {
    if (!pill.offsetWidth || !pill.offsetHeight) return;
    const hints = [...document.querySelectorAll<HTMLElement>(HINTS)];
    for (const hint of hints) resize.observe(hint);
    const hintHeight =
      window.innerWidth > 600 && !window.matchMedia('(pointer: coarse)').matches
        ? Math.max(30, ...hints.map((hint) => hint.offsetHeight)) + 8
        : 0;
    const obstacles = [
      ...document.querySelectorAll<HTMLElement>(OBSTACLES),
    ].flatMap((el) => {
      resize.observe(el);
      const style = getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      )
        return [];
      const r = el.getBoundingClientRect();
      return r.width && r.height
        ? [{ x: r.left, y: r.top, width: r.width, height: r.height }]
        : [];
    });
    docks = toolbarDocks(
      { width: window.innerWidth, height: window.innerHeight },
      { width: pill.offsetWidth, height: pill.offsetHeight + hintHeight },
      obstacles,
    ).map((dock) =>
      dock.id.startsWith('bottom-')
        ? { ...dock, y: dock.y + hintHeight }
        : dock,
    );
    const r = pill.getBoundingClientRect();
    const dock =
      (legacy
        ? nearestDock(docks, legacy)
        : docks.find((d) => d.id === anchor)) ??
      nearestDock(docks, { x: r.left, y: r.top });
    if (!dock) return;
    legacy = undefined;
    anchor = dock.id;
    pill.classList.add('tb-island-tools--moved');
    pill.classList.toggle('tb-island-tools--below', dock.id.startsWith('top-'));
    pill.style.left = `${dock.x}px`;
    pill.style.top = `${dock.y}px`;
    // Side panels yield space to the chosen dock, including its hint row.
    const atTop = dock.id.startsWith('top-');
    document.documentElement.style.setProperty(
      '--toolbar-panel-top',
      atTop ? `${dock.y + pill.offsetHeight + hintHeight + 8}px` : '0px',
    );
    document.documentElement.style.setProperty(
      '--toolbar-panel-bottom',
      atTop ? '0px' : `${window.innerHeight - dock.y + hintHeight + 8}px`,
    );
    const hintHalfWidth =
      Math.max(0, ...hints.map((hint) => hint.offsetWidth)) / 2;
    const hintCenter = Math.max(
      16 + hintHalfWidth,
      Math.min(
        dock.x + pill.offsetWidth / 2,
        window.innerWidth - 16 - hintHalfWidth,
      ),
    );
    document.documentElement.style.setProperty(
      '--toolbar-hint-center',
      `${hintCenter}px`,
    );
    document.documentElement.style.setProperty(
      '--toolbar-hint-top',
      `${atTop ? dock.y + pill.offsetHeight + 8 : dock.y - 8}px`,
    );
    document.documentElement.style.setProperty(
      '--toolbar-hint-transform',
      atTop ? 'translateX(-50%)' : 'translate(-50%, -100%)',
    );
    save();
    showMagnets();
    if (target) showTarget(docks.find((d) => d.id === target?.id));
  }
  function commit(dock: ToolbarDock | undefined): void {
    if (dock) anchor = dock.id;
    showTarget(undefined);
    apply();
  }
  function setPlacing(on: boolean): void {
    placing = on;
    handle.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('toolbar-placing', on);
    showMagnets();
    if (!on) showTarget(undefined);
  }
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = pill.getBoundingClientRect();
    press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
    };
    dragged = false;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId) return;
    if (!dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 3)
      return;
    dragged = true;
    setPlacing(false);
    pill.classList.add('tb-island-tools--dragging');
    showTarget(
      nearestDock(docks, { x: e.clientX - press.dx, y: e.clientY - press.dy }),
    );
  });
  function endPress(e: PointerEvent): void {
    if (!press || press.id !== e.pointerId) return;
    press = undefined;
    pill.classList.remove('tb-island-tools--dragging');
    if (dragged && e.type === 'pointerup') commit(target);
    showTarget(undefined);
    magnets.replaceChildren();
    guide.hidden = true;
    if (e.type !== 'pointerup') dragged = false;
  }
  handle.addEventListener('pointerup', endPress);
  handle.addEventListener('pointercancel', endPress);
  handle.addEventListener('lostpointercapture', endPress);
  handle.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    setPlacing(!placing);
  });
  document.addEventListener('pointermove', (e) => {
    if (placing)
      showTarget(
        nearestDock(docks, {
          x: e.clientX - pill.offsetWidth / 2,
          y: e.clientY - pill.offsetHeight / 2,
        }),
      );
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!placing || handle.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      const dock = nearestDock(docks, {
        x: e.clientX - pill.offsetWidth / 2,
        y: e.clientY - pill.offsetHeight / 2,
      });
      setPlacing(false);
      commit(dock);
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
  function reset(): void {
    setPlacing(false);
    anchor = 'bottom-center';
    apply();
  }
  handle.addEventListener('dblclick', reset);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      reset();
      return;
    }
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    e.stopPropagation();
    const [row, align] = anchor.split('-');
    const aligns = ['left', 'center', 'right'];
    const index = aligns.indexOf(align!);
    const nextRow =
      e.key === 'ArrowUp' ? 'top' : e.key === 'ArrowDown' ? 'bottom' : row;
    const nextAlign =
      e.key === 'ArrowLeft'
        ? aligns[Math.max(0, index - 1)]
        : e.key === 'ArrowRight'
          ? aligns[Math.min(2, index + 1)]
          : align;
    setPlacing(false);
    commit(docks.find((d) => d.id === `${nextRow}-${nextAlign}`));
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || (!placing && !press)) return;
    e.preventDefault();
    setPlacing(false);
    press = undefined;
    pill.classList.remove('tb-island-tools--dragging');
    magnets.replaceChildren();
    guide.hidden = true;
  });
  let frame = 0;
  function schedule(): void {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
  }
  // Observe UI visibility and size changes, excluding our own position writes.
  new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          r.target instanceof Element &&
          !pill.contains(r.target) &&
          !preview.contains(r.target) &&
          !magnets.contains(r.target) &&
          (r.target.matches('#app, body') ||
            r.target.matches(`${OBSTACLES}, ${HINTS}`) ||
            (r.type === 'childList' &&
              [...r.addedNodes].some(
                (n) =>
                  n instanceof Element &&
                  (n.matches(`${OBSTACLES}, ${HINTS}`) ||
                    n.querySelector(`${OBSTACLES}, ${HINTS}`)),
              ))),
      )
    )
      schedule();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  });
  const resize = new ResizeObserver(schedule);
  resize.observe(pill);
  document.querySelectorAll<HTMLElement>(OBSTACLES).forEach((el) => {
    resize.observe(el);
  });
  document.body.addEventListener('transitionend', schedule);
  window.addEventListener('resize', schedule);
  schedule();
}
