import { launchConfetti } from './ui/confetti';

/**
 * Motion for the static pages (/cloud, /mac), with no dependency:
 * - the h1 types itself in, ending on a blinking terminal cursor;
 * - the board's dot grid drifts a little with the pointer;
 * - a hand-drawn arrow draws itself towards the main button;
 * - `[data-reveal]` blocks (and their list items, one by one) fade in when
 *   scrolled into view;
 * - the Konami code launches confetti.
 * Under `prefers-reduced-motion` everything is shown at once and nothing
 * moves (the Konami confetti already respects it).
 */
export function initSiteFx(): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add(reduced ? 'fx-static' : 'fx');
  typeTitle(reduced);
  if (!reduced) driftGrid();
  drawArrow();
  revealOnScroll(reduced);
  konami();
}

/** Types the (already translated) h1 in; screen readers get the full text at once. */
function typeTitle(reduced: boolean): void {
  const h1 = document.querySelector('h1');
  const text = h1?.textContent?.trim();
  if (!h1 || !text) return;
  const full = document.createElement('span');
  full.className = 'sr-only';
  full.textContent = text;
  const typed = document.createElement('span');
  typed.setAttribute('aria-hidden', 'true');
  const cursor = document.createElement('span');
  cursor.className = 'type-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.textContent = '▌';
  h1.replaceChildren(full, typed, cursor);
  if (reduced) {
    typed.textContent = text;
    document.documentElement.classList.add('fx-typed');
    return;
  }
  const chars = [...text];
  let i = 0;
  const step = (): void => {
    typed.textContent = chars.slice(0, ++i).join('');
    if (i < chars.length) setTimeout(step, 38 + Math.random() * 40);
    else document.documentElement.classList.add('fx-typed');
  };
  setTimeout(step, 250);
}

/** Moves the background dot grid by up to 14px opposite to the pointer. */
function driftGrid(): void {
  let frame = 0;
  window.addEventListener('pointermove', (event) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const x = (event.clientX / window.innerWidth - 0.5) * -28;
      const y = (event.clientY / window.innerHeight - 0.5) * -28;
      document.documentElement.style.setProperty(
        '--grid-x',
        `${x.toFixed(1)}px`,
      );
      document.documentElement.style.setProperty(
        '--grid-y',
        `${y.toFixed(1)}px`,
      );
    });
  });
}

/** A Markasso-style hand-drawn arrow pointing at the first button in #checkout. */
function drawArrow(): void {
  const checkout = document.getElementById('checkout');
  if (!checkout) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'hand-arrow');
  svg.setAttribute('viewBox', '0 0 140 70');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    // Shaft ends at the tip (14,52) heading down-left; the head is two
    // straight strokes leaving the tip at ±30° from that direction.
    '<path pathLength="1" d="M134 12 C 100 2, 64 10, 42 24 C 30 32, 20 42, 14 52"/>' +
    '<path pathLength="1" class="hand-arrow-head" d="M27 45 L14 52 L14 38"/>';
  checkout.append(svg);
}

/** Adds `.is-visible` to `[data-reveal]` blocks as they scroll into view. */
function revealOnScroll(reduced: boolean): void {
  const blocks = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
  for (const block of blocks)
    block.querySelectorAll<HTMLElement>('li').forEach((li, i) => {
      li.style.setProperty('--i', String(i));
    });
  if (reduced || !('IntersectionObserver' in window)) {
    for (const block of blocks) block.classList.add('is-visible');
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15 },
  );
  for (const block of blocks) observer.observe(block);
}

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/** ↑↑↓↓←→←→BA: confetti. */
function konami(): void {
  let at = 0;
  window.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    at = key === KONAMI[at] ? at + 1 : key === KONAMI[0] ? 1 : 0;
    if (at === KONAMI.length) {
      at = 0;
      launchConfetti();
    }
  });
}
