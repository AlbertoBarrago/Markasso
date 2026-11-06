import { CLOUD_ENABLED } from '../config/features';
import { fitToElements } from '../core/viewport';
import type { History } from '../engine/history';
import { t } from '../i18n';
import {
  boardLinks,
  CloudClient,
  CloudError,
  type CloudScene,
  cloudPageUrl,
  parseBoardUrl,
} from '../io/cloud';
import { listBoards, readBoardIndex, renameBoard } from '../io/cloud_index';
import { deleteThumb, loadThumb, saveThumb } from '../io/cloud_thumbs';
import { exportMarkasso } from '../io/markasso';
import { getLiveSessionUrl } from '../io/realtime';
import { renderSceneThumbnail } from '../rendering/export';
import { type BoardAction, openBoardsPanel } from './cloud_boards_panel';
import { RemoteCheckSchedule, remoteDecision } from './cloud_remote_check';
import {
  type CloudPopoverAction,
  cloudIconSvg,
  cloudPopoverActions,
  cloudStatus,
  cloudStatusNeedsAttention,
} from './cloud_status';
import { launchConfetti } from './confetti';
import {
  dialog as appDialog,
  type DialogOptions as BaseDialogOptions,
} from './dialog';
import { isMacDesktop } from './mac_banner';
import { copyToClipboard, showShareToast } from './share_actions';

const ALL_CLOUD_ACTIONS = [
  'cloudSave',
  'cloudBoards',
  'cloudReadLink',
  'cloudEditLink',
  'cloudMac',
  'cloudDuplicate',
  'cloudLicense',
  'cloudSubscription',
] as const;
export const CLOUD_ACTIONS = CLOUD_ENABLED ? ALL_CLOUD_ACTIONS : [];
/**
 * How menus group the cloud actions: saving, the hand-off to the Mac app,
 * the open cloud board, the account. Every action appears in exactly one group, in this order.
 */
export const CLOUD_GROUPS: readonly (readonly (typeof ALL_CLOUD_ACTIONS)[number][])[] =
  [
    ['cloudSave', 'cloudBoards'],
    ['cloudMac'],
    ['cloudReadLink', 'cloudEditLink', 'cloudDuplicate'],
    ['cloudLicense', 'cloudSubscription'],
  ];
/**
 * Which separators to show, given which groups have a visible item. Entry i
 * is the separator before group i (entry 0 is always false): it shows when
 * group i has an item and some earlier group does too, so an empty group
 * never leaves two lines in a row or a line at an edge.
 */
export function cloudSeparators(shown: readonly boolean[]): boolean[] {
  return shown.map((visible, i) => visible && shown.slice(0, i).some(Boolean));
}
const controllers = new WeakMap<History, ReturnType<typeof createController>>();
export function cloudLicenseStored(history: History): boolean {
  return controllers.get(history)?.hasLicense() ?? false;
}
export function cloudActionAvailable(
  history: History,
  action: (typeof CLOUD_ACTIONS)[number],
): boolean {
  return controllers.get(history)?.available(action) ?? false;
}
export function cloudAction(
  history: History,
  action: (typeof CLOUD_ACTIONS)[number],
): void {
  void controllers
    .get(history)
    ?.run(action)
    .catch(() => dialog(storageDialog()));
}

type DialogOptions = Omit<BaseDialogOptions, 'kicker' | 'field' | 'link'> & {
  /** Adds the licence key field and the purchase link; resolves with the typed key. */
  license?: boolean;
};

/** The shared app dialog with the "Markasso Cloud" kicker and the licence field. */
function dialog(options: DialogOptions): Promise<string | null> {
  const { license, ...rest } = options;
  return appDialog({
    kicker: t('cloudPageTitle'),
    ...rest,
    ...(license
      ? {
          field: { label: t('cloudKey'), type: 'password' as const },
          link: { href: cloudPageUrl(), label: t('cloudBuy') },
        }
      : {}),
  });
}
/** Title and explanation for a failed request, matching the status icon's wording. */
function errorDialog(status: number): DialogOptions {
  const [title, message] = (
    {
      0: ['cloudStatusOffline', 'cloudDetailCheckConnection'],
      401: ['cloudStatusRevoked', 'cloudDetailRevoked'],
      402: ['cloudStatusLicence', 'cloudLicenseNeeded'],
      404: ['cloudStatusMissing', 'cloudDetailMissing'],
      413: ['cloudStatusTooLarge', 'cloudDetailTooLarge'],
      429: ['cloudBusyTitle', 'cloudSlow'],
    } as Record<number, [string, string]>
  )[status] ?? ['cloudErrorTitle', 'cloudUnavailable'];
  return { title: t(title), message: t(message) };
}
const storageDialog = (): DialogOptions => ({
  title: t('cloudStorageTitle'),
  message: t('cloudStorageDetail'),
});
/** Shows a transient notice under the status button, e.g. that a board opened read-only. */
function showCloudToast(message: string): void {
  document.getElementById('cloud-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'cloud-toast';
  toast.className = 'share-toast cloud-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 5000);
}
function createController(history: History) {
  // The status button lives in the top-right island next to the live chips,
  // with the same chrome as the other island buttons.
  const island = document.createElement('div');
  island.className = 'tb-island cloud-status-island';
  island.hidden = true;
  const indicator = document.createElement('button');
  indicator.type = 'button';
  indicator.className = 'tb-btn cloud-status';
  indicator.setAttribute('aria-haspopup', 'dialog');
  indicator.setAttribute('aria-expanded', 'false');
  const announcer = document.createElement('span');
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  island.append(indicator, announcer);
  const topRight = document.querySelector('.tb-island-topright');
  if (topRight) topRight.prepend(island);
  else {
    island.classList.add('cloud-status-island--floating');
    document.body.append(island);
  }
  let popover: HTMLElement | null = null;
  let openError = 0;
  let resolving = false;
  let loading = false;
  let previousElements = history.present.elements;
  let retryCreate = false;
  let creating = false;
  let opened = false;
  let openingFailed = false;
  const client = new CloudClient(localStorage, fetch, () => {
    document.dispatchEvent(new Event('markasso-cloud-change'));
    render();
    if (client.state === 'saved' && client.id) scheduleThumb(client.id);
    if (client.state === 'conflict') void resolveConflict();
    if (client.error === 402) void license();
  });
  client.onActivity = () => render();
  /**
   * Refreshes the Boards panel thumbnail of the open board a few seconds
   * after it settles, at most once per THUMB_INTERVAL: a thumbnail is a cache,
   * never worth slowing down drawing.
   */
  const THUMB_DELAY = 3000;
  const THUMB_INTERVAL = 30000;
  let thumbTimer: ReturnType<typeof setTimeout> | undefined;
  let thumbAt = 0;
  let thumbId: string | null = null;
  function scheduleThumb(id: string): void {
    if (thumbTimer) clearTimeout(thumbTimer);
    const wait =
      thumbId === id
        ? Math.max(THUMB_DELAY, thumbAt + THUMB_INTERVAL - Date.now())
        : THUMB_DELAY;
    thumbTimer = setTimeout(() => {
      if (client.id !== id) return;
      thumbId = id;
      thumbAt = Date.now();
      // Started inside a promise so a synchronous failure (no canvas
      // support) lands in the same catch as the async ones.
      void Promise.resolve()
        .then(() => renderSceneThumbnail(history.present.elements))
        .then((blob) => (blob ? saveThumb(id, blob) : deleteThumb(id)))
        .catch(() => {
          /* No IndexedDB (private mode) or no canvas: the panel shows a placeholder. */
        });
    }, wait);
  }
  const currentStatus = () =>
    cloudStatus(
      openingFailed
        ? {
            state: [0, 429, 503].includes(openError) ? 'offline' : 'error',
            error: openError,
            inFlight: client.inFlight,
            readOnly: false,
          }
        : {
            state: client.state,
            error: client.error,
            inFlight: client.inFlight,
            readOnly: history.readOnly && opened,
          },
    );
  let announced = '';
  function render(): void {
    island.hidden =
      !openingFailed && !client.id && client.state === 'saved' && !client.error;
    const status = currentStatus();
    const label = `${t('cloudStatusLabel')}: ${t(status.titleKey)}`;
    indicator.innerHTML = cloudIconSvg(status.icon);
    indicator.dataset.state = status.kind;
    indicator.classList.toggle('cloud-status--spinning', status.spinning);
    indicator.setAttribute('aria-label', label);
    indicator.title = label;
    const announcement = cloudStatusNeedsAttention(status.kind)
      ? t(status.titleKey)
      : '';
    if (announcement !== announced) {
      announced = announcement;
      announcer.textContent = announcement;
    }
    if (popover) fillPopover(popover);
    if (island.hidden) closePopover();
  }
  function fillPopover(panel: HTMLElement): void {
    const status = currentStatus();
    panel.replaceChildren();
    const title = document.createElement('p');
    title.className = 'cloud-popover-title';
    title.textContent = t(status.titleKey);
    const detail = document.createElement('p');
    detail.className = 'cloud-popover-detail';
    detail.textContent = t(status.detailKey);
    panel.append(title, detail);
    if (client.lastSyncedAt !== null) {
      const meta = document.createElement('p');
      meta.className = 'cloud-popover-meta';
      meta.textContent = t('cloudLastSynced').replace(
        '{time}',
        new Date(client.lastSyncedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      panel.append(meta);
    }
    const actions = cloudPopoverActions(status.kind, {
      hasBoard: opened && !!client.id,
      editable: client.editable,
    });
    const list = document.createElement('div');
    list.className = 'cloud-popover-actions';
    if (actions.length) panel.append(list);
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cloud-popover-action';
      button.dataset.action = action;
      button.textContent = t(action);
      button.addEventListener('click', () => {
        closePopover();
        void popoverAction(action).catch(() => dialog(storageDialog()));
      });
      list.append(button);
    }
  }
  function openPopover(): void {
    // The read-only toast sits where the popover opens; the popover says the same.
    document.getElementById('cloud-toast')?.remove();
    const panel = document.createElement('div');
    panel.className = 'cloud-popover';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('cloudStatusLabel'));
    const rect = island.getBoundingClientRect();
    panel.style.top = `${Math.round(rect.bottom + 8)}px`;
    panel.style.right = `${Math.max(8, Math.round(innerWidth - rect.right))}px`;
    fillPopover(panel);
    document.body.append(panel);
    popover = panel;
    indicator.setAttribute('aria-expanded', 'true');
    panel.querySelector<HTMLButtonElement>('button')?.focus();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onPopoverKey, true);
  }
  function closePopover(): void {
    if (!popover) return;
    popover.remove();
    popover = null;
    indicator.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onPopoverKey, true);
  }
  function outside(event: Event): void {
    const target = event.target as Node | null;
    if (popover?.contains(target) || island.contains(target)) return;
    closePopover();
  }
  function onPopoverKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closePopover();
    indicator.focus();
  }
  async function popoverAction(action: CloudPopoverAction): Promise<void> {
    if (action === 'cloudResolve') return resolveConflict();
    if (action === 'cloudLicense') return license();
    if (action === 'cloudRetry') {
      if (openingFailed) return open();
      // Offline after a failed background check: nothing to save, so retry the check.
      if (client.state === 'offline' && !client.unsaved) return checkRemote();
      return client.retry();
    }
    return api.run(action);
  }
  const load = (scene: CloudScene, fresh = false): void => {
    loading = true;
    if (fresh || history.readOnly) {
      history.replaceScene(
        scene.elements,
        scene.viewport ??
          fitToElements(scene.elements, innerWidth, innerHeight, {
            maxZoom: 1,
          }),
      );
    } else {
      history.dispatch({
        type: 'LOAD_SCENE',
        elements: [...scene.elements],
        viewport: history.present.viewport,
      });
    }
    previousElements = history.present.elements;
    loading = false;
  };
  const updateUrl = (): void => {
    if (client.id)
      window.history.replaceState(
        null,
        '',
        boardLinks(location.origin, client.id, client.token).edit,
      );
  };
  /**
   * Asks for a licence key and checks it with the worker before storing it.
   * A rejected key is never stored: the user gets the reason and can retry.
   * When the check cannot be done (offline, licence service down) the key is
   * stored anyway and the next cloud write decides, as before the check.
   */
  async function license(): Promise<void> {
    if (resolving) return;
    resolving = true;
    let value: string | null = null;
    let status: 'valid' | 'invalid' | 'unknown' = 'unknown';
    try {
      for (;;) {
        value = await dialog({
          title: t('cloudLicense'),
          message: t('cloudLicenseNeeded'),
          choices: [{ key: 'cloudStoreKey', primary: true }],
          license: true,
        });
        if (!value?.trim()) return;
        status = await client.checkLicense(value);
        if (status !== 'invalid') break;
        await dialog({
          title: t('cloudLicense'),
          message: t('cloudKeyInvalid'),
        });
      }
    } finally {
      resolving = false;
    }
    try {
      client.setLicense(value);
    } catch {
      await dialog(storageDialog());
      return;
    }
    document.dispatchEvent(new Event('markasso-cloud-change'));
    if (status === 'valid') {
      launchConfetti();
      showShareToast(true, '', t('cloudKeyActive'));
    } else showShareToast(true, '', t('cloudKeyUnchecked'));
    try {
      if (retryCreate) {
        retryCreate = false;
        await save();
      } else if (client.editable && client.error === 402) await client.retry();
    } catch {
      await dialog(storageDialog());
    }
  }
  async function resolveConflict(): Promise<void> {
    if (resolving) return;
    resolving = true;
    const choice = await dialog({
      title: t('cloudConflictTitle'),
      message: t('cloudConflictDetail'),
      choices: [
        { key: 'cloudKeepMine', hint: 'cloudKeepMineHint' },
        { key: 'cloudTakeTheirs', hint: 'cloudTakeTheirsHint' },
        { key: 'cloudSaveCopy', hint: 'cloudSaveCopyHint' },
      ],
    });
    resolving = false;
    try {
      if (choice === 'cloudKeepMine') await client.keepMine();
      if (choice === 'cloudTakeTheirs') load(await client.takeTheirs());
      if (choice === 'cloudSaveCopy') {
        const snapshot = history.present;
        await client.saveCopy(snapshot, () => exportMarkasso(history.present));
        updateUrl();
        if (
          client.state === 'saved' &&
          history.present.elements !== snapshot.elements
        )
          client.schedule(history.present);
      }
    } catch (error) {
      await dialog(
        errorDialog(error instanceof CloudError ? error.status : 503),
      );
    }
    if (client.state === 'conflict' && choice) void resolveConflict();
  }
  async function save(): Promise<void> {
    if (client.id) {
      if (!client.editable) return;
      if (client.state === 'conflict') return resolveConflict();
      client.schedule(history.present);
      await client.retry();
      return;
    }
    if (
      getLiveSessionUrl() ||
      new URL(location.href).searchParams.has('live')
    ) {
      await dialog({
        title: t('cloudLeaveLiveTitle'),
        message: t('cloudLeaveLive'),
      });
      return;
    }
    if (creating) return;
    creating = true;
    const confirmed = await dialog({
      title: t('cloudSaveTitle'),
      message: t('cloudPublicDetail'),
      choices: [{ key: 'cloudSave', primary: true }],
    });
    if (confirmed !== 'cloudSave') {
      creating = false;
      document.dispatchEvent(new Event('markasso-cloud-change'));
      return;
    }
    retryCreate = true;
    const snapshot = history.present;
    try {
      await client.create(snapshot);
      opened = true;
      remoteChecks.start();
      retryCreate = false;
      updateUrl();
      if (history.present.elements !== snapshot.elements)
        client.schedule(history.present);
    } catch (error) {
      if (!(error instanceof CloudError && error.status === 402)) {
        retryCreate = false;
        await dialog(
          errorDialog(error instanceof CloudError ? error.status : 503),
        );
      }
    } finally {
      creating = false;
      document.dispatchEvent(new Event('markasso-cloud-change'));
    }
  }
  history.subscribe((scene) => {
    if (loading) return;
    if (scene.elements !== previousElements) {
      previousElements = scene.elements;
      client.schedule(scene);
    }
  });
  /**
   * Remote change check. Pointer presses are tracked with capture listeners on
   * window, so tools and the canvas need no hooks: a press that changes the
   * scene ends with pointerup or pointercancel. Text, label and stencil
   * editors are textareas that commit on blur, so an editor is open exactly
   * while a textarea has focus.
   */
  const pressed = new Set<number>();
  window.addEventListener(
    'pointerdown',
    (event: PointerEvent) => pressed.add(event.pointerId),
    true,
  );
  for (const type of ['pointerup', 'pointercancel'] as const)
    window.addEventListener(
      type,
      (event: PointerEvent) => pressed.delete(event.pointerId),
      true,
    );
  // A release outside the window may never reach the page.
  window.addEventListener('blur', () => pressed.clear());
  const interacting = (): boolean =>
    pressed.size > 0 || document.activeElement?.tagName === 'TEXTAREA';
  /** A newer remote board waiting for a drag or a text edit to end. */
  let remote: {
    scene: CloudScene;
    version: number;
    id: string;
    base: number;
    elements: typeof history.present.elements;
  } | null = null;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;
  async function checkRemote(): Promise<void> {
    if (!opened || remote || resolving || !client.id) return;
    const id = client.id;
    const base = client.version;
    const elements = history.present.elements;
    const result = await client.check();
    if (typeof result === 'string') return;
    remote = { ...result, id, base, elements };
    settleRemote();
  }
  /**
   * Applies, defers or turns into a conflict the pending remote board. A
   * local edit made after the check started (during the request or while
   * deferred) means the remote board must not replace it: the client enters
   * the conflict state like a 409 on save, which opens the conflict dialog.
   */
  function settleRemote(): void {
    clearTimeout(remoteTimer);
    if (!remote) return;
    const decision = remoteDecision({
      boardChanged:
        !opened ||
        client.id !== remote.id ||
        (client.state !== 'saved' &&
          client.state !== 'offline' &&
          client.state !== 'saving'),
      stale: client.version >= remote.version,
      interacting: interacting(),
      writing: client.writing,
      unsaved: client.unsaved,
      elementsChanged:
        history.present.elements !== remote.elements ||
        client.version !== remote.base,
    });
    if (decision === 'defer') {
      remoteTimer = setTimeout(settleRemote, 300);
      return;
    }
    const { scene, version } = remote;
    remote = null;
    if (decision === 'conflict') client.markConflict(version);
    if (decision !== 'apply') return;
    // Keep the viewer's viewport: a remote save must not move the view.
    load({ elements: scene.elements, viewport: history.present.viewport });
    client.version = version;
    render();
  }
  const remoteChecks = new RemoteCheckSchedule(() => void checkRemote(), {
    now: () => Date.now(),
    visible: () => document.visibilityState === 'visible',
    setInterval: (run, ms) => setInterval(run, ms),
    clearInterval: (handle) =>
      clearInterval(handle as ReturnType<typeof setInterval>),
  });
  /** Stops checks and forgets a deferred remote board, e.g. when the board is detached. */
  function stopRemoteChecks(): void {
    remoteChecks.stop();
    clearTimeout(remoteTimer);
    remote = null;
  }
  // visibilitychange bubbles from document to window.
  window.addEventListener('visibilitychange', () =>
    remoteChecks.visibilityChanged(),
  );
  window.addEventListener('pagehide', () => {
    void client.flush(true);
  });
  window.addEventListener('online', () => {
    if (client.state !== 'offline') return;
    if (client.unsaved) void client.retry();
    else void checkRemote();
  });
  indicator.addEventListener('click', () => {
    if (popover) closePopover();
    else openPopover();
  });
  async function open(): Promise<void> {
    history.readOnly = true;
    try {
      load(await client.open(new URL(location.href)), true);
      opened = true;
      remoteChecks.start();
      openingFailed = false;
      openError = 0;
      history.readOnly = !client.editable;
      render();
      if (history.readOnly) showCloudToast(t('cloudReadOnly'));
    } catch (error) {
      openingFailed = true;
      openError = error instanceof CloudError ? error.status : 503;
      stopRemoteChecks();
      client.detach();
      render();
      await dialog(errorDialog(openError));
    }
    document.dispatchEvent(new Event('markasso-cloud-change'));
  }
  /**
   * Turns the open cloud board into a local drawing: the scene stays on the
   * canvas, unlinked from the cloud, at the app's root URL.
   */
  function leaveBoard(): void {
    stopRemoteChecks();
    client.detach();
    opened = false;
    history.readOnly = false;
    load(history.present, true);
    window.history.replaceState(null, '', '/');
    render();
    document.dispatchEvent(new Event('markasso-cloud-change'));
  }
  /** Runs a Boards panel action; see BoardsPanelSource.act. */
  async function boardAction(
    action: BoardAction,
    item: { id: string; name: string },
  ): Promise<'close' | 'refresh' | 'none'> {
    const token = client.knownTokens()[item.id];
    const links = boardLinks(location.origin, item.id, token);
    const label = item.name || t('boardsUntitled');
    switch (action) {
      case 'open': {
        if (opened && client.id === item.id) return 'close';
        const url = token ? links.edit : links.read;
        // A local drawing that is not on the cloud would be replaced: keep it
        // and open the board in a new tab instead.
        if (opened || history.present.elements.length === 0) {
          location.assign(url);
          return 'close';
        }
        window.open(url, '_blank', 'noopener');
        return 'none';
      }
      case 'copyRead':
      case 'copyEdit': {
        const url = action === 'copyRead' ? links.read : links.edit;
        showShareToast(await copyToClipboard(url), url);
        return 'none';
      }
      case 'rename': {
        const name = await appDialog({
          kicker: t('cloudPageTitle'),
          title: t('boardsRename'),
          message: t('boardsRenameDetail'),
          field: { label: t('boardsName'), value: item.name },
          choices: [{ key: 'boardsRename', primary: true }],
        });
        if (name === null) return 'none';
        renameBoard(localStorage, item.id, name);
        return 'refresh';
      }
      case 'remove': {
        const choice = await dialog({
          title: t('boardsRemoveTitle').replace('{{name}}', label),
          message: t('boardsRemoveDetail'),
          choices: [{ key: 'boardsRemove', primary: true }],
        });
        if (choice !== 'boardsRemove') return 'none';
        client.forget(item.id);
        void deleteThumb(item.id).catch(() => {});
        if (opened && client.id === item.id) leaveBoard();
        return 'refresh';
      }
      case 'delete': {
        const choice = await dialog({
          title: t('boardsDeleteTitle').replace('{{name}}', label),
          message: t('boardsDeleteDetail'),
          choices: [{ key: 'boardsDelete', primary: true, danger: true }],
        });
        if (choice !== 'boardsDelete') return 'none';
        try {
          await client.deleteBoard(item.id);
        } catch (error) {
          await dialog(
            errorDialog(error instanceof CloudError ? error.status : 503),
          );
          return 'none';
        }
        void deleteThumb(item.id).catch(() => {});
        if (opened && thumbId === item.id) thumbId = null;
        if (opened && client.id === item.id) leaveBoard();
        return 'refresh';
      }
    }
  }
  const api = {
    open,
    hasLicense: () => !!client.license,
    available(action: (typeof CLOUD_ACTIONS)[number]): boolean {
      if (action === 'cloudLicense' || action === 'cloudSubscription')
        return true;
      // The panel lists boards this browser already knows: offered to
      // subscribers, i.e. once a licence is stored.
      if (action === 'cloudBoards') return !!client.license;
      if (creating) return false;
      // Creating or updating a cloud board needs a licence: without one the
      // action is hidden and the menu points to the licence and pricing.
      if (action === 'cloudSave') return !history.readOnly && !!client.license;
      if (!opened || !client.id) return false;
      // The markasso:// hand-off only works where the Mac app can be
      // installed: on phones, tablets and other desktops it would do nothing.
      if (action === 'cloudMac') return isMacDesktop(navigator);
      return action !== 'cloudEditLink' || client.editable;
    },
    async run(action: (typeof CLOUD_ACTIONS)[number]): Promise<void> {
      if (!this.available(action)) return;
      if (action === 'cloudSave') return save();
      if (action === 'cloudSubscription') {
        window.open(cloudPageUrl(), '_blank', 'noopener');
        return;
      }
      if (action === 'cloudLicense') {
        if (client.license) {
          if (
            (await dialog({
              title: t('cloudLicense'),
              message: t('cloudKeyStored'),
              choices: [{ key: 'cloudRemoveKey' }],
            })) === 'cloudRemoveKey'
          ) {
            client.setLicense('');
            document.dispatchEvent(new Event('markasso-cloud-change'));
          }
        } else await license();
        return;
      }
      if (action === 'cloudDuplicate') {
        leaveBoard();
        return;
      }
      if (action === 'cloudBoards') {
        openBoardsPanel({
          items: () =>
            listBoards(readBoardIndex(localStorage), client.knownTokens()),
          currentId: () => (opened ? client.id : null),
          thumb: loadThumb,
          act: boardAction,
        });
        return;
      }
      if (!client.id) return;
      const links = boardLinks(location.origin, client.id, client.token);
      if (action === 'cloudMac') {
        location.href = links.mac;
        return;
      }
      if (action === 'cloudEditLink' && !client.editable) return;
      const url = action === 'cloudReadLink' ? links.read : links.edit;
      showShareToast(await copyToClipboard(url), url);
    },
  };
  return api;
}
export async function initCloudBoards(history: History): Promise<void> {
  if (!CLOUD_ENABLED) return;
  const controller = createController(history);
  controllers.set(history, controller);
  if (parseBoardUrl(new URL(location.href))) await controller.open();
}
