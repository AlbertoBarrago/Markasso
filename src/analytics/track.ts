import { faro } from '@grafana/faro-web-sdk';

/**
 * Sends a custom RUM event to Faro. No-ops silently when Faro isn't
 * initialized (dev/preview builds), so call sites never need to guard.
 */
export function track(name: string, attributes?: Record<string, string>): void {
  faro.api?.pushEvent(name, attributes);
}
