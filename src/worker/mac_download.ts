/**
 * Download link for the Mac app (`/download/mac`) and its version info
 * (`/download/mac.json`).
 *
 * The latest build is read from the Sparkle appcast the Mac release publishes,
 * so the web never needs a change when the Mac app ships. The answer is
 * cached in KV for a few minutes; if the appcast cannot be read, the last
 * known build (or a built-in one) is used, so the button always works.
 *
 * Only archives under {@link ALLOWED_PREFIX} are ever redirected to: a
 * tampered appcast cannot turn markasso.it into an open redirect.
 *
 * Each redirect adds one to a per-day, per-version counter in D1. Nothing
 * about the visitor is stored (no IP, cookie or user agent).
 */

const APPCAST_URL = 'https://albz.it/updates/markasso/appcast.xml';
const ALLOWED_PREFIX = 'https://albz.it/updates/markasso/';
/** Used only when the appcast was never readable. */
const FALLBACK: MacBuild = {
  url: 'https://albz.it/updates/markasso/Markasso-0.9.2-3.zip',
  version: '0.9.2',
};
const CACHE_KEY = 'mac:latest';
const FRESH_MS = 5 * 60 * 1000;
const KEEP_S = 30 * 24 * 3600;

export interface MacBuild {
  url: string;
  version: string;
}

/** Whether `url` is an archive this worker may redirect to. */
export function allowedMacDownload(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.href.startsWith(ALLOWED_PREFIX) &&
      !parsed.username &&
      !parsed.password &&
      /^\/updates\/markasso\/[A-Za-z0-9._-]+\.zip$/.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

/**
 * The newest build in a Sparkle appcast: the first `<item>`'s enclosure URL
 * and short version. Null when the feed has no usable, allowed item.
 */
export function latestFromAppcast(xml: string): MacBuild | null {
  const item = /<item\b[^>]*>([\s\S]*?)<\/item>/i.exec(xml)?.[1];
  if (!item) return null;
  const url = /<enclosure\b[^>]*\burl="([^"]+)"/i
    .exec(item)?.[1]
    ?.replace(/&amp;/g, '&');
  if (!url || !allowedMacDownload(url)) return null;
  const version =
    /<sparkle:shortVersionString>\s*([^<\s]+)\s*</i.exec(item)?.[1] ??
    /sparkle:shortVersionString="([^"]+)"/i.exec(item)?.[1] ??
    /Markasso-(\d+(?:\.\d+)*)/.exec(url)?.[1];
  if (!version || !/^[0-9A-Za-z.+-]{1,32}$/.test(version)) return null;
  return { url, version };
}

/** The build to offer: fresh cache, else the appcast, else any known build. */
export async function resolveMacBuild(env: Env): Promise<MacBuild> {
  let cached: (MacBuild & { checkedAt: number }) | null = null;
  try {
    const raw = await env.SHARE_LINKS.get(CACHE_KEY);
    if (raw) cached = JSON.parse(raw) as MacBuild & { checkedAt: number };
  } catch (error) {
    console.log('[mac] cache read failed', error);
  }
  const cachedBuild =
    cached && allowedMacDownload(cached.url)
      ? { url: cached.url, version: cached.version }
      : null;
  if (cachedBuild && Date.now() - cached!.checkedAt < FRESH_MS)
    return cachedBuild;
  try {
    const response = await fetch(APPCAST_URL, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`appcast answered ${response.status}`);
    const latest = latestFromAppcast(await response.text());
    if (!latest) throw new Error('appcast has no usable item');
    try {
      await env.SHARE_LINKS.put(
        CACHE_KEY,
        JSON.stringify({ ...latest, checkedAt: Date.now() }),
        { expirationTtl: KEEP_S },
      );
    } catch (error) {
      console.log('[mac] cache write failed', error);
    }
    return latest;
  } catch (error) {
    console.log('[mac] appcast unavailable, using the last known build', error);
    return cachedBuild ?? FALLBACK;
  }
}

/** Adds one download for today and `version`. Never blocks the download. */
export async function countMacDownload(env: Env, version: string): Promise<void> {
  try {
    await env.BOARDS_DB.prepare(
      `INSERT INTO downloads (day, version, count) VALUES (?, ?, 1)
       ON CONFLICT(day, version) DO UPDATE SET count = count + 1`,
    )
      .bind(new Date().toISOString().slice(0, 10), version)
      .run();
  } catch (error) {
    console.log('[mac] download count failed', error);
  }
}

/** GET /download/mac (counted 302) and GET /download/mac.json (no count). */
export async function macDownload(request: Request, env: Env): Promise<Response> {
  const build = await resolveMacBuild(env);
  const url = new URL(request.url);
  if (url.pathname === '/download/mac.json')
    return Response.json(build, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  // HEAD requests (link checkers, previews) are not downloads.
  if (request.method === 'GET') await countMacDownload(env, build.version);
  return new Response(null, {
    status: 302,
    headers: { Location: build.url, 'Cache-Control': 'no-store' },
  });
}
