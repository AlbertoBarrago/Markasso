import type { Scene } from './src/core/scene';
import { createScene } from './src/core/scene';
import { fitToElements } from './src/core/viewport';
import { History } from './src/engine/history';
import { getLiveRoomId, joinLiveSession } from './src/io/realtime';
import { initSession, loadSession } from './src/io/session';
import { decodeScene, isShareHash } from './src/io/share';
import { initCanvasView } from './src/ui/canvas_view';
import { initCommandPalette } from './src/ui/command_palette';
import { initContextPanel } from './src/ui/context_panel';
import { initElementSearch } from './src/ui/element_search';
import { initGuide } from './src/ui/guide';
import { initHintBar } from './src/ui/hint_bar';
import { initImageImport } from './src/ui/image_import';
import { initMinimap } from './src/ui/minimap';
import { initMobileActionBar } from './src/ui/mobile_action_bar';
import { initReportForm } from './src/ui/report_form';
import { applySettings, initSettings, loadSettings } from './src/ui/settings';
import { showLiveStatusToast } from './src/ui/share_actions';
import { initShortcuts } from './src/ui/shortcuts';
import { initShortcutsHelp } from './src/ui/shortcuts_help';
import { initStarCta } from './src/ui/star_cta';
import { initToolbar } from './src/ui/toolbar';
import { initWelcome } from './src/ui/welcome';

function printConsoleGreeting(): void {
  const reset = 'color: inherit; font-size: 13px;';
  const title = 'color: #a78bfa; font-size: 18px; font-weight: bold;';
  const accent = 'color: #60a5fa; font-size: 13px;';
  const muted = 'color: #6b7280; font-size: 12px;';

  console.log('%cMarkasso', title);
  console.log('%cHey nerd 👋  Welcome to the console.', accent);
  console.log(
    "%cI'm Alberto (alBz) — the creator of this little whiteboard.",
    reset,
  );
  console.log(
    '%cIf you have ideas, spot a bug, or just want to say hi — open an issue or a PR:',
    reset,
  );
  console.log('%c→ https://github.com/AlbertoBarrago/Markasso', accent);
  console.log(
    "%cAll contributions are welcome. Let's build something cool together.",
    muted,
  );
}

async function bootstrap(): Promise<void> {
  printConsoleGreeting();
  const appEl = document.getElementById('app') as HTMLElement;
  const toolbar = document.getElementById('toolbar') as HTMLElement;
  const workspace = document.getElementById('workspace') as HTMLElement;
  const canvas = document.getElementById('main') as HTMLCanvasElement;

  if (!appEl || !toolbar || !workspace || !canvas) {
    throw new Error('Missing required DOM elements');
  }

  // Check for share link in URL hash — takes priority over session
  let sharedElements: Awaited<ReturnType<typeof decodeScene>> = null;
  if (isShareHash(location.hash)) {
    sharedElements = await decodeScene(location.hash);
    if (sharedElements) {
      // Remove hash from URL without reloading to keep the URL clean after load
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  const session = loadSession();
  let baseScene: Scene;
  if (sharedElements) {
    const vp = fitToElements(
      sharedElements,
      window.innerWidth,
      window.innerHeight,
      { maxZoom: 1 },
    );
    baseScene = { ...createScene(), elements: sharedElements, viewport: vp };
  } else if (session) {
    const base = createScene();
    baseScene = {
      ...base,
      elements: session.elements,
      viewport: session.viewport,
      appState: {
        ...base.appState,
        gridVisible: session.gridVisible,
        gridSize: session.gridSize,
        gridType: session.gridType,
      },
    };
  } else {
    baseScene = createScene();
  }
  const hist = new History(baseScene);

  // Restore persisted UI settings before first paint
  applySettings(appEl, loadSettings());

  initToolbar(toolbar, hist);
  const reportForm = initReportForm(appEl);
  const guide = initGuide(appEl);
  initSettings(
    appEl,
    toolbar,
    hist,
    () => reportForm.open(),
    () => guide.open(),
  );
  initStarCta(appEl, toolbar);
  const { selectTool } = initCanvasView(canvas, hist);
  initContextPanel(workspace, hist, (source) =>
    selectTool.activateFormatPainter(source),
  );
  initImageImport(workspace, hist);
  initMobileActionBar(workspace, hist);
  initShortcuts(hist, selectTool);
  initCommandPalette(hist, selectTool);
  initMinimap(workspace, hist);
  initElementSearch(workspace, hist);
  initShortcutsHelp(appEl);
  initHintBar(appEl, hist);
  initSession(hist);
  if (!session && !sharedElements) initWelcome(appEl, hist);

  // Join a live session if the URL points to one (…?live=roomId)
  if (getLiveRoomId()) {
    joinLiveSession(hist, { onStatus: showLiveStatusToast });
  }
}

bootstrap();
