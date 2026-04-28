import type { ActiveTool } from '../core/app_state';
import type { History } from '../engine/history';
import { t } from '../i18n';

const HIDE_DELAY = 4000;

const HINT_KEYS: Partial<Record<ActiveTool, string>> = {
  select: 'hintSelect',
  hand: 'hintHand',
  eraser: 'hintEraser',
  rectangle: 'hintRectangle',
  ellipse: 'hintEllipse',
  line: 'hintLine',
  rombo: 'hintRombo',
  freehand: 'hintFreehand',
  text: 'hintText',
  sticky: 'hintSticky',
};

function buildHtml(raw: string): string {
  return raw.replace(/\[\[([^\]]+)\]\]/g, '<kbd>$1</kbd>');
}

export function initHintBar(appEl: HTMLElement, history: History): void {
  const bar = document.createElement('div');
  bar.id = 'hint-bar';
  appEl.appendChild(bar);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastTool: ActiveTool | null = null;

  function showHint(tool: ActiveTool): void {
    const key = HINT_KEYS[tool];
    if (!key) return;
    const raw = t(key);
    if (!raw || raw === key) return;

    bar.innerHTML = buildHtml(raw);
    bar.classList.add('hint-bar--visible');

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      bar.classList.remove('hint-bar--visible');
      timer = null;
    }, HIDE_DELAY);
  }

  history.subscribe((scene) => {
    const tool = scene.appState.activeTool;
    if (tool !== lastTool) {
      lastTool = tool;
      showHint(tool);
    }
  });
}
