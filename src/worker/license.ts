const DAY = 86400;

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function validateLicense(key: string, env: Env): Promise<boolean> {
  const response = await fetch(
    'https://api.lemonsqueezy.com/v1/licenses/validate',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ license_key: key }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (
    !response.ok &&
    response.status !== 400 &&
    response.status !== 404 &&
    response.status !== 422
  )
    throw new Error('License service unavailable');
  const data = (await response.json()) as {
    valid?: boolean;
    license_key?: { status?: string };
    meta?: { store_id?: number; product_id?: number };
  };
  return (
    data.valid === true &&
    data.license_key?.status === 'active' &&
    String(data.meta?.store_id) === env.LEMON_STORE_ID &&
    String(data.meta?.product_id) === env.LEMON_PRODUCT_ID
  );
}

export async function licenseGate(
  request: Request,
  env: Env,
): Promise<402 | 503 | null> {
  if (env.CLOUD_REQUIRES_LICENSE !== 'true') return null;
  const key = request.headers.get('X-Markasso-License');
  if (!key || key.length > 1024) return 402;
  if (!env.LEMON_STORE_ID || !env.LEMON_PRODUCT_ID) return 503;
  const cacheKey = `license:${await sha256(key)}`;
  const scope = `${env.LEMON_STORE_ID}:${env.LEMON_PRODUCT_ID}`;
  let cached: { valid: boolean; checkedAt: number; scope: string } | null =
    null;
  try {
    const raw = await env.SHARE_LINKS.get(cacheKey);
    if (raw) cached = JSON.parse(raw);
  } catch {
    /* Cache failure falls through to the upstream. */
  }
  const age = cached ? Date.now() - cached.checkedAt : Infinity;
  if (
    cached?.scope === scope &&
    age >= 0 &&
    age < (cached.valid ? DAY : 600) * 1000
  )
    return cached.valid ? null : 402;
  try {
    const valid = await validateLicense(key, env);
    try {
      await env.SHARE_LINKS.put(
        cacheKey,
        JSON.stringify({ valid, checkedAt: Date.now(), scope }),
        { expirationTtl: valid ? 7 * DAY : 600 },
      );
    } catch {
      /* A validated license does not depend on cache availability. */
    }
    return valid ? null : 402;
  } catch {
    return cached?.scope === scope &&
      cached.valid &&
      age >= 0 &&
      age <= 7 * DAY * 1000
      ? null
      : 503;
  }
}
