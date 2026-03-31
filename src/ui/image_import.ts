import type { History } from '../engine/history';
import type { ImageElement } from '../elements/element';
import { importMarkasso } from '../io/markasso';
import { importMermaid, importMermaidText } from '../io/mermaid';
import { elementClipboard } from '../core/clipboard';

export function initImageImport(workspace: HTMLElement, history: History): void {
  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  workspace.appendChild(fileInput);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) loadFile(file);
    fileInput.value = '';
  });

  // Drag-over / drop on workspace
  workspace.addEventListener('dragover', (e) => {
    e.preventDefault();
    const items = e.dataTransfer?.items;
    if (items) {
      for (const item of Array.from(items)) {
        if (
          item.kind === 'file' &&
          (item.type.startsWith('image/') ||
            item.type === 'application/json' ||
            item.type === 'text/plain' ||
            item.type === 'text/x-mermaid')
        ) {
          e.dataTransfer!.dropEffect = 'copy';
          return;
        }
      }
    }
  });

  workspace.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.name.endsWith('.markasso'))                      { importMarkasso(file, history); break; }
      if (file.name.endsWith('.mmd') || file.name.endsWith('.mermaid')) { importMermaid(file, history); break; }
      if (file.type.startsWith('image/'))                       { loadFile(file); break; }
    }
  });

  // Paste handler (Ctrl+V with image or Mermaid text in clipboard)
  document.addEventListener('paste', (e) => {
    if (elementClipboard.elements.length > 0) return; // element paste handled via keydown
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type === 'text/plain') {
        item.getAsString((text) => {
          const trimmed = text.trimStart();
          if (/^(?:graph\s|flowchart\s|sequenceDiagram\b)/i.test(trimmed)) {
            importMermaidText(trimmed, history);
          }
        });
        return;
      }
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) loadFile(file);
        return;
      }
    }
  });

  function loadFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const viewport = history.present.viewport;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Max dimension 600px, maintain aspect ratio
        const maxDim = 600;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        // Center in current viewport
        const worldCX = (vw / 2 - viewport.offsetX) / viewport.zoom;
        const worldCY = (vh / 2 - viewport.offsetY) / viewport.zoom;

        const element: ImageElement = {
          id: crypto.randomUUID(),
          type: 'image',
          src,
          x: worldCX - w / 2,
          y: worldCY - h / 2,
          width: w,
          height: h,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          strokeColor: 'transparent',
          fillColor: 'transparent',
          strokeWidth: 0,
          opacity: 1,
          roughness: 0,
        };

        history.dispatch({ type: 'CREATE_ELEMENT', element });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  // Expose trigger function via the file input element
  (fileInput as HTMLInputElement & { triggerOpen: () => void }).triggerOpen = () => fileInput.click();
}
