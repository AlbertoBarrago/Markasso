import { exportMarkasso as _exportMarkasso } from '../io/markasso';
import { buildShareUrl as _buildShareUrl } from '../io/share';
import {
  exportHTML as _exportHTML,
  exportPNG as _exportPNG,
  exportSVG as _exportSVG,
} from '../rendering/export';
import { track } from './track';

/**
 * Thin tracked wrappers around export/share actions. Kept separate from
 * io/rendering so those modules stay free of analytics concerns — UI call
 * sites (toolbar, command palette) import from here instead, so every
 * trigger point is tracked without duplicating track() calls per call site.
 */

export function exportPNG(...args: Parameters<typeof _exportPNG>): void {
  _exportPNG(...args);
  track('export_used', { format: 'png' });
}

export function exportSVG(...args: Parameters<typeof _exportSVG>): void {
  _exportSVG(...args);
  track('export_used', { format: 'svg' });
}

export function exportHTML(...args: Parameters<typeof _exportHTML>): void {
  _exportHTML(...args);
  track('export_used', { format: 'html' });
}

export function exportMarkasso(
  ...args: Parameters<typeof _exportMarkasso>
): void {
  _exportMarkasso(...args);
  track('export_used', { format: 'markasso' });
}

export async function buildShareUrl(
  ...args: Parameters<typeof _buildShareUrl>
): Promise<string> {
  const url = await _buildShareUrl(...args);
  track('share_link_created');
  return url;
}
