import type { Command } from '../commands/commands';
import type { Scene } from '../core/scene';
import type { Element } from '../elements/element';

/**
 * Per-user undo for a shared board.
 *
 * An undo step records only what the LOCAL user changed (field by field), never
 * a whole-scene snapshot. Reverting a step produces a `PATCH_ELEMENTS` command
 * that is relayed like any other command, so every peer converges. A field is
 * reverted only while it still holds the value this user left in it: if a peer
 * changed it afterwards, the peer's edit wins and the field is left alone.
 */

interface FieldChange {
  readonly before: unknown;
  after: unknown;
}

interface ElementDelta {
  /** The element when the step first touched it; null if the step created it. */
  readonly before: Element | null;
  /** The element after the step last touched it; null if the step deleted it. */
  after: Element | null;
  beforeIndex: number;
  afterIndex: number;
  /** Fields changed by the step: value before its first change, value after its last. */
  readonly fields: Map<string, FieldChange>;
}

interface OrderChange {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

/** The net local change of one undo step (one dispatch, or a whole drag). */
export interface SceneChange {
  readonly elements: Map<string, ElementDelta>;
  order: OrderChange | null;
}

type PatchCommand = Extract<Command, { type: 'PATCH_ELEMENTS' }>;

const IDENTITY_FIELDS = new Set(['id', 'type']);

export function emptyChange(): SceneChange {
  return { elements: new Map(), order: null };
}

function fieldsOf(element: Element): Readonly<Record<string, unknown>> {
  return element as unknown as Readonly<Record<string, unknown>>;
}

/** Structural equality for element field values (JSON-like data only). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Object.keys(ra);
  if (keys.length !== Object.keys(rb).length) return false;
  return keys.every((k) => k in rb && deepEqual(ra[k], rb[k]));
}

function diffFields(a: Element, b: Element): Map<string, FieldChange> {
  const fa = fieldsOf(a);
  const fb = fieldsOf(b);
  const fields = new Map<string, FieldChange>();
  for (const key of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (IDENTITY_FIELDS.has(key)) continue;
    if (!deepEqual(fa[key], fb[key])) {
      fields.set(key, { before: fa[key], after: fb[key] });
    }
  }
  return fields;
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** What changed between two consecutive scenes (elements and z-order only). */
export function diffScenes(prev: Scene, next: Scene): SceneChange {
  const change = emptyChange();
  if (prev.elements === next.elements) return change;

  const prevIndex = new Map(prev.elements.map((el, i) => [el.id, i]));
  const nextIndex = new Map(next.elements.map((el, i) => [el.id, i]));

  prev.elements.forEach((before, beforeIndex) => {
    const afterIndex = nextIndex.get(before.id);
    const after =
      afterIndex === undefined ? null : (next.elements[afterIndex] ?? null);
    if (after === before) return;
    const fields = after ? diffFields(before, after) : new Map();
    if (after && fields.size === 0) return;
    change.elements.set(before.id, {
      before,
      after,
      beforeIndex,
      afterIndex: afterIndex ?? -1,
      fields,
    });
  });
  next.elements.forEach((after, afterIndex) => {
    if (prevIndex.has(after.id)) return;
    change.elements.set(after.id, {
      before: null,
      after,
      beforeIndex: -1,
      afterIndex,
      fields: new Map(),
    });
  });

  const orderBefore = prev.elements
    .map((el) => el.id)
    .filter((id) => nextIndex.has(id));
  const orderAfter = next.elements
    .map((el) => el.id)
    .filter((id) => prevIndex.has(id));
  if (!sameSequence(orderBefore, orderAfter)) {
    change.order = { before: orderBefore, after: orderAfter };
  }
  return change;
}

/**
 * Fold a later local step into an accumulated change (used for drags). Each
 * field keeps the value from before its first change and the value after its
 * last one, so remote edits that land between steps never enter the change.
 */
export function composeChange(into: SceneChange, step: SceneChange): void {
  for (const [id, delta] of step.elements) {
    const acc = into.elements.get(id);
    if (!acc) {
      into.elements.set(id, delta);
      continue;
    }
    acc.after = delta.after;
    acc.afterIndex = delta.afterIndex;
    for (const [key, field] of delta.fields) {
      const existing = acc.fields.get(key);
      if (existing) existing.after = field.after;
      else acc.fields.set(key, { before: field.before, after: field.after });
    }
  }
  if (step.order) {
    into.order = into.order
      ? { before: into.order.before, after: step.order.after }
      : step.order;
  }
}

/**
 * After composing several steps, each delta's indices are relative to the
 * intermediate scene of its own step (e.g. two elements erased in one drag
 * both report index 0). Re-anchor them to the scenes around the whole change
 * so undo re-inserts deleted elements at their original z-positions.
 */
export function rebaseIndices(
  change: SceneChange,
  before: Scene,
  after: Scene,
): void {
  const beforeIndex = new Map(before.elements.map((el, i) => [el.id, i]));
  const afterIndex = new Map(after.elements.map((el, i) => [el.id, i]));
  for (const [id, delta] of change.elements) {
    delta.beforeIndex = beforeIndex.get(id) ?? delta.beforeIndex;
    delta.afterIndex = afterIndex.get(id) ?? delta.afterIndex;
  }
}

/**
 * Build the command that moves the current scene from one side of `change` to
 * the other: `undo` reverts it, `redo` reapplies it. Only parts still in the
 * state this user left them are included. Returns null when nothing applies.
 */
export function buildRevertPatch(
  change: SceneChange,
  current: Scene,
  direction: 'undo' | 'redo',
): PatchCommand | null {
  const undo = direction === 'undo';
  const currentIndex = new Map(current.elements.map((el, i) => [el.id, i]));
  const create: { element: Element; index: number }[] = [];
  const update: { id: string; set: Partial<Element>; unset?: string[] }[] = [];
  const remove: string[] = [];

  for (const [id, delta] of change.elements) {
    const from = undo ? delta.after : delta.before;
    const to = undo ? delta.before : delta.after;
    const index = currentIndex.get(id);
    const cur = index === undefined ? undefined : current.elements[index];

    if (from && !to) {
      if (cur) remove.push(id);
      continue;
    }
    if (!from && to) {
      if (!cur) {
        create.push({
          element: to,
          index: undo ? delta.beforeIndex : delta.afterIndex,
        });
      }
      continue;
    }
    // Created and deleted within the step, or deleted by a peer since.
    if (!from || !to || !cur) continue;

    const curFields = fieldsOf(cur);
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const [key, field] of delta.fields) {
      const fromValue = undo ? field.after : field.before;
      const toValue = undo ? field.before : field.after;
      if (!deepEqual(curFields[key], fromValue)) continue; // a peer changed it since
      if (toValue === undefined) unset.push(key);
      else set[key] = toValue;
    }
    if (Object.keys(set).length > 0 || unset.length > 0) {
      update.push({
        id,
        set: set as Partial<Element>,
        ...(unset.length > 0 && { unset }),
      });
    }
  }

  let order: string[] | null = null;
  if (change.order) {
    const fromSeq = undo ? change.order.after : change.order.before;
    const toSeq = undo ? change.order.before : change.order.after;
    const present = (seq: readonly string[]) =>
      seq.filter((id) => currentIndex.has(id));
    const currentSeq = current.elements
      .map((el) => el.id)
      .filter((id) => fromSeq.includes(id));
    const target = present(toSeq);
    if (
      sameSequence(currentSeq, present(fromSeq)) &&
      !sameSequence(currentSeq, target)
    ) {
      order = target;
    }
  }

  if (
    create.length === 0 &&
    update.length === 0 &&
    remove.length === 0 &&
    !order
  ) {
    return null;
  }
  create.sort((a, b) => a.index - b.index);
  return {
    type: 'PATCH_ELEMENTS',
    ...(create.length > 0 && { create }),
    ...(update.length > 0 && { update }),
    ...(remove.length > 0 && { delete: remove }),
    ...(order && { order }),
  };
}
