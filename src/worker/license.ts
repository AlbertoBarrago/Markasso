/**
 * Markasso Cloud licences, sold through Polar (merchant of record). Polar
 * generates the key, emails the buyer a link to its customer portal, and
 * revokes the key when the subscription ends: the worker only asks Polar
 * whether a key is currently granted for the Markasso Cloud benefit.
 *
 * Answers are cached in KV so a busy board or live room does not call Polar
 * on every request: a valid key for a few hours (revocation is noticed within
 * that window), an invalid one for ten minutes. If Polar is unreachable, a key
 * that was valid recently keeps working for up to a week.
 */

const HOUR = 3600;
const DAY = 24 * HOUR;
const VALID_TTL_S = 6 * HOUR;
const INVALID_TTL_S = 600;
const STALE_GRACE_S = 7 * DAY;
const POLAR_API = 'https://api.polar.sh';
/** Polar keys are a UUID4 with an optional brandable prefix. */
const KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;

type CachedLicense = { valid: boolean; checkedAt: number; scope: string };

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Trims pasted input and rejects anything that cannot be a Polar key. */
export function normalizeLicenseKey(raw: string | null): string | null {
  const key = raw?.trim() ?? '';
  return KEY_RE.test(key) ? key : null;
}

/**
 * Asks Polar whether `key` is granted for the configured benefit. 404 is
 * Polar's answer for unknown, revoked, disabled or expired keys, and for a
 * benefit mismatch. Throws on configuration or upstream failures.
 */
export async function validateWithPolar(key: string, env: Env): Promise<boolean> {
  if (!env.POLAR_ACCESS_TOKEN || !env.POLAR_ORGANIZATION_ID || !env.POLAR_BENEFIT_ID)
    throw new Error('Polar is not configured');
  const response = await fetch(
    `${env.POLAR_API_URL || POLAR_API}/v1/license-keys/validate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        key,
        organization_id: env.POLAR_ORGANIZATION_ID,
        benefit_id: env.POLAR_BENEFIT_ID,
      }),
      signal: AbortSignal.timeout(5000),
    },
  );
  // 422 is Polar's schema validation error: a malformed key is just invalid.
  if (response.status === 404 || response.status === 422) return false;
  if (!response.ok) throw new Error(`Polar answered ${response.status}`);
  const data = (await response.json()) as {
    status?: string;
    benefit_id?: string;
    organization_id?: string;
  };
  return (
    data.status === 'granted' &&
    data.benefit_id === env.POLAR_BENEFIT_ID &&
    data.organization_id === env.POLAR_ORGANIZATION_ID
  );
}

/**
 * Whether `key` is a currently valid Markasso Cloud licence, using the KV
 * cache described above. Throws only when Polar cannot answer and no recent
 * valid answer is cached, so callers can tell 503 from 402.
 */
export async function licenseKeyValid(
  raw: string | null,
  env: Env,
): Promise<boolean> {
  const key = normalizeLicenseKey(raw);
  if (!key) return false;
  const cacheKey = `license:${await sha256(key)}`;
  // A different organization or benefit (e.g. sandbox vs production) must
  // never reuse a cached answer.
  const scope = `${env.POLAR_ORGANIZATION_ID}:${env.POLAR_BENEFIT_ID}`;
  let cached: CachedLicense | null = null;
  try {
    const raw = await env.SHARE_LINKS.get(cacheKey);
    if (raw) cached = JSON.parse(raw) as CachedLicense;
  } catch (error) {
    console.log('[license] cache read failed', error);
  }
  const ageS = cached ? (Date.now() - cached.checkedAt) / 1000 : Infinity;
  const fresh =
    cached?.scope === scope &&
    ageS >= 0 &&
    ageS < (cached.valid ? VALID_TTL_S : INVALID_TTL_S);
  if (fresh) return cached!.valid;
  let valid: boolean;
  try {
    valid = await validateWithPolar(key, env);
  } catch (error) {
    if (cached?.scope === scope && cached.valid && ageS >= 0 && ageS <= STALE_GRACE_S) {
      console.log('[license] Polar unavailable, using a recent answer', error);
      return true;
    }
    throw error;
  }
  try {
    await env.SHARE_LINKS.put(
      cacheKey,
      JSON.stringify({ valid, checkedAt: Date.now(), scope }),
      { expirationTtl: valid ? STALE_GRACE_S : INVALID_TTL_S },
    );
  } catch (error) {
    // The answer stands; only the next request pays for another lookup.
    console.log('[license] cache write failed', error);
  }
  return valid;
}

/**
 * Gate for cloud board writes: null when allowed, 402 without a valid licence,
 * 503 when Polar cannot be reached. Off unless CLOUD_REQUIRES_LICENSE.
 */
export async function licenseGate(
  request: Request,
  env: Env,
): Promise<402 | 503 | null> {
  if (env.CLOUD_REQUIRES_LICENSE !== 'true') return null;
  try {
    return (await licenseKeyValid(
      request.headers.get('X-Markasso-License'),
      env,
    ))
      ? null
      : 402;
  } catch (error) {
    console.log('[license] lookup failed', error);
    return 503;
  }
}

/**
 * POST /api/licence/check with `X-Markasso-License`: lets the apps confirm a
 * pasted key before storing it. Rate limited per client address like board
 * writes, so it cannot be used to probe keys in bulk.
 */
export async function licenseCheck(request: Request, env: Env): Promise<Response> {
  const limited = await env.BOARD_RATE_LIMITER.limit({
    key: `licence:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`,
  });
  if (!limited.success)
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  try {
    const valid = await licenseKeyValid(
      request.headers.get('X-Markasso-License'),
      env,
    );
    return Response.json({ valid });
  } catch (error) {
    console.log('[license] check failed', error);
    return Response.json(
      { error: 'Licence service unavailable' },
      { status: 503 },
    );
  }
}
