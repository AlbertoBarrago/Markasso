import { describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_PACKS,
  getBundledIcon,
  getLoadedPack,
  isBundledPack,
  loadBundledPack,
  onBundledPackLoad,
} from '../src/elements/stencils/packs';
import { isValidEmbeddedSvg } from '../src/elements/stencils/registry';

describe('bundled icon packs', () => {
  it('knows the Kubernetes pack', () => {
    expect(BUNDLED_PACKS.map((p) => p.id)).toContain('k8s');
    expect(isBundledPack('k8s')).toBe(true);
    expect(isBundledPack('aws')).toBe(false);
    expect(isBundledPack('toString')).toBe(false);
  });

  it('loads lazily and notifies once loaded', async () => {
    const listener = vi.fn();
    const off = onBundledPackLoad(listener);
    // First access starts the load and returns nothing yet.
    expect(getBundledIcon('k8s/pod')).toBeNull();
    const icons = await loadBundledPack('k8s');
    off();
    expect(listener).toHaveBeenCalled();
    expect(icons.length).toBe(39);
    expect(getBundledIcon('k8s/pod')).toMatchObject({ label: 'Pod' });
    expect(getBundledIcon('k8s/nope')).toBeNull();
    expect(getLoadedPack('k8s')).toHaveLength(39);
  });

  it('ships safe, compact SVG data URLs with unique ids', async () => {
    const icons = await loadBundledPack('k8s');
    expect(new Set(icons.map((i) => i.id)).size).toBe(icons.length);
    for (const icon of icons) {
      expect(isValidEmbeddedSvg(icon.src)).toBe(true);
      const svg = atob(icon.src.split(',')[1]!);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(
        /<script|\son\w+=|javascript:|inkscape:|sodipodi:/i,
      );
    }
  });

  it('rejects unknown packs', async () => {
    await expect(loadBundledPack('aws')).rejects.toThrow('Unknown icon pack');
  });
});
