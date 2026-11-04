import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import en from '../src/i18n/locales/en.json';
import { CloudClient, type CloudState } from '../src/io/cloud';
import {
  type CloudStatusInput,
  type CloudStatusKind,
  cloudIconSvg,
  cloudPopoverActions,
  cloudStatus,
} from '../src/ui/cloud_status';

const base: CloudStatusInput = {
  state: 'saved',
  error: 0,
  inFlight: false,
  readOnly: false,
};
const cases: [Partial<CloudStatusInput>, CloudStatusKind, string][] = [
  [{}, 'saved', 'check'],
  [{ state: 'saving' }, 'pending', 'sync'],
  [{ state: 'saving', inFlight: true }, 'syncing', 'sync'],
  [{ inFlight: true }, 'syncing', 'sync'],
  [{ state: 'conflict', error: 409 }, 'conflict', 'alert'],
  [{ state: 'offline', error: 0 }, 'offline', 'off'],
  [{ state: 'offline', error: 429 }, 'offline', 'off'],
  [{ state: 'offline', error: 503 }, 'offline', 'off'],
  [{ readOnly: true }, 'readOnly', 'eye'],
  [{ state: 'error', error: 401 }, 'revoked', 'lock'],
  [{ state: 'error', error: 402 }, 'licence', 'alert'],
  [{ state: 'error', error: 413 }, 'tooLarge', 'alert'],
  [{ state: 'error', error: 500 }, 'failed', 'alert'],
  [{ state: 'error', error: 404 }, 'missing', 'missing'],
];

describe('cloud status mapping', () => {
  it.each(cases)('%o shows %s with the %s icon', (input, kind, icon) => {
    const status = cloudStatus({ ...base, ...input });
    expect(status.kind).toBe(kind);
    expect(status.icon).toBe(icon);
  });
  it('spins only while a request is in flight', () => {
    for (const [input, kind] of cases)
      expect(cloudStatus({ ...base, ...input }).spinning).toBe(
        kind === 'syncing',
      );
  });
  it('lets a conflict win over a request still in flight', () => {
    expect(
      cloudStatus({ ...base, state: 'conflict', error: 409, inFlight: true })
        .kind,
    ).toBe('conflict');
  });
  it('explains rate limits and outages behind the offline icon', () => {
    expect(
      cloudStatus({ ...base, state: 'offline', error: 429 }).detailKey,
    ).toBe('cloudSlow');
    expect(
      cloudStatus({ ...base, state: 'offline', error: 503 }).detailKey,
    ).toBe('cloudUnavailable');
    expect(cloudStatus({ ...base, state: 'offline' }).detailKey).toBe(
      'cloudDetailOffline',
    );
  });
  it('never repeats the title at the start of the explanation', () => {
    const strings = en as Record<string, string>;
    for (const [input] of cases) {
      const status = cloudStatus({ ...base, ...input });
      const title = strings[status.titleKey]!.toLowerCase();
      expect(
        strings[status.detailKey]!.toLowerCase().startsWith(title),
        status.kind,
      ).toBe(false);
    }
  });
  it('has an English title and explanation for every state', () => {
    const strings = en as Record<string, string>;
    for (const [input] of cases) {
      const status = cloudStatus({ ...base, ...input });
      expect(strings[status.titleKey], status.titleKey).toBeTruthy();
      expect(strings[status.detailKey], status.detailKey).toBeTruthy();
    }
  });
  it('marks only the sync arrows as the spinning part of the icon', () => {
    expect(cloudIconSvg('sync')).toContain('class="cloud-spin"');
    expect(cloudIconSvg('check')).not.toContain('cloud-spin');
    expect(cloudIconSvg('sync')).toContain('aria-hidden="true"');
  });
  it('stops the rotation under prefers-reduced-motion', () => {
    const css = readFileSync('src/style.css', 'utf8');
    const block = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.cloud-status--spinning \.cloud-spin \{([^}]*)\}/,
    );
    expect(block?.[1]).toMatch(/animation:\s*none/);
  });
});

describe('cloud status popover actions', () => {
  const board = { hasBoard: true, editable: true };
  it('offers the fix for the state before the links', () => {
    expect(cloudPopoverActions('conflict', board)).toEqual([
      'cloudResolve',
      'cloudReadLink',
      'cloudEditLink',
      'cloudMac',
    ]);
    expect(cloudPopoverActions('licence', board)[0]).toBe('cloudLicense');
    expect(cloudPopoverActions('offline', board)[0]).toBe('cloudRetry');
    expect(cloudPopoverActions('failed', board)[0]).toBe('cloudRetry');
  });
  it('hides the edit link without a token and offers Duplicate when read-only', () => {
    expect(
      cloudPopoverActions('readOnly', { hasBoard: true, editable: false }),
    ).toEqual(['cloudDuplicate', 'cloudReadLink', 'cloudMac']);
  });
  it('offers no links before a board exists', () => {
    expect(
      cloudPopoverActions('saved', { hasBoard: false, editable: false }),
    ).toEqual([]);
    expect(
      cloudPopoverActions('offline', { hasBoard: false, editable: false }),
    ).toEqual(['cloudRetry']);
  });
  it('has a label for every action', () => {
    const strings = en as Record<string, string>;
    const kinds: CloudStatusKind[] = ['conflict', 'licence', 'offline'];
    for (const kind of [...kinds, 'readOnly' as const])
      for (const action of cloudPopoverActions(kind, board))
        expect(strings[action], action).toBeTruthy();
  });
});

describe('cloud client activity', () => {
  it('reports requests in flight and the last successful sync', async () => {
    let resolve: (response: Response) => void = () => {};
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const client = new CloudClient(storage, fetcher);
    const activity: boolean[] = [];
    client.onActivity = () => activity.push(client.inFlight);
    expect(client.lastSyncedAt).toBeNull();
    const opening = client.open(new URL(`https://markasso.it/b/Abc123def456`));
    expect(client.inFlight).toBe(true);
    resolve(
      Response.json({
        id: 'Abc123def456',
        version: 1,
        elements: [],
      }),
    );
    await opening;
    expect(client.inFlight).toBe(false);
    expect(activity).toEqual([true, false]);
    expect(client.lastSyncedAt).toEqual(expect.any(Number));
    expect(client.state satisfies CloudState).toBe('saved');
  });
});
