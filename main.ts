import { History } from './src/engine/history';
import { createScene } from './src/core/scene';
import { initCanvasView } from './src/ui/canvas_view';
import { initToolbar } from './src/ui/toolbar';
import { initShortcuts } from './src/ui/shortcuts';
import { initSettings, loadSettings, applySettings } from './src/ui/settings';
import { initPropertiesPanel } from './src/ui/properties_panel';
import { initLayersPanel } from './src/ui/layers_panel';
import { initImageImport } from './src/ui/image_import';
import { initMobileActionBar } from './src/ui/mobile_action_bar';

function bootstrap(): void {
  const appEl    = document.getElementById('app')       as HTMLElement;
  const toolbar  = document.getElementById('toolbar')   as HTMLElement;
  const workspace= document.getElementById('workspace') as HTMLElement;
  const canvas   = document.getElementById('main')      as HTMLCanvasElement;

  if (!appEl || !toolbar || !workspace || !canvas) {
    throw new Error('Missing required DOM elements');
  }

  const history = new History(createScene());

  // Restore persisted UI settings before first paint
  applySettings(appEl, loadSettings());

  initShortcuts(history);
  initToolbar(toolbar, history);
  initSettings(appEl, toolbar, history);
  initPropertiesPanel(workspace, history);
  initLayersPanel(workspace, history);
  initImageImport(workspace, history);
  initMobileActionBar(workspace, history);
  initCanvasView(canvas, history);
}

bootstrap();
