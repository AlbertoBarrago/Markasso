import type { Tool, ToolContext } from './tool';
import type { Element } from '../elements/element';
import type { HandlePosition } from '../rendering/draw_selection';
import {
  getElementBounds,
  getElementBorderPoint,
  distToShapeBoundary,
  resolveArrowEndpoints,
  hitTestHandle,
  getSelectionHandles,
  getRotationHandleScreen,
  getElementCenter,
  hitTestEndpoint,
  ROTATION_HANDLE_R,
} from '../rendering/draw_selection';
import { worldToScreen } from '../core/viewport';

type DragMode = 'none' | 'move' | 'marquee' | 'resize' | 'rotate' | 'endpoint';

const SNAP_RADIUS_PX = 20;

const HANDLE_CURSORS: Record<HandlePosition, string> = {
  nw: 'nw-resize', n: 'ns-resize', ne: 'ne-resize',
  w:  'ew-resize',                  e: 'ew-resize',
  sw: 'sw-resize', s: 'ns-resize', se: 'se-resize',
};

export class SelectTool implements Tool {
  private dragMode: DragMode = 'none';
  private lastWorldX = 0;
  private lastWorldY = 0;

  /** ID of the element currently under the cursor (for hover highlight), or null */
  hoveredId: string | null = null;

  /** The groupId of the currently "whole-group selected" group, or null */
  activeGroupId: string | null = null;

  private marqueeX1 = 0;
  private marqueeY1 = 0;
  private marqueeX2 = 0;
  private marqueeY2 = 0;

  // Resize state — captured at mousedown, used throughout the drag
  private resizeHandle: HandlePosition | null = null;
  private resizeOrigEl: Element | null = null;
  private resizeOrigBounds: { x: number; y: number; w: number; h: number } | null = null;
  private resizeAnchorX = 0;
  private resizeAnchorY = 0;

  // Endpoint drag state
  private endpointSide: 'start' | 'end' | null = null;
  private endpointElId: string | null = null;
  private endpointSnapTarget: { worldX: number; worldY: number; elementId: string } | null = null;

  /** Exposed for canvas_view to draw a snap indicator */
  endpointSnapIndicator: { worldX: number; worldY: number } | null = null;
  /** Exposed for canvas_view to draw a hover highlight on the snap target element */
  endpointSnapElementId: string | null = null;

  // Shift+drag clone state
  private shiftClonePending = false;
  private shiftCloneTarget: Element | null = null;

  // Rotation state
  private rotateCenter: [number, number] = [0, 0];
  private rotateInitialAngle = 0;
  private rotateInitialRotation = 0;
  private rotateElId: string | null = null;

  // Exposed for renderer to draw marquee preview
  marqueeActive = false;
  getMarquee(): [number, number, number, number] {
    return [this.marqueeX1, this.marqueeY1, this.marqueeX2, this.marqueeY2];
  }

  onMouseDown(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.lastWorldX = worldX;
    this.lastWorldY = worldY;

    const scene = ctx.history.present;
    const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));
    const rect = ctx.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // 1. Check endpoint handles (single line/arrow selected)
    if (selectedEls.length === 1) {
      const el = selectedEls[0]!;
      if (el.type === 'line' || el.type === 'arrow') {
        const endHit = hitTestEndpoint(el, scene.viewport, screenX, screenY);
        if (endHit) {
          this.dragMode = 'endpoint';
          this.endpointSide = endHit;
          this.endpointElId = el.id;
          return;
        }
      }
    }

    // 2. Check rotation handle
    if (selectedEls.length > 0) {
      const rotHandlePos = getRotationHandleScreen(selectedEls, scene.viewport);
      if (rotHandlePos) {
        const dist = Math.hypot(screenX - rotHandlePos.screenX, screenY - rotHandlePos.screenY);
        if (dist <= ROTATION_HANDLE_R + 4) {
          // Only support rotation for single element
          if (selectedEls.length === 1) {
            const el = selectedEls[0]!;
            this.dragMode = 'rotate';
            this.rotateCenter = getElementCenter(el);
            this.rotateInitialAngle = Math.atan2(
              worldY - this.rotateCenter[1],
              worldX - this.rotateCenter[0],
            );
            this.rotateInitialRotation = el.rotation ?? 0;
            this.rotateElId = el.id;
          }
          return;
        }
      }
    }

    // 3. Check if a resize handle was clicked
    if (selectedEls.length > 0) {
      const handles = getSelectionHandles(selectedEls, scene.viewport);
      const hitHandle = hitTestHandle(handles, screenX, screenY);

      if (hitHandle) {
        this.dragMode = 'resize';
        this.resizeHandle = hitHandle;
        if (selectedEls.length === 1) {
          this.resizeOrigEl = selectedEls[0]!;
          this.resizeOrigBounds = getElementBounds(this.resizeOrigEl);
        } else {
          // Multi-selection: treat union bounds as the resize surface
          this.resizeOrigEl = null;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const el of selectedEls) {
            const b = getElementBounds(el);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
          }
          this.resizeOrigBounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        this.resizeAnchorX = anchorX(hitHandle, this.resizeOrigBounds);
        this.resizeAnchorY = anchorY(hitHandle, this.resizeOrigBounds);
        return;
      }
    }

    // 4. Hit-test elements
    const hit = hitTest(scene.elements, worldX, worldY);
    if (hit) {
      if (e.shiftKey) {
        // Shift+drag → clone; Shift+click → toggle (decided on mouseUp)
        this.shiftClonePending = true;
        this.shiftCloneTarget = hit;
        this.dragMode = hit.locked ? 'none' : 'move';
      } else {
        // Group-aware selection
        if (hit.groupId) {
          if (this.activeGroupId === hit.groupId) {
            // Inside group: select just this element
            ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids: [hit.id] });
            this.dragMode = hit.locked ? 'none' : 'move';
          } else {
            // Select whole group
            const groupIds = scene.elements
              .filter((el) => el.groupId === hit.groupId)
              .map((el) => el.id);
            ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids: groupIds });
            this.activeGroupId = hit.groupId;
            this.dragMode = hit.locked ? 'none' : 'move';
          }
        } else {
          if (!scene.selectedIds.has(hit.id)) {
            ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids: [hit.id] });
          }
          this.activeGroupId = null;
          this.dragMode = hit.locked ? 'none' : 'move';
        }
      }
    } else {
      ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
      this.activeGroupId = null;
      this.dragMode = 'marquee';
      this.marqueeActive = true;
      this.marqueeX1 = screenX;
      this.marqueeY1 = screenY;
      this.marqueeX2 = screenX;
      this.marqueeY2 = screenY;
    }
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (this.dragMode === 'endpoint') {
      const scene = ctx.history.present;
      const el = scene.elements.find((el) => el.id === this.endpointElId);
      if (el && (el.type === 'line' || el.type === 'arrow') && this.endpointSide) {
        // Determine the "other end" position for computing border facing direction
        const resolved = resolveArrowEndpoints(el, scene.elements);
        const otherX = this.endpointSide === 'start' ? resolved.x2 : resolved.x;
        const otherY = this.endpointSide === 'start' ? resolved.y2 : resolved.y;

        // Check for snap to element perimeter
        const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;
        let snapTarget: { worldX: number; worldY: number; elementId: string } | null = null;
        let bestSnapDist = Infinity;
        for (const candidate of scene.elements) {
          if (candidate.id === el.id) continue;
          if (candidate.type === 'line' || candidate.type === 'arrow') continue;
          const b = getElementBounds(candidate);
          const nearX = Math.max(b.x, Math.min(b.x + b.w, worldX));
          const nearY = Math.max(b.y, Math.min(b.y + b.h, worldY));
          if (Math.hypot(worldX - nearX, worldY - nearY) > snapRadius) continue;
          const d = distToShapeBoundary(candidate, b, worldX, worldY);
          if (d < bestSnapDist) {
            bestSnapDist = d;
            const [bx, by] = getElementBorderPoint(candidate, otherX, otherY);
            snapTarget = { worldX: bx, worldY: by, elementId: candidate.id };
          }
        }
        this.endpointSnapTarget = snapTarget;
        this.endpointSnapIndicator = snapTarget ? { worldX: snapTarget.worldX, worldY: snapTarget.worldY } : null;
        this.endpointSnapElementId = snapTarget ? snapTarget.elementId : null;

        const resolvedX = snapTarget ? snapTarget.worldX : worldX;
        const resolvedY = snapTarget ? snapTarget.worldY : worldY;

        if (this.endpointSide === 'start') {
          ctx.history.dispatch({ type: 'RESIZE_ELEMENT', id: el.id, x: resolvedX, y: resolvedY });
        } else {
          ctx.history.dispatch({ type: 'RESIZE_ELEMENT', id: el.id, x2: resolvedX, y2: resolvedY });
        }
      }
      ctx.onPreviewUpdate?.();
      return;
    }

    if (this.dragMode === 'rotate') {
      const [cx, cy] = this.rotateCenter;
      const angle = Math.atan2(worldY - cy, worldX - cx);
      const rotation = this.rotateInitialRotation + (angle - this.rotateInitialAngle);
      if (this.rotateElId) {
        ctx.history.dispatch({ type: 'SET_ROTATION', id: this.rotateElId, rotation });
      }
      ctx.onPreviewUpdate?.();
      return;
    }

    if (this.dragMode === 'resize') {
      const scene = ctx.history.present;
      if (
        this.resizeHandle &&
        this.resizeOrigEl &&
        this.resizeOrigBounds
      ) {
        const resized = computeResize(
          this.resizeOrigEl,
          this.resizeHandle,
          this.resizeAnchorX,
          this.resizeAnchorY,
          worldX,
          worldY,
          this.resizeOrigBounds,
          e.shiftKey,
        );
        if (resized) {
          ctx.history.dispatch({ type: 'RESIZE_ELEMENT', id: this.resizeOrigEl.id, ...resized });
        }
      } else if (this.resizeHandle && this.resizeOrigBounds && !this.resizeOrigEl) {
        // Multi-selection proportional scale
        const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));
        const ob = this.resizeOrigBounds;
        const newBounds = newBoundsFromHandle(
          this.resizeHandle, this.resizeAnchorX, this.resizeAnchorY, worldX, worldY, ob, e.shiftKey
        );
        if (newBounds && ob.w > 0 && ob.h > 0) {
          const scaleX = newBounds.w / ob.w;
          const scaleY = newBounds.h / ob.h;
          for (const el of selectedEls) {
            const b = getElementBounds(el);
            const relX = (b.x - ob.x) * scaleX + newBounds.x;
            const relY = (b.y - ob.y) * scaleY + newBounds.y;
            const resized = scaleElement(el, relX, relY, b.w * scaleX, b.h * scaleY);
            if (resized) ctx.history.dispatch({ type: 'RESIZE_ELEMENT', id: el.id, ...resized });
          }
        }
      }
      ctx.onPreviewUpdate?.();
      return;
    }

    if (this.dragMode === 'move') {
      if (this.shiftClonePending) {
        const dist = Math.hypot(worldX - this.lastWorldX, worldY - this.lastWorldY);
        if (dist < 2) return;
        // It's a drag: clone and drag
        this.shiftClonePending = false;
        const scene = ctx.history.present;
        const hit = this.shiftCloneTarget!;
        this.shiftCloneTarget = null;
        const idsToClone = scene.selectedIds.has(hit.id)
          ? [...scene.selectedIds]
          : [hit.id];
        const elsToClone = scene.elements.filter((el) => idsToClone.includes(el.id) && !el.locked);
        if (elsToClone.length > 0) {
          const newElements = elsToClone.map((el) => ({ ...el, id: crypto.randomUUID() } as Element));
          ctx.history.dispatch({ type: 'CREATE_ELEMENTS', elements: newElements });
          // CREATE_ELEMENTS selects the clones — subsequent moves drag them
        }
        // Fall through to move the newly selected clones
      }

      const dx = worldX - this.lastWorldX;
      const dy = worldY - this.lastWorldY;
      const { elements, selectedIds } = ctx.history.present;
      const ids = [...selectedIds].filter((id) => {
        const el = elements.find((e) => e.id === id);
        return el && !el.locked;
      });
      for (const id of ids) {
        ctx.history.dispatch({ type: 'MOVE_ELEMENT', id, dx, dy });
      }
      this.lastWorldX = worldX;
      this.lastWorldY = worldY;
      return;
    }

    if (this.dragMode === 'marquee') {
      const rect = ctx.canvas.getBoundingClientRect();
      this.marqueeX2 = e.clientX - rect.left;
      this.marqueeY2 = e.clientY - rect.top;
      ctx.onPreviewUpdate?.();
      return;
    }

    // dragMode === 'none': update hover highlight
    if (this.dragMode === 'none') {
      const scene = ctx.history.present;
      const hit = hitTest(scene.elements, worldX, worldY);
      this.hoveredId = hit ? hit.id : null;
    }
  }

  onMouseLeave(): void {
    this.hoveredId = null;
  }

  onMouseUp(_e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    // Shift+click (no drag): fall back to toggle selection
    if (this.shiftClonePending && this.shiftCloneTarget) {
      const hit = this.shiftCloneTarget;
      const scene = ctx.history.present;
      const currentIds = [...scene.selectedIds];
      const newIds = scene.selectedIds.has(hit.id)
        ? currentIds.filter((id) => id !== hit.id)
        : [...currentIds, hit.id];
      if (newIds.length > 0) ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids: newIds });
      else ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
    }
    this.shiftClonePending = false;
    this.shiftCloneTarget = null;

    if (this.dragMode === 'marquee') {
      this.marqueeActive = false;
      const scene = ctx.history.present;
      const viewport = scene.viewport;
      const x1 = Math.min(this.marqueeX1, this.marqueeX2);
      const y1 = Math.min(this.marqueeY1, this.marqueeY2);
      const x2 = Math.max(this.marqueeX1, this.marqueeX2);
      const y2 = Math.max(this.marqueeY1, this.marqueeY2);

      const wx1 = (x1 - viewport.offsetX) / viewport.zoom;
      const wy1 = (y1 - viewport.offsetY) / viewport.zoom;
      const wx2 = (x2 - viewport.offsetX) / viewport.zoom;
      const wy2 = (y2 - viewport.offsetY) / viewport.zoom;

      const ids = scene.elements
        .filter((el) => {
          const b = getElementBounds(el);
          return b.x >= wx1 && b.y >= wy1 && b.x + b.w <= wx2 && b.y + b.h <= wy2;
        })
        .map((el) => el.id);

      if (ids.length > 0) ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids });
    }

    // Commit endpoint connection on mouseup
    if (this.dragMode === 'endpoint' && this.endpointElId && this.endpointSide) {
      const snap = this.endpointSnapTarget;
      if (this.endpointSide === 'start') {
        ctx.history.dispatch({
          type: 'RESIZE_ELEMENT',
          id: this.endpointElId,
          startElementId: snap ? snap.elementId : null,
        });
      } else {
        ctx.history.dispatch({
          type: 'RESIZE_ELEMENT',
          id: this.endpointElId,
          endElementId: snap ? snap.elementId : null,
        });
      }
    }

    this.endpointSnapTarget = null;
    this.endpointSnapIndicator = null;
    this.endpointSnapElementId = null;
    this.dragMode = 'none';
    this.resizeHandle = null;
    this.resizeOrigEl = null;
    this.resizeOrigBounds = null;
    this.endpointSide = null;
    this.endpointElId = null;
    this.rotateElId = null;
  }

  onDeactivate(_ctx: ToolContext): void {
    this.dragMode = 'none';
    this.marqueeActive = false;
    this.shiftClonePending = false;
    this.shiftCloneTarget = null;
  }

  onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Escape') {
      if (this.activeGroupId) {
        // Exit entered group: re-select whole group
        const scene = ctx.history.present;
        const groupIds = scene.elements
          .filter((el) => el.groupId === this.activeGroupId)
          .map((el) => el.id);
        if (groupIds.length > 0) {
          ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids: groupIds });
        } else {
          ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
        }
        this.activeGroupId = null;
      } else {
        ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const scene = ctx.history.present;
      // Don't delete locked elements
      const ids = [...scene.selectedIds].filter((id) => {
        const el = scene.elements.find((e) => e.id === id);
        return el && !el.locked;
      });
      if (ids.length > 0) ctx.history.dispatch({ type: 'DELETE_ELEMENTS', ids });
      return;
    }

    // Arrow key nudge — 1px normally, 10px with Shift
    const NUDGE = e.shiftKey ? 10 : 1;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft')  dx = -NUDGE;
    if (e.key === 'ArrowRight') dx =  NUDGE;
    if (e.key === 'ArrowUp')    dy = -NUDGE;
    if (e.key === 'ArrowDown')  dy =  NUDGE;
    if (dx !== 0 || dy !== 0) {
      e.preventDefault();
      const ids = [...ctx.history.present.selectedIds];
      for (const id of ids) {
        ctx.history.dispatch({ type: 'MOVE_ELEMENT', id, dx, dy });
      }
    }
  }

  getCursor(worldX: number, worldY: number, ctx: ToolContext): string {
    const scene = ctx.history.present;
    const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));
    const [screenX, screenY] = worldToScreen(scene.viewport, worldX, worldY);

    if (selectedEls.length > 0) {
      // Check endpoint handles for single line/arrow
      if (selectedEls.length === 1) {
        const el = selectedEls[0]!;
        if (el.type === 'line' || el.type === 'arrow') {
          const endHit = hitTestEndpoint(el, scene.viewport, screenX, screenY);
          if (endHit) return 'crosshair';
        }
      }

      // Check rotation handle
      const rotHandlePos = getRotationHandleScreen(selectedEls, scene.viewport);
      if (rotHandlePos) {
        const dist = Math.hypot(screenX - rotHandlePos.screenX, screenY - rotHandlePos.screenY);
        if (dist <= ROTATION_HANDLE_R + 4) return 'grab';
      }

      // Check resize handles
      const handles = getSelectionHandles(selectedEls, scene.viewport);
      const hit = hitTestHandle(handles, screenX, screenY);
      if (hit) return HANDLE_CURSORS[hit];
    }

    const hit = hitTest(scene.elements, worldX, worldY);
    return hit ? 'move' : 'default';
  }
}

// ── Resize helpers ─────────────────────────────────────────────────────────────

type ResizePayload = {
  x?: number; y?: number;
  width?: number; height?: number;
  x2?: number; y2?: number;
  fontSize?: number;
  points?: ReadonlyArray<readonly [number, number]>;
};

function anchorX(h: HandlePosition, b: { x: number; y: number; w: number; h: number }): number {
  if (h === 'nw' || h === 'w' || h === 'sw') return b.x + b.w;
  if (h === 'ne' || h === 'e' || h === 'se') return b.x;
  return b.x + b.w / 2; // n/s — unused (x axis fixed)
}

function anchorY(h: HandlePosition, b: { x: number; y: number; w: number; h: number }): number {
  if (h === 'nw' || h === 'n' || h === 'ne') return b.y + b.h;
  if (h === 'sw' || h === 's' || h === 'se') return b.y;
  return b.y + b.h / 2; // w/e — unused (y axis fixed)
}

function newBoundsFromHandle(
  handle: HandlePosition,
  ax: number, ay: number,
  curX: number, curY: number,
  orig: { x: number; y: number; w: number; h: number },
  shiftKey = false,
): { x: number; y: number; w: number; h: number } | null {
  const fixX = handle === 'n' || handle === 's';
  const fixY = handle === 'w' || handle === 'e';

  let minX = fixX ? orig.x : Math.min(ax, curX);
  let maxX = fixX ? orig.x + orig.w : Math.max(ax, curX);
  let minY = fixY ? orig.y : Math.min(ay, curY);
  let maxY = fixY ? orig.y + orig.h : Math.max(ay, curY);

  // Shift + corner handle → constrain to original aspect ratio
  if (shiftKey && !fixX && !fixY && orig.w > 0 && orig.h > 0) {
    const ar = orig.w / orig.h;
    const rawW = Math.abs(curX - ax);
    const rawH = Math.abs(curY - ay);
    const sx = Math.sign(curX - ax) || 1;
    const sy = Math.sign(curY - ay) || 1;
    let finalW: number, finalH: number;
    if (rawW / rawH > ar) { finalH = rawH; finalW = rawH * ar; }
    else                  { finalW = rawW; finalH = rawW / ar; }
    minX = Math.min(ax, ax + sx * finalW);
    maxX = Math.max(ax, ax + sx * finalW);
    minY = Math.min(ay, ay + sy * finalH);
    maxY = Math.max(ay, ay + sy * finalH);
  }

  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 1 || h < 1) return null;
  return { x: minX, y: minY, w, h };
}

function scaleElement(
  el: Element,
  newX: number, newY: number,
  newW: number, newH: number,
): ResizePayload | null {
  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
    case 'rhombus':
      return { x: newX, y: newY, width: newW, height: newH };
    case 'text': {
      const origB = getElementBounds(el);
      const fontScale = origB.h > 0 ? newH / origB.h : 1;
      const fontSize = Math.max(1, Math.round(el.fontSize * fontScale));
      // Text width scales with font size, not with dragged width
      const scaledWidth = el.width * fontScale;
      return { x: newX, y: newY, width: scaledWidth, height: newH, fontSize };
    }
    case 'line':
    case 'arrow': {
      const origB = getElementBounds(el);
      const scaleX = origB.w > 0 ? newW / origB.w : 1;
      const scaleY = origB.h > 0 ? newH / origB.h : 1;
      const ox = newX + (el.x - origB.x) * scaleX;
      const oy = newY + (el.y - origB.y) * scaleY;
      const ox2 = newX + (el.x2 - origB.x) * scaleX;
      const oy2 = newY + (el.y2 - origB.y) * scaleY;
      return { x: ox, y: oy, x2: ox2, y2: oy2 };
    }
    case 'freehand': {
      const origB = getElementBounds(el);
      if (origB.w === 0 || origB.h === 0) return null;
      const scaleX = newW / origB.w;
      const scaleY = newH / origB.h;
      const points = el.points.map(([px, py]) => [
        newX + (px - origB.x) * scaleX,
        newY + (py - origB.y) * scaleY,
      ] as const);
      return { x: newX, y: newY, points };
    }
    case 'image':
      return { x: newX, y: newY, width: newW, height: newH };
  }
}

function computeResize(
  el: Element,
  handle: HandlePosition,
  ax: number, ay: number,
  curX: number, curY: number,
  origBounds: { x: number; y: number; w: number; h: number },
  shiftKey = false,
): ResizePayload | null {
  const nb = newBoundsFromHandle(handle, ax, ay, curX, curY, origBounds, shiftKey);
  if (!nb) return null;
  return scaleElement(el, nb.x, nb.y, nb.w, nb.h);
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function hitTest(elements: ReadonlyArray<Element>, wx: number, wy: number): Element | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el && hitTestElement(el, wx, wy)) return el;
  }
  return null;
}

function hitTestElement(el: Element, wx: number, wy: number): boolean {
  const PAD = 4;

  // For rotated elements, inverse-rotate the test point into element's local space
  let lx = wx;
  let ly = wy;
  if (el.rotation) {
    const [cx, cy] = getElementCenter(el);
    const cos = Math.cos(-el.rotation);
    const sin = Math.sin(-el.rotation);
    const dx = wx - cx;
    const dy = wy - cy;
    lx = cx + dx * cos - dy * sin;
    ly = cy + dx * sin + dy * cos;
  }

  switch (el.type) {
    case 'rectangle':
    case 'text':
    case 'image': {
      const x = el.width < 0 ? el.x + el.width : el.x;
      const y = el.height < 0 ? el.y + el.height : el.y;
      const w = Math.abs(el.width);
      const h = Math.abs(el.height);
      return lx >= x - PAD && lx <= x + w + PAD && ly >= y - PAD && ly <= y + h + PAD;
    }
    case 'ellipse': {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rx = Math.abs(el.width / 2) + PAD;
      const ry = Math.abs(el.height / 2) + PAD;
      return ((lx - cx) / rx) ** 2 + ((ly - cy) / ry) ** 2 <= 1;
    }
    case 'rhombus': {
      const x = el.width < 0 ? el.x + el.width : el.x;
      const y = el.height < 0 ? el.y + el.height : el.y;
      const w = Math.abs(el.width);
      const h = Math.abs(el.height);
      const cx = x + w / 2;
      const cy = y + h / 2;
      // Normalized diamond: |nx| + |ny| <= 1
      const nx = (lx - cx) / (w / 2 + PAD);
      const ny = (ly - cy) / (h / 2 + PAD);
      return Math.abs(nx) + Math.abs(ny) <= 1;
    }
    case 'line':
    case 'arrow':
      return distToSegment(lx, ly, el.x, el.y, el.x2, el.y2) < el.strokeWidth / 2 + PAD;
    case 'freehand': {
      for (let i = 1; i < el.points.length; i++) {
        const p1 = el.points[i - 1]!;
        const p2 = el.points[i]!;
        if (distToSegment(lx, ly, p1[0], p1[1], p2[0], p2[1]) < el.strokeWidth / 2 + PAD) return true;
      }
      return false;
    }
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

