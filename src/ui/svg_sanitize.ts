/**
 * Cleans an imported SVG before it is stored and embedded in diagrams.
 *
 * Icons are only ever rendered as images (canvas drawImage, <img>, SVG
 * <image>), where browsers already run no scripts and load no external
 * resources. This is defense in depth for anything that might later handle
 * the markup differently: active content is removed outright.
 */

const FORBIDDEN_ELEMENTS = [
  'script',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
];

function isSafeReference(value: string): boolean {
  const v = value.trim();
  return v.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp);/i.test(v);
}

/** Returns sanitized SVG markup, or null when the file is not a usable SVG. */
export function sanitizeSvg(markup: string): string | null {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (
    root.nodeName.toLowerCase() !== 'svg' ||
    doc.getElementsByTagName('parsererror').length > 0
  ) {
    return null;
  }

  for (const name of FORBIDDEN_ELEMENTS) {
    for (const el of [...doc.getElementsByTagName(name)]) el.remove();
  }
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (
        (name === 'href' || name === 'xlink:href') &&
        !isSafeReference(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // Without explicit dimensions some browsers give the image a natural size
  // of 0, and it would never draw: derive them from the viewBox.
  const viewBox = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/);
  const relative = (attr: string): boolean =>
    !root.hasAttribute(attr) || /%\s*$/.test(root.getAttribute(attr) ?? '');
  if (viewBox?.length === 4 && (relative('width') || relative('height'))) {
    root.setAttribute('width', viewBox[2] ?? '64');
    root.setAttribute('height', viewBox[3] ?? '64');
  }
  if (!root.hasAttribute('xmlns')) {
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  return new XMLSerializer().serializeToString(root);
}
