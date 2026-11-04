import type { CloudState } from '../io/cloud';

/** Every state the cloud status button can show, mirroring the Mac app's title-bar control. */
export type CloudStatusKind =
  | 'saved'
  | 'pending'
  | 'syncing'
  | 'conflict'
  | 'offline'
  | 'readOnly'
  | 'revoked'
  | 'licence'
  | 'tooLarge'
  | 'failed'
  | 'missing';

export type CloudIcon =
  | 'check'
  | 'sync'
  | 'alert'
  | 'off'
  | 'eye'
  | 'lock'
  | 'missing';

export interface CloudStatusInput {
  state: CloudState;
  /** HTTP status of the last failure (0 for a network error), 0 when none. */
  error: number;
  inFlight: boolean;
  readOnly: boolean;
}

export interface CloudStatus {
  kind: CloudStatusKind;
  icon: CloudIcon;
  /** True only while a request is in flight; CSS stops it under reduced motion. */
  spinning: boolean;
  titleKey: string;
  detailKey: string;
}

const ICON: Record<CloudStatusKind, CloudIcon> = {
  saved: 'check',
  pending: 'sync',
  syncing: 'sync',
  conflict: 'alert',
  offline: 'off',
  readOnly: 'eye',
  revoked: 'lock',
  licence: 'alert',
  tooLarge: 'alert',
  failed: 'alert',
  missing: 'missing',
};

const DETAIL: Record<CloudStatusKind, string> = {
  saved: 'cloudDetailSaved',
  pending: 'cloudDetailPending',
  syncing: 'cloudDetailSyncing',
  conflict: 'cloudConflictMessage',
  offline: 'cloudDetailOffline',
  readOnly: 'cloudDetailReadOnly',
  revoked: 'cloudDetailRevoked',
  licence: 'cloudLicenseNeeded',
  tooLarge: 'cloudDetailTooLarge',
  failed: 'cloudUnavailable',
  missing: 'cloudDetailMissing',
};

function kindOf(input: CloudStatusInput): CloudStatusKind {
  if (input.state === 'conflict') return 'conflict';
  if (input.error === 401) return 'revoked';
  if (input.error === 402) return 'licence';
  if (input.error === 404) return 'missing';
  if (input.error === 413) return 'tooLarge';
  if (input.state === 'offline') return 'offline';
  if (input.state === 'error') return 'failed';
  if (input.inFlight) return 'syncing';
  if (input.readOnly) return 'readOnly';
  if (input.state === 'saving') return 'pending';
  return 'saved';
}

/** Maps the client state to what the status button shows. Pure, so the mapping is unit-tested. */
export function cloudStatus(input: CloudStatusInput): CloudStatus {
  const kind = kindOf(input);
  // Rate limits and outages keep the offline icon but explain the real cause.
  const detailKey =
    kind === 'offline' && input.error === 429
      ? 'cloudSlow'
      : kind === 'offline' && input.error === 503
        ? 'cloudUnavailable'
        : DETAIL[kind];
  return {
    kind,
    icon: ICON[kind],
    spinning: kind === 'syncing',
    titleKey: `cloudStatus${kind[0]!.toUpperCase()}${kind.slice(1)}`,
    detailKey,
  };
}

/** True for states the user has to notice; routine saves are not announced to screen readers. */
export function cloudStatusNeedsAttention(kind: CloudStatusKind): boolean {
  return !['saved', 'pending', 'syncing', 'readOnly'].includes(kind);
}

// Lucide-style 24px stroke icons: a shared cloud outline with a glyph inside.
const CLOUD = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
const GLYPH: Record<CloudIcon, string> = {
  check: `${CLOUD}<path stroke-width="2.6" d="m8.6 14.2 2.5 2.5 4.6-4.6"/>`,
  sync: `${CLOUD}<g class="cloud-spin"><path d="M9.3 14a2.9 2.9 0 0 1 5-2"/><path d="M14.7 14a2.9 2.9 0 0 1-5 2"/><path d="M14.5 10.4V12h-1.6"/><path d="M9.5 17.6V16h1.6"/></g>`,
  alert: `${CLOUD}<path d="M12 11.5v3"/><path d="M12 17h.01"/>`,
  off: `${CLOUD}<path d="m3 3 18 18"/>`,
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  lock: `${CLOUD}<rect x="9.5" y="13.5" width="5" height="3.5" rx="0.8"/><path d="M10.5 13.5v-1a1.5 1.5 0 0 1 3 0v1"/>`,
  missing: `${CLOUD}<path d="m10 12.5 4 4"/><path d="m14 12.5-4 4"/>`,
};

export function cloudIconSvg(icon: CloudIcon): string {
  return `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[icon]}</svg>`;
}

export type CloudPopoverAction =
  | 'cloudResolve'
  | 'cloudLicense'
  | 'cloudRetry'
  | 'cloudDuplicate'
  | 'cloudReadLink'
  | 'cloudEditLink'
  | 'cloudMac';

/**
 * Actions offered in the status popover, in display order: the fix for the
 * current state first, then the board links (edit link only with a token).
 */
export function cloudPopoverActions(
  kind: CloudStatusKind,
  board: { hasBoard: boolean; editable: boolean },
): CloudPopoverAction[] {
  const actions: CloudPopoverAction[] = [];
  if (kind === 'conflict') actions.push('cloudResolve');
  if (kind === 'licence') actions.push('cloudLicense');
  if (kind === 'offline' || kind === 'failed') actions.push('cloudRetry');
  if (kind === 'readOnly') actions.push('cloudDuplicate');
  if (board.hasBoard) {
    actions.push('cloudReadLink');
    if (board.editable) actions.push('cloudEditLink');
    actions.push('cloudMac');
  }
  return actions;
}
