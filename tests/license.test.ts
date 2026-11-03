import { afterEach, describe, expect, it, vi } from 'vitest';
import { licenseGate, sha256 } from '../src/worker/license';

function setup() {
  const cache = new Map<string, string>();
  const env = {
    CLOUD_REQUIRES_LICENSE: 'true',
    LEMON_STORE_ID: '1',
    LEMON_PRODUCT_ID: '4',
    SHARE_LINKS: {
      get: async (key: string) => cache.get(key) ?? null,
      put: vi.fn(async (key: string, value: string) => {
        cache.set(key, value);
      }),
    },
  } as unknown as Env;
  const request = new Request('https://markasso.example/api/board', {
    headers: { 'X-Markasso-License': 'test-license' },
  });
  return { cache, env, request };
}
afterEach(() => vi.restoreAllMocks());
describe('license gate', () => {
  it('bypasses when off and requires a key when on', async () => {
    const { env } = setup();
    expect(await licenseGate(new Request('https://example.com'), env)).toBe(
      402,
    );
    expect(
      await licenseGate(new Request('https://example.com'), {
        ...env,
        CLOUD_REQUIRES_LICENSE: 'false',
      }),
    ).toBeNull();
  });
  it.each([
    [true, 'active', 1, 4, null],
    [false, 'active', 1, 4, 402],
    [true, 'disabled', 1, 4, 402],
    [true, 'active', 2, 4, 402],
    [true, 'active', 1, 5, 402],
  ])('checks validity, status and ownership (%s %s %s %s)', async (valid, status, store_id, product_id, expected) => {
    const { env, request } = setup();
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        valid,
        license_key: { status },
        meta: { store_id, product_id },
      }),
    );
    expect(await licenseGate(request, env)).toBe(expected);
    expect(await licenseGate(request, env)).toBe(expected);
    expect(upstream).toHaveBeenCalledOnce();
    const options = upstream.mock.calls[0]?.[1];
    expect(options?.body?.toString()).toBe('license_key=test-license');
    expect(env.SHARE_LINKS.put).toHaveBeenCalledWith(
      await sha256('test-license').then((s) => `license:${s}`),
      expect.not.stringContaining('test-license'),
      { expirationTtl: expected === null ? 604800 : 600 },
    );
  });
  it('uses stale valid cache only for seven days during outages', async () => {
    const { cache, env, request } = setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await licenseGate(request, env)).toBe(503);
    const key = `license:${await sha256('test-license')}`;
    cache.set(
      key,
      JSON.stringify({
        valid: true,
        checkedAt: Date.now() - 2 * 86400000,
        scope: '1:4',
      }),
    );
    expect(await licenseGate(request, env)).toBeNull();
    cache.set(
      key,
      JSON.stringify({
        valid: true,
        checkedAt: Date.now() - 8 * 86400000,
        scope: '1:4',
      }),
    );
    expect(await licenseGate(request, env)).toBe(503);
  });
});
