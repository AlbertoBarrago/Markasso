import { describe, expect, it, vi } from 'vitest';
import worker from '../src/worker';

const validScene = [
  {
    id: 'rect',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  },
];

function createEnv(options: { rateLimitSuccess?: boolean } = {}): Env {
  return {
    SHARE_LINKS: {
      get: vi.fn(),
      put: vi.fn(),
    },
    SHARE_RATE_LIMITER: {
      limit: vi
        .fn()
        .mockResolvedValue({ success: options.rateLimitSuccess ?? true }),
    },
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response('asset')),
    },
  } as unknown as Env;
}

type WorkerRequest = Parameters<typeof worker.fetch>[0];

function post(body: string, headers: HeadersInit = {}): WorkerRequest {
  return new Request('https://markasso.example/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as WorkerRequest;
}

describe('share worker', () => {
  it('validates and stores a scene', async () => {
    const env = createEnv();
    const response = await worker.fetch(post(JSON.stringify(validScene)), env);

    expect(response.status).toBe(200);
    expect(env.SHARE_LINKS.put).toHaveBeenCalledOnce();
    const payload = (await response.json()) as { id: string; url: string };
    expect(payload.id).toMatch(/^[a-zA-Z0-9]{8}$/);
    expect(payload.url).toBe(`https://markasso.example/#s=${payload.id}`);
  });

  it('rejects cross-origin writes before rate limiting', async () => {
    const env = createEnv();
    const response = await worker.fetch(
      post(JSON.stringify(validScene), { Origin: 'https://evil.example' }),
      env,
    );

    expect(response.status).toBe(403);
    expect(env.SHARE_RATE_LIMITER.limit).not.toHaveBeenCalled();
    expect(env.SHARE_LINKS.put).not.toHaveBeenCalled();
  });

  it('rejects oversized, invalid, and rate-limited writes', async () => {
    const oversizedEnv = createEnv();
    const oversized = await worker.fetch(
      post('x'.repeat(1_000_001)),
      oversizedEnv,
    );
    expect(oversized.status).toBe(413);

    const invalidEnv = createEnv();
    const invalid = await worker.fetch(
      post(JSON.stringify([{ id: 'bad' }])),
      invalidEnv,
    );
    expect(invalid.status).toBe(400);
    expect(invalidEnv.SHARE_LINKS.put).not.toHaveBeenCalled();

    const limitedEnv = createEnv({ rateLimitSuccess: false });
    const limited = await worker.fetch(
      post(JSON.stringify(validScene)),
      limitedEnv,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
  });
});
