import type { Element } from '../elements/element';
import type { Viewport } from '../core/viewport';
import type { History } from '../engine/history';

const STORAGE_KEY = 'markasso-session';
const DEBOUNCE_MS = 500;

// ── Load (called before History is created) ─────────────────────────────────

export function loadSession(): { elements: Element[]; viewport: Viewport } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(d['elements']) || (d['elements'] as unknown[]).length === 0) return null;
    const elements = d['elements'] as Element[];
    let viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    if (typeof d['viewport'] === 'object' && d['viewport'] !== null) {
      const v = d['viewport'] as Record<string, unknown>;
      if (typeof v['offsetX'] === 'number' && typeof v['offsetY'] === 'number' && typeof v['zoom'] === 'number') {
        viewport = { offsetX: v['offsetX'], offsetY: v['offsetY'], zoom: v['zoom'] };
      }
    }
    return { elements, viewport };
  } catch {
    return null;
  }
}

// ── Init (called after all UI is wired up) ──────────────────────────────────

export function initSession(history: History): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  history.subscribe((scene) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      if (scene.elements.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: 1,
          viewport: scene.viewport,
          elements: scene.elements,
        }));
      } catch (e) {
        if (e instanceof DOMException && (
          e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        )) {
          showQuotaWarning();
        }
      }
    }, DEBOUNCE_MS);
  });
}

// ── Quota warning toast ─────────────────────────────────────────────────────

function showQuotaWarning(): void {
  if (document.getElementById('markasso-quota-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'markasso-quota-toast';
  toast.className = 'quota-toast';
  toast.innerHTML = `
    <span>Session not saved — storage quota exceeded. Use <strong>Save .markasso</strong> to keep your work.</span>
    <button class="quota-toast-close" title="Dismiss">✕</button>
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  const dismiss = (): void => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };
  toast.querySelector('.quota-toast-close')?.addEventListener('click', dismiss);
  setTimeout(dismiss, 8000);
}
