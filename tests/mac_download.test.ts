import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowedMacDownload,
  fullPackageUrl,
  latestFromAppcast,
  macDownload,
} from '../src/worker/mac_download';

const appcast = (url: string, version = '0.9.2') => `<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0"><channel>
  <item><title>${version}</title>
    <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
    <enclosure url="${url}" length="1" type="application/octet-stream"/></item>
  <item><title>0.9.1</title>
    <sparkle:shortVersionString>0.9.1</sparkle:shortVersionString>
    <enclosure url="https://albz.it/updates/markasso/Markasso-0.9.1-2.zip"/></item>
</channel></rss>`;

function setup() {
  const kv = new Map<string, string>();
  const counts = new Map<string, number>();
  const env = {
    SHARE_LINKS: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => {
        kv.set(k, v);
      },
    },
    BOARDS_DB: {
      prepare: (sql: string) => ({
        bind: (day: string, version: string) => ({
          run: async () => {
            expect(sql).toContain('INSERT INTO downloads');
            const key = `${day}|${version}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            return { meta: { changes: 1 } };
          },
        }),
      }),
    },
  } as unknown as Env;
  return { env, kv, counts };
}

const get = (env: Env, path = '/download/mac', method = 'GET') =>
  macDownload(new Request(`https://markasso.it${path}`, { method }), env);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('allowedMacDownload', () => {
  it('accepts only zips under the Markasso updates folder', () => {
    expect(
      allowedMacDownload(
        'https://albz.it/updates/markasso/Markasso-0.9.2-3.zip',
      ),
    ).toBe(true);
    for (const url of [
      'http://albz.it/updates/markasso/Markasso-0.9.2-3.zip',
      'https://evil.example/updates/markasso/Markasso.zip',
      'https://albz.it.evil.example/updates/markasso/Markasso.zip',
      'https://user@albz.it/updates/markasso/Markasso.zip',
      'https://albz.it/updates/other/Markasso.zip',
      'https://albz.it/updates/markasso/Markasso.dmg',
      'https://albz.it/updates/markasso/../../x.zip',
      'https://albz.it/updates/markasso/Markasso.zip?x=1',
      'not a url',
    ])
      expect(allowedMacDownload(url), url).toBe(false);
  });
});

describe('fullPackageUrl', () => {
  it('builds the full package URL only for plain versions', () => {
    expect(fullPackageUrl('0.9.10')).toBe(
      'https://albz.it/updates/markasso/Markasso-0.9.10.zip',
    );
    for (const version of ['0.9', '0.9.10-beta', '1.0.0+5', '../1.0.0', ''])
      expect(fullPackageUrl(version), version).toBeNull();
  });
});

describe('latestFromAppcast', () => {
  it('offers the full package of the first item, not its update archive', () => {
    expect(
      latestFromAppcast(
        appcast(
          'https://albz.it/updates/markasso/Markasso-0.9.10-11.zip',
          '0.9.10',
        ),
      ),
    ).toEqual({
      url: 'https://albz.it/updates/markasso/Markasso-0.9.10.zip',
      version: '0.9.10',
    });
  });

  it('falls back to the enclosure for an unexpected short version', () => {
    expect(
      latestFromAppcast(
        appcast(
          'https://albz.it/updates/markasso/Markasso-1.0.0-beta-12.zip',
          '1.0.0-beta',
        ),
      ),
    ).toEqual({
      url: 'https://albz.it/updates/markasso/Markasso-1.0.0-beta-12.zip',
      version: '1.0.0-beta',
    });
  });

  it('falls back to the enclosure when the short version is missing', () => {
    const xml = appcast(
      'https://albz.it/updates/markasso/Markasso-0.9.2-3.zip',
    ).replace(
      '<sparkle:shortVersionString>0.9.2</sparkle:shortVersionString>',
      '',
    );
    expect(latestFromAppcast(xml)).toEqual({
      url: 'https://albz.it/updates/markasso/Markasso-0.9.2-3.zip',
      version: '0.9.2',
    });
  });

  it('refuses a first item pointing elsewhere', () => {
    expect(
      latestFromAppcast(appcast('https://evil.example/Markasso.zip')),
    ).toBeNull();
    expect(latestFromAppcast('<rss></rss>')).toBeNull();
  });
});

describe('macDownload', () => {
  it('redirects to the latest build and counts it per day and version', async () => {
    const { env, counts } = setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        appcast('https://albz.it/updates/markasso/Markasso-0.9.2-3.zip'),
      ),
    );
    const res = await get(env);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      'https://albz.it/updates/markasso/Markasso-0.9.2.zip',
    );
    await get(env);
    const today = new Date().toISOString().slice(0, 10);
    expect(counts.get(`${today}|0.9.2`)).toBe(2);
  });

  it('caches the appcast and does not count HEAD or the JSON info', async () => {
    const { env, counts } = setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          appcast('https://albz.it/updates/markasso/Markasso-0.9.2-3.zip'),
        ),
      );
    expect(await (await get(env, '/download/mac.json')).json()).toEqual({
      url: 'https://albz.it/updates/markasso/Markasso-0.9.2.zip',
      version: '0.9.2',
    });
    expect((await get(env, '/download/mac', 'HEAD')).status).toBe(302);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(counts.size).toBe(0);
  });

  it('falls back to the last known build when the appcast is down', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { env } = setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        appcast('https://albz.it/updates/markasso/Markasso-0.9.2-3.zip'),
      ),
    );
    await get(env);
    vi.advanceTimersByTime(10 * 60 * 1000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );
    expect((await get(env)).headers.get('Location')).toBe(
      'https://albz.it/updates/markasso/Markasso-0.9.2.zip',
    );
  });

  it('still downloads when the counter fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { env } = setup();
    (env as unknown as { BOARDS_DB: unknown }).BOARDS_DB = {
      prepare: () => {
        throw new Error('D1 down');
      },
    };
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const res = await get(env);
    expect(res.status).toBe(302);
    expect(allowedMacDownload(res.headers.get('Location')!)).toBe(true);
  });
});
