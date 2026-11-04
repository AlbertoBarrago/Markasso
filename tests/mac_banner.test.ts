import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/i18n', () => ({ t: (key: string) => key }));
const { isMacDesktop } = await import('../src/ui/mac_banner');

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

describe('isMacDesktop', () => {
  it('detects a Mac from client hints or the user agent', () => {
    expect(isMacDesktop({ userAgent: '', maxTouchPoints: 0, userAgentData: { platform: 'macOS' } })).toBe(true);
    expect(isMacDesktop({ userAgent: SAFARI_MAC, maxTouchPoints: 0 })).toBe(true);
  });

  it('rules out iPads (Macintosh user agent with touch) and other systems', () => {
    expect(isMacDesktop({ userAgent: SAFARI_MAC, maxTouchPoints: 5 })).toBe(false);
    expect(isMacDesktop({ userAgent: 'Windows NT 10.0', maxTouchPoints: 0 })).toBe(false);
    expect(isMacDesktop({ userAgent: SAFARI_MAC, maxTouchPoints: 0, userAgentData: { platform: 'Windows' } })).toBe(false);
  });
});
