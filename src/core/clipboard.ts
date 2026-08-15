import type { Element } from '../elements/element';

export const ELEMENT_CLIPBOARD_MIME = 'application/x-markasso-elements';
export const ELEMENT_CLIPBOARD_TEXT_PREFIX = 'markasso-elements:';

export interface ElementClipboardPayload {
  readonly version: 1;
  readonly elements: ReadonlyArray<Element>;
}

export function serializeElementClipboard(
  elements: ReadonlyArray<Element>,
): string {
  return JSON.stringify({
    version: 1,
    elements,
  } satisfies ElementClipboardPayload);
}
