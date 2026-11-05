import { vi } from 'vitest';

/**
 * Test doubles for Polar licence validation: an env with the Polar settings
 * and a KV cache, and a fetch mock that grants exactly the given keys.
 */
export const ORG = '11111111-1111-4111-8111-111111111111';
export const BENEFIT = '22222222-2222-4222-8222-222222222222';

export function polarEnv(extra: Record<string, unknown> = {}) {
  const cache = new Map<string, string>();
  const env = {
    CLOUD_REQUIRES_LICENSE: 'true',
    POLAR_ACCESS_TOKEN: 'polar_oat_test',
    POLAR_ORGANIZATION_ID: ORG,
    POLAR_BENEFIT_ID: BENEFIT,
    SHARE_LINKS: {
      get: async (key: string) => cache.get(key) ?? null,
      put: vi.fn(async (key: string, value: string) => {
        cache.set(key, value);
      }),
    },
    ...extra,
  } as unknown as Env;
  return { env, cache };
}

/** Mocks Polar's validate endpoint: 200 granted for `granted`, 404 otherwise. */
export function mockPolar(granted: Iterable<string>, benefitId = BENEFIT) {
  const keys = new Set(granted);
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      if (!String(input).endsWith('/v1/license-keys/validate'))
        throw new Error(`unexpected fetch ${String(input)}`);
      const body = JSON.parse(String(init?.body)) as { key: string };
      return keys.has(body.key)
        ? Response.json({
            status: 'granted',
            key: body.key,
            benefit_id: benefitId,
            organization_id: ORG,
            expires_at: null,
          })
        : Response.json({ error: 'ResourceNotFound' }, { status: 404 });
    });
}
