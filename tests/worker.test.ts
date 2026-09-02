import { describe, expect, it, vi } from 'vitest';
import worker, { isRoomInactive } from '../src/worker';

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

function createEnv(
  options: {
    rateLimitSuccess?: boolean;
    reportRateLimitSuccess?: boolean;
    quotaUsed?: number;
  } = {},
): Env {
  return {
    SHARE_LINKS: {
      get: vi
        .fn()
        .mockResolvedValue(
          options.quotaUsed === undefined ? null : String(options.quotaUsed),
        ),
      put: vi.fn(),
    },
    SHARE_RATE_LIMITER: {
      limit: vi
        .fn()
        .mockResolvedValue({ success: options.rateLimitSuccess ?? true }),
    },
    REPORT_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({
        success: options.reportRateLimitSuccess ?? true,
      }),
    },
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response('asset')),
    },
    REPORT_REPO: 'AlbertoBarrago/Markasso',
    GITHUB_TOKEN: 'test-token',
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

function postReport(body: string, headers: HeadersInit = {}): WorkerRequest {
  return new Request('https://markasso.example/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as WorkerRequest;
}

const validReport = {
  title: 'Freehand strokes flicker on release',
  description: 'The stroke sometimes fails to finish when opening the hand.',
  category: 'bug',
};

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

describe('report worker', () => {
  it('creates a GitHub issue and records the quota usage', async () => {
    const env = createEnv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ html_url: 'https://github.com/x/y/issues/1' }),
        {
          status: 201,
        },
      ),
    );

    const response = await worker.fetch(
      postReport(JSON.stringify(validReport)),
      env,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { url: string };
    expect(payload.url).toBe('https://github.com/x/y/issues/1');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.github.com/repos/AlbertoBarrago/Markasso/issues',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(env.SHARE_LINKS.put).toHaveBeenCalledWith(
      expect.stringMatching(/^report-quota:/),
      '1',
      expect.objectContaining({ expirationTtl: 600 }),
    );

    fetchSpy.mockRestore();
  });

  it('rejects cross-origin writes before rate limiting', async () => {
    const env = createEnv();
    const response = await worker.fetch(
      postReport(JSON.stringify(validReport), {
        Origin: 'https://evil.example',
      }),
      env,
    );

    expect(response.status).toBe(403);
    expect(env.REPORT_RATE_LIMITER.limit).not.toHaveBeenCalled();
  });

  it('rejects an invalid report payload', async () => {
    const env = createEnv();
    const response = await worker.fetch(
      postReport(
        JSON.stringify({ title: 'x', description: 'x', category: 'bug' }),
      ),
      env,
    );
    expect(response.status).toBe(400);
  });

  it('rejects bursts beyond the rate limiter', async () => {
    const env = createEnv({ reportRateLimitSuccess: false });
    const response = await worker.fetch(
      postReport(JSON.stringify(validReport)),
      env,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('rejects requests once the 10-minute quota is exhausted', async () => {
    const env = createEnv({ quotaUsed: 3 });
    const response = await worker.fetch(
      postReport(JSON.stringify(validReport)),
      env,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('600');
  });

  it('returns a gateway error when GitHub rejects the issue', async () => {
    const env = createEnv();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 401 }));

    const response = await worker.fetch(
      postReport(JSON.stringify(validReport)),
      env,
    );
    expect(response.status).toBe(502);
    expect(env.SHARE_LINKS.put).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

describe('isRoomInactive', () => {
  const THRESHOLD = 7 * 24 * 60 * 60 * 1000;

  it('reclaims a room with no peers idle past the threshold', () => {
    expect(isRoomInactive(1_000_000_000, 0, 0, THRESHOLD)).toBe(true);
  });

  it('keeps a room that still has connected peers', () => {
    expect(isRoomInactive(1_000_000_000, 0, 1, THRESHOLD)).toBe(false);
  });

  it('keeps an empty room that was active recently', () => {
    expect(
      isRoomInactive(1_000_000_000, 1_000_000_000 - 1000, 0, THRESHOLD),
    ).toBe(false);
  });

  it('keeps a room idle exactly at the threshold', () => {
    expect(isRoomInactive(THRESHOLD, 0, 0, THRESHOLD)).toBe(false);
  });
});

describe('scheduled cleanup', () => {
  it('enumerates indexed rooms and asks each to clean up', async () => {
    const cleanup = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: false })));
    const env = {
      SHARE_LINKS: {
        list: vi.fn().mockResolvedValue({
          keys: [{ name: 'room:abc123' }, { name: 'room:xyz789' }],
          list_complete: true,
          cursor: undefined,
        }),
        delete: vi.fn(),
      },
      SESSION_ROOMS: {
        idFromName: vi.fn((name: string) => ({ name })),
        get: vi.fn(() => ({ fetch: cleanup })),
      },
    } as unknown as Env;

    await worker.scheduled(
      { cron: '0 12 * * *' } as unknown as ScheduledController,
      env,
      {} as unknown as ExecutionContext,
    );

    expect(env.SHARE_LINKS.list).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'room:' }),
    );
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(env.SESSION_ROOMS.idFromName).toHaveBeenCalledWith('abc123');
    expect(env.SESSION_ROOMS.idFromName).toHaveBeenCalledWith('xyz789');
  });
});
