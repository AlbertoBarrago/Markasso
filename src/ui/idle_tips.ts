import type { History } from '../engine/history';
import { t } from '../i18n';
import { onLiveHide, onLiveReveal } from './live_name';
import {
  buildTips,
  markShown,
  markUsed,
  parseTipStats,
  pickTip,
  type Tip,
  type TipContext,
  type TipEvent,
  type TipStats,
} from './tips';

const STORAGE_KEY = 'markasso-tips';
/** Inactivity before a tip appears. */
const IDLE_MS = 20_000;
/** Minimum gap between two tips. */
const COOLDOWN_MS = 60_000;
/** How long a tip stays when nothing hides it earlier. */
const VISIBLE_MS = 8_000;
/** First tip after load, so it does not compete with the first paint. */
const STARTUP_MS = 1_500;

/** UI that has the user's attention: no tip while any of it is on screen. */
const BUSY_SELECTORS = [
  '#cmd-palette-overlay',
  '#el-search-overlay',
  '#shortcuts-help',
  '#welcome-overlay',
  '#whats-new-overlay',
  '#guide-modal',
  '#report-modal',
  '#star-modal',
  '.settings-panel.open',
  '.tb-more-panel.open',
  '#library-panel.open',
].join(', ');

const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'rhombus', 'shape']);

function loadStats(): TipStats {
  try {
    return parseTipStats(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked (private mode, disabled site data): tips still work
    // for this visit, they just restart on the next one.
    return {};
  }
}

function saveStats(stats: TipStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* See loadStats. */
  }
}

/** True while typing, or while a menu, dialog or panel is open. */
function isBusy(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (
    active &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable)
  )
    return true;
  for (const el of document.querySelectorAll(BUSY_SELECTORS))
    if (el.getClientRects().length > 0) return true;
  return false;
}

/**
 * Shows one short tip after a stretch of inactivity, in the hint spot that
 * follows the toolbar (#shortcuts-hint). Tips teach what the user has not
 * used yet, retire after a few showings, never appear on touch devices or
 * while the user is busy, and can be turned off in Preferences.
 */
export function initIdleTips(appEl: HTMLElement, history: History): void {
  const tips = buildTips(navigator.platform.toUpperCase().includes('MAC'));
  let stats = loadStats();
  let isLive = false;
  let lastId: string | null = null;
  let lastShownAt = Number.NEGATIVE_INFINITY;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const hint = document.createElement('div');
  hint.id = 'shortcuts-hint';
  hint.setAttribute('role', 'status');
  appEl.appendChild(hint);

  const touch = window.matchMedia('(pointer: coarse)');

  function context(): TipContext {
    const { elements, selectedIds } = history.present;
    return {
      elementCount: elements.length,
      selectedCount: selectedIds.size,
      hasShapes: elements.some((el) => SHAPE_TYPES.has(el.type)),
      isLive,
    };
  }

  /** Tip text with its shortcut as a <kbd>, built without innerHTML. */
  function render(tip: Tip): void {
    hint.replaceChildren();
    const [before, after] = t(tip.textKey).split('{{key}}');
    hint.append(before ?? '');
    if (tip.key !== undefined && after !== undefined) {
      const kbd = document.createElement('kbd');
      kbd.textContent = tip.key;
      hint.append(kbd, after);
    }
  }

  function hide(): void {
    clearTimeout(hideTimer);
    hint.classList.remove('sh-hint-visible');
  }

  function canShow(): boolean {
    return (
      !touch.matches &&
      !document.hidden &&
      !appEl.classList.contains('tips-hidden') &&
      !document.body.classList.contains('ui-hidden') &&
      !isBusy()
    );
  }

  function show(): void {
    if (!canShow()) return;
    const tip = pickTip(tips, context(), stats, lastId);
    if (!tip) return;
    render(tip);
    hint.classList.add('sh-hint-visible');
    lastId = tip.id;
    lastShownAt = Date.now();
    stats = markShown(stats, tip.id);
    saveStats(stats);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, VISIBLE_MS);
  }

  function scheduleIdle(): void {
    clearTimeout(idleTimer);
    const wait = Math.max(IDLE_MS, lastShownAt + COOLDOWN_MS - Date.now());
    idleTimer = setTimeout(() => {
      show();
      scheduleIdle();
    }, wait);
  }

  function learn(e: TipEvent): void {
    const next = markUsed(tips, stats, e);
    if (next === stats) return;
    stats = next;
    saveStats(stats);
  }

  // Interacting hides the tip; any activity, moving the pointer included,
  // restarts the idle countdown.
  const onInteract = (): void => {
    hide();
    scheduleIdle();
  };
  window.addEventListener('pointerdown', onInteract, { capture: true });
  window.addEventListener('wheel', onInteract, {
    capture: true,
    passive: true,
  });
  window.addEventListener('pointermove', scheduleIdle, {
    capture: true,
    passive: true,
  });
  window.addEventListener(
    'keydown',
    (e) => {
      onInteract();
      learn({
        type: 'key',
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      });
    },
    { capture: true },
  );
  // Double-clicking the canvas is how a shape gets its label.
  window.addEventListener(
    'dblclick',
    (e) => {
      if (e.target instanceof HTMLCanvasElement) learn({ type: 'dblclick' });
    },
    { capture: true },
  );
  onLiveReveal(() => {
    isLive = true;
    learn({ type: 'live' });
  });
  onLiveHide(() => {
    isLive = false;
  });

  setTimeout(() => {
    show();
    scheduleIdle();
  }, STARTUP_MS);
}
