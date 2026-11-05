import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/i18n', () => ({ t: (key: string) => key }));
vi.mock('../src/io/session', () => ({ flushSession: () => {} }));

const { fetchBuildId, hasNewBuild } = await import('../src/ui/update_banner');

/** A fetch stub answering once with the given status and JSON body. */
function stubFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe('hasNewBuild', () => {
  it('is true when the deployed id differs', () => {
    expect(hasNewBuild('abc', 'abd')).toBe(true);
  });

  it('is false for the same id', () => {
    expect(hasNewBuild('abc', 'abc')).toBe(false);
  });

  it('is false without a usable remote id', () => {
    expect(hasNewBuild('abc', null)).toBe(false);
    expect(hasNewBuild('abc', '')).toBe(false);
  });
});

describe('fetchBuildId', () => {
  it('reads the id and bypasses the HTTP cache', async () => {
    const fetchFn = stubFetch(200, { buildId: 'mh3k2' });
    await expect(fetchBuildId(fetchFn)).resolves.toBe('mh3k2');
    expect(fetchFn).toHaveBeenCalledWith('/version.json', {
      cache: 'no-store',
    });
  });

  it('returns null on an error status', async () => {
    await expect(fetchBuildId(stubFetch(404, {}))).resolves.toBeNull();
  });

  it('returns null for a malformed body', async () => {
    await expect(
      fetchBuildId(stubFetch(200, { buildId: 42 })),
    ).resolves.toBeNull();
    await expect(fetchBuildId(stubFetch(200, null))).resolves.toBeNull();
  });

  it('propagates network failures', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await expect(fetchBuildId(fetchFn)).rejects.toThrow('offline');
  });

  it('rejects a non-JSON answer such as the SPA fallback page', async () => {
    const fetchFn = vi.fn(
      async () => new Response('<!doctype html>', { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(fetchBuildId(fetchFn)).rejects.toThrow();
  });
});
