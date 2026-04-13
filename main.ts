import { History } from './src/engine/history';
import { createScene } from './src/core/scene';
import { loadSession, initSession } from './src/io/session';
import { initCanvasView } from './src/ui/canvas_view';
import { initToolbar } from './src/ui/toolbar';
import { initShortcuts } from './src/ui/shortcuts';
import { initSettings, loadSettings, applySettings } from './src/ui/settings';
import { initContextPanel } from './src/ui/context_panel';
import { initImageImport } from './src/ui/image_import';
import { initMobileActionBar } from './src/ui/mobile_action_bar';
import { initWelcome } from './src/ui/welcome';
import { initShortcutsHelp } from './src/ui/shortcuts_help';
import { initCommandPalette } from './src/ui/command_palette';
import { initMinimap } from './src/ui/minimap';
import { initElementSearch } from './src/ui/element_search';
import { decodeScene, SHARE_HASH_PREFIX } from './src/io/share';
import { fitToElements } from './src/core/viewport';

async function bootstrap(): Promise<void> {
  const appEl    = document.getElementById('app')       as HTMLElement;
  const toolbar  = document.getElementById('toolbar')   as HTMLElement;
  const workspace= document.getElementById('workspace') as HTMLElement;
  const canvas   = document.getElementById('main')      as HTMLCanvasElement;

  if (!appEl || !toolbar || !workspace || !canvas) {
    throw new Error('Missing required DOM elements');
  }

  // Check for share link in URL hash — takes priority over session
  let sharedElements = null;
  if (location.hash.startsWith(SHARE_HASH_PREFIX)) {
    sharedElements = await decodeScene(location.hash);
    if (sharedElements) {
      // Remove hash from URL without reloading to keep the URL clean after load
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  const session = loadSession();
  let baseScene;
  if (sharedElements) {
    const vp = fitToElements(sharedElements, window.innerWidth, window.innerHeight);
    baseScene = { ...createScene(), elements: sharedElements, viewport: { ...vp, zoom: Math.min(vp.zoom, 1) } };
  } else {
    baseScene = session
      ? { ...createScene(), elements: session.elements, viewport: session.viewport }
      : createScene();
  }
  const hist = new History(baseScene);

  // Restore persisted UI settings before first paint
  applySettings(appEl, loadSettings());

  initToolbar(toolbar, hist);
  initSettings(appEl, toolbar, hist);
  const { selectTool } = initCanvasView(canvas, hist);
  initContextPanel(workspace, hist, (source) => selectTool.activateFormatPainter(source));
  initImageImport(workspace, hist);
  initMobileActionBar(workspace, hist);
  initShortcuts(hist, selectTool);
  initCommandPalette(hist, selectTool);
  initMinimap(workspace, hist);
  initElementSearch(workspace, hist);
  initShortcutsHelp(appEl);
  initSession(hist);
  if (!session && !sharedElements) initWelcome(appEl, hist);
}

bootstrap();
