import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  licenseCheck,
  licenseGate,
  licenseKeyValid,
  normalizeLicenseKey,
  sha256,
} from '../src/worker/license';
import { BENEFIT, mockPolar, ORG, polarEnv } from './polar_fake';

const KEY = 'MKC_1C285B2D-6CE6-4BC7-B8BE-ADB6A7E304DA';
const request = (license?: string) =>
  new Request('https://markasso.example/api/board', {
    headers: license ? { 'X-Markasso-License': license } : {},
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('normalizeLicenseKey', () => {
  it('trims pasted keys and rejects anything that cannot be a key', () => {
    expect(normalizeLicenseKey(`  ${KEY}\n`)).toBe(KEY);
    expect(normalizeLicenseKey('short')).toBeNull();
    expect(normalizeLicenseKey('MKC key with spaces')).toBeNull();
    expect(normalizeLicenseKey(null)).toBeNull();
  });
});

describe('license gate', () => {
  it('bypasses when off and requires a key when on', async () => {
    const { env } = polarEnv();
    expect(await licenseGate(request(), env)).toBe(402);
    expect(
      await licenseGate(request(), { ...env, CLOUD_REQUIRES_LICENSE: 'false' }),
    ).toBeNull();
  });

  it('asks Polar with the organization and benefit, then caches', async () => {
    const { env } = polarEnv();
    const polar = mockPolar([KEY]);
    expect(await licenseGate(request(KEY), env)).toBeNull();
    expect(await licenseGate(request(` ${KEY} `), env)).toBeNull();
    expect(polar).toHaveBeenCalledOnce();
    const [url, init] = polar.mock.calls[0]!;
    expect(url).toBe('https://api.polar.sh/v1/license-keys/validate');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer polar_oat_test',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      key: KEY,
      organization_id: ORG,
      benefit_id: BENEFIT,
    });
  });

  it('uses the sandbox API when configured', async () => {
    const { env } = polarEnv({ POLAR_API_URL: 'https://sandbox-api.polar.sh' });
    const polar = mockPolar([KEY]);
    await licenseKeyValid(KEY, env);
    expect(polar.mock.calls[0]![0]).toBe(
      'https://sandbox-api.polar.sh/v1/license-keys/validate',
    );
  });

  it('refuses revoked or unknown keys and keys of another benefit', async () => {
    mockPolar([]);
    expect(await licenseGate(request(KEY), polarEnv().env)).toBe(402);
    vi.restoreAllMocks();
    mockPolar([KEY], '33333333-3333-4333-8333-333333333333');
    expect(await licenseGate(request(KEY), polarEnv().env)).toBe(402);
  });

  it('notices a revocation once the cached answer expires', async () => {
    vi.useFakeTimers();
    const { env } = polarEnv();
    mockPolar([KEY]);
    expect(await licenseKeyValid(KEY, env)).toBe(true);
    vi.restoreAllMocks();
    mockPolar([]);
    vi.advanceTimersByTime(5 * 3600 * 1000);
    expect(await licenseKeyValid(KEY, env)).toBe(true);
    vi.advanceTimersByTime(2 * 3600 * 1000);
    expect(await licenseKeyValid(KEY, env)).toBe(false);
  });

  it('keeps a recently valid key working while Polar is down, then gives up', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { env } = polarEnv();
    mockPolar([KEY]);
    expect(await licenseKeyValid(KEY, env)).toBe(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 502 }),
    );
    vi.advanceTimersByTime(3 * 86400 * 1000);
    expect(await licenseGate(request(KEY), env)).toBeNull();
    vi.advanceTimersByTime(5 * 86400 * 1000);
    expect(await licenseGate(request(KEY), env)).toBe(503);
  });

  it('never reuses an answer cached for another organization or benefit', async () => {
    const { env, cache } = polarEnv();
    cache.set(
      `license:${await sha256(KEY)}`,
      JSON.stringify({
        valid: true,
        checkedAt: Date.now(),
        scope: 'other:scope',
      }),
    );
    mockPolar([]);
    expect(await licenseKeyValid(KEY, env)).toBe(false);
  });

  it('answers 503 when Polar is not configured', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { env } = polarEnv({ POLAR_ACCESS_TOKEN: undefined });
    expect(await licenseGate(request(KEY), env)).toBe(503);
  });
});

describe('licenseCheck', () => {
  const check = (env: Env, license?: string) =>
    licenseCheck(
      new Request('https://markasso.example/api/licence/check', {
        method: 'POST',
        headers: license ? { 'X-Markasso-License': license } : {},
      }),
      env,
    );
  const limiter = (success: boolean) => ({
    BOARD_RATE_LIMITER: { limit: vi.fn(async () => ({ success })) },
  });

  it('reports whether a key is valid', async () => {
    const { env } = polarEnv(limiter(true));
    mockPolar([KEY]);
    expect(await (await check(env, KEY)).json()).toEqual({ valid: true });
    expect(
      await (
        await check(env, 'MKC_00000000-0000-4000-8000-000000000000')
      ).json(),
    ).toEqual({ valid: false });
    expect(await (await check(env)).json()).toEqual({ valid: false });
  });

  it('is rate limited and reports an unreachable Polar as 503', async () => {
    expect((await check(polarEnv(limiter(false)).env, KEY)).status).toBe(429);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 502 }),
    );
    expect((await check(polarEnv(limiter(true)).env, KEY)).status).toBe(503);
  });
});
