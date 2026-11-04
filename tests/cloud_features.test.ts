import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import { History } from '../src/engine/history';

vi.mock('../src/i18n', () => ({ t: (key: string) => key }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('cloud build flag', () => {
  it.each([
    undefined,
    'false',
    'TRUE',
    '1',
    'true',
  ])('exposes cloud actions only for the exact true value (%s)', async (value) => {
    vi.stubEnv('VITE_CLOUD_ENABLED', value);
    const { CLOUD_ENABLED } = await import('../src/config/features');
    const { CLOUD_ACTIONS } = await import('../src/ui/cloud_boards');
    expect(CLOUD_ENABLED).toBe(value === 'true');
    expect(CLOUD_ACTIONS).toEqual(
      value === 'true'
        ? [
            'cloudSave',
            'cloudReadLink',
            'cloudEditLink',
            'cloudMac',
            'cloudDuplicate',
            'cloudLicense',
            'cloudSubscription',
          ]
        : [],
    );
  });

  it('ignores board routes without touching the DOM, storage, network or URL', async () => {
    vi.stubEnv('VITE_CLOUD_ENABLED', undefined);
    const location = new URL('https://markasso.it/b/Abc123def456#k=secret');
    vi.stubGlobal('location', location);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { initCloudBoards, cloudAction, cloudActionAvailable } = await import(
      '../src/ui/cloud_boards'
    );
    const history = new History(createScene());
    const scene = history.present;
    await initCloudBoards(history);
    cloudAction(history, 'cloudSave');
    expect(cloudActionAvailable(history, 'cloudLicense')).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(history.present).toBe(scene);
    expect(history.readOnly).toBe(false);
    expect(location.href).toBe('https://markasso.it/b/Abc123def456#k=secret');
  });
});
