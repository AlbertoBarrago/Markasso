const cache: Map<string, HTMLImageElement> = new Map();
const failed: Set<string> = new Set();

export function getCachedImage(src: string): HTMLImageElement | null {
  if (failed.has(src)) return null;

  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.onerror = (): void => {
      cache.delete(src);
      failed.add(src);
      console.warn(`[image_cache] Failed to load image: ${src}`);
    };
    img.src = src;
    cache.set(src, img);
  }
  return img;
}

export function clearImageCache(): void {
  cache.clear();
  failed.clear();
}
