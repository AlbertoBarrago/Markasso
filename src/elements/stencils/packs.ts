/**
 * Icon packs bundled with Markasso as artwork (as opposed to the generic
 * set, which is drawn from path commands). Each pack is a separate chunk,
 * loaded with a dynamic import the first time one of its icons is needed,
 * so it never weighs on the initial bundle.
 */
export interface BundledIcon {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  /** Base64 SVG data URL. */
  readonly src: string;
}

export interface BundledPack {
  readonly id: string;
  readonly title: string;
  /** Short attribution shown with the pack (license and source). */
  readonly attribution: string;
}

export const BUNDLED_PACKS: ReadonlyArray<BundledPack> = [
  {
    id: 'k8s',
    title: 'Kubernetes',
    attribution: 'Kubernetes Icons Set, Apache-2.0',
  },
];

const LOADERS: Readonly<
  Record<string, () => Promise<ReadonlyArray<BundledIcon>>>
> = {
  k8s: () =>
    import('../../libraries/kubernetes/icons.generated').then(
      (m) => m.KUBERNETES_ICONS,
    ),
};

const loaded = new Map<string, ReadonlyMap<string, BundledIcon>>();
const pending = new Map<string, Promise<ReadonlyArray<BundledIcon>>>();
const loadListeners = new Set<() => void>();

export function isBundledPack(pack: string): boolean {
  return Object.hasOwn(LOADERS, pack);
}

/** Notifies when a pack finishes loading, so the canvas can redraw. */
export function onBundledPackLoad(listener: () => void): () => void {
  loadListeners.add(listener);
  return () => loadListeners.delete(listener);
}

/** Loads a pack once; later calls share the same promise. */
export function loadBundledPack(
  pack: string,
): Promise<ReadonlyArray<BundledIcon>> {
  const loader = LOADERS[pack];
  if (!loader) return Promise.reject(new Error(`Unknown icon pack: ${pack}`));
  let promise = pending.get(pack);
  if (!promise) {
    promise = loader().then(
      (icons) => {
        loaded.set(pack, new Map(icons.map((icon) => [icon.id, icon])));
        for (const listener of loadListeners) listener();
        return icons;
      },
      (error: unknown) => {
        // Allow a retry on the next request (e.g. after a network blip).
        pending.delete(pack);
        throw error;
      },
    );
    pending.set(pack, promise);
  }
  return promise;
}

/**
 * Icon for a `<pack>/<id>` reference if its pack is loaded. An unloaded
 * known pack starts loading and null is returned: callers draw a
 * placeholder and redraw on `onBundledPackLoad`.
 */
export function getBundledIcon(ref: string): BundledIcon | null {
  const [pack = '', id = ''] = ref.split('/');
  const icons = loaded.get(pack);
  if (icons) return icons.get(id) ?? null;
  if (isBundledPack(pack)) {
    loadBundledPack(pack).catch((error: unknown) => {
      console.error(`[icon packs] Failed to load "${pack}"`, error);
    });
  }
  return null;
}

/** Icons of a pack if already loaded (no load is triggered). */
export function getLoadedPack(pack: string): ReadonlyArray<BundledIcon> | null {
  const icons = loaded.get(pack);
  return icons ? [...icons.values()] : null;
}
