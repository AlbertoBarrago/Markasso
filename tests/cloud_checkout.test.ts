import { describe, expect, it } from 'vitest';
import { checkoutUrl } from '../src/cloud_checkout';

describe('checkout URL', () => {
  it.each([
    undefined,
    '',
    '   ',
    'invalid',
    '/checkout',
    'javascript:alert(1)',
    'http://example.com',
    'https://user:pass@example.com',
  ])('disables checkout for %s', (value) => {
    expect(checkoutUrl(value)).toBeNull();
  });

  it('trims an HTTPS checkout URL and preserves its query', () => {
    expect(checkoutUrl('  https://example.com/checkout?product=cloud  ')).toBe(
      'https://example.com/checkout?product=cloud',
    );
  });
});
