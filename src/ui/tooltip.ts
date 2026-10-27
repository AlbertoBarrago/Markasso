/**
 * Tooltips for the elements of a container that carry a `title`, following
 * the WAI-ARIA APG tooltip pattern: one shared `role="tooltip"` element shown
 * on hover and on keyboard focus, dismissed by Escape, and referenced by the
 * trigger through `aria-describedby`. The tooltip stays open while the
 * pointer moves onto it (WCAG 1.4.13).
 *
 * The `title` is moved to `data-tooltip` on first contact, so the native
 * browser tooltip never shows. Code may keep setting `title` on the trigger:
 * the newest value is picked up the next time the tooltip opens. Triggers must
 * have their own accessible name (`aria-label` or text), since `title` is
 * removed.
 */

const SHOW_DELAY = 400; // ms before a hover tooltip appears
const HIDE_DELAY = 100; // ms to move the pointer from the trigger to the tooltip
const GAP = 8; // px between trigger and tooltip
const MARGIN = 8; // px kept from the viewport edges

const tip = document.createElement('div');
tip.id = 'tb-tooltip';
tip.className = 'tb-tooltip';
tip.setAttribute('role', 'tooltip');

let trigger: HTMLElement | null = null;
let showTimer = 0;
let hideTimer = 0;
let docListeners = false;

export function initTooltips(root: HTMLElement): void {
  if (!tip.isConnected) document.body.appendChild(tip);

  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = triggerOf(e.target, root);
    if (!el) return;
    clearTimeout(hideTimer);
    if (el === trigger) return;
    clearTimeout(showTimer);
    // Moving between neighbors while a tooltip is open: switch right away.
    if (trigger) show(el);
    else showTimer = window.setTimeout(() => show(el), SHOW_DELAY);
  });
  root.addEventListener('pointerout', (e) => {
    const el = triggerOf(e.target, root);
    if (!el || el.contains(e.relatedTarget as Node | null)) return;
    clearTimeout(showTimer);
    if (el === trigger) scheduleHide();
  });
  root.addEventListener('focusin', (e) => {
    const el = triggerOf(e.target, root);
    if (el?.matches(':focus-visible')) show(el);
  });
  root.addEventListener('focusout', () => hide());
  // Clicking acts on the control; its tooltip would only cover what opens.
  root.addEventListener('pointerdown', () => hide());

  tip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  tip.addEventListener('pointerleave', scheduleHide);

  if (docListeners) return;
  docListeners = true;
  // Capture phase, so Escape dismisses only the tooltip and leaves open
  // panels and the canvas selection alone.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && trigger) {
        e.stopPropagation();
        e.preventDefault();
        hide();
      }
    },
    { capture: true },
  );
  window.addEventListener('blur', () => hide());
  window.addEventListener('resize', () => hide());
}

function triggerOf(target: EventTarget | null, root: HTMLElement) {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[title], [data-tooltip]');
  return el && root.contains(el) ? el : null;
}

function show(el: HTMLElement): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  const title = el.getAttribute('title');
  if (title !== null) {
    el.dataset.tooltip = title;
    el.removeAttribute('title');
  }
  const text = el.dataset.tooltip ?? '';
  if (!text || (el as HTMLButtonElement).disabled) {
    hide();
    return;
  }
  if (trigger && trigger !== el) unlink(trigger);
  trigger = el;
  tip.textContent = text;
  // Announce the text as a description only when it adds to the name.
  if (text !== el.getAttribute('aria-label')) link(el);
  tip.classList.add('visible');
  place(el);
}

function hide(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  if (!trigger) return;
  unlink(trigger);
  trigger = null;
  tip.classList.remove('visible');
}

function scheduleHide(): void {
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hide, HIDE_DELAY);
}

function link(el: HTMLElement): void {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/);
  if (!ids.includes(tip.id)) {
    el.setAttribute('aria-describedby', [...ids, tip.id].join(' ').trim());
  }
}

function unlink(el: HTMLElement): void {
  const ids = (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id && id !== tip.id);
  if (ids.length > 0) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

/** Above the trigger, or below it when there is no room; kept on screen. */
function place(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(
    Math.max(r.left + r.width / 2 - w / 2, MARGIN),
    window.innerWidth - w - MARGIN,
  );
  const above = r.top - GAP - h;
  const top = above >= MARGIN ? above : r.bottom + GAP;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
