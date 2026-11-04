import { CLOUD_ENABLED } from '../config/features';
import { fitToElements } from '../core/viewport';
import type { History } from '../engine/history';
import { t } from '../i18n';
import {
  boardLinks,
  CloudClient,
  CloudError,
  type CloudScene,
  LICENSE_PURCHASE_URL,
  parseBoardUrl,
} from '../io/cloud';
import { exportMarkasso } from '../io/markasso';
import { getLiveSessionUrl } from '../io/realtime';
import {
  type CloudPopoverAction,
  cloudIconSvg,
  cloudPopoverActions,
  cloudStatus,
  cloudStatusNeedsAttention,
} from './cloud_status';
import { copyToClipboard, showShareToast } from './share_actions';

const ALL_CLOUD_ACTIONS = [
  'cloudSave',
  'cloudReadLink',
  'cloudEditLink',
  'cloudMac',
  'cloudDuplicate',
  'cloudLicense',
] as const;
export const CLOUD_ACTIONS = CLOUD_ENABLED ? ALL_CLOUD_ACTIONS : [];
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
    .catch(() => dialog(t('cloudStorageError'), []));
}

function dialog(
  message: string,
  choices: string[],
  license = false,
): Promise<string | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const modal = document.createElement('dialog');
    modal.className = 'cloud-dialog';
    const heading = document.createElement('p');
    heading.textContent = message;
    heading.id = 'cloud-dialog-message';
    modal.setAttribute('aria-labelledby', heading.id);
    modal.append(heading);
    let input: HTMLInputElement | undefined;
    if (license) {
      input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.placeholder = t('cloudKey');
      input.setAttribute('aria-label', t('cloudKey'));
      modal.append(input);
      const purchase = document.createElement('a');
      purchase.href = LICENSE_PURCHASE_URL;
      purchase.rel = 'noreferrer';
      purchase.target = '_blank';
      purchase.textContent = t('cloudBuy');
      modal.append(purchase);
    }
    const finish = (value: string | null): void => {
      modal.close();
      modal.remove();
      if (previous instanceof HTMLElement) previous.focus();
      resolve(value);
    };
    for (const key of choices) {
      const button = document.createElement('button');
      button.textContent = t(key);
      button.addEventListener('click', () => finish(input ? input.value : key));
      modal.append(button);
    }
    const cancel = document.createElement('button');
    cancel.textContent = t('cloudCancel');
    cancel.addEventListener('click', () => finish(null));
    modal.append(cancel);
    modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    document.body.append(modal);
    modal.showModal();
  });
}
function errorKey(status: number): string {
  return (
    (
      {
        0: 'cloudOffline',
        401: 'cloudUnauthorized',
        402: 'cloudLicenseNeeded',
        404: 'cloudMissing',
        413: 'cloudTooLarge',
        429: 'cloudSlow',
        503: 'cloudUnavailable',
      } as Record<number, string>
    )[status] ?? 'cloudUnavailable'
  );
}
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
    if (client.state === 'conflict') void resolveConflict();
    if (client.error === 402) void license();
  });
  client.onActivity = () => render();
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
        void popoverAction(action).catch(() =>
          dialog(t('cloudStorageError'), []),
        );
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
    if (action === 'cloudRetry') return openingFailed ? open() : client.retry();
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
  async function license(): Promise<void> {
    if (resolving) return;
    resolving = true;
    const value = await dialog(
      t('cloudLicenseNeeded'),
      ['cloudStoreKey'],
      true,
    );
    resolving = false;
    if (value?.trim()) {
      try {
        client.setLicense(value);
        if (retryCreate) {
          retryCreate = false;
          await save();
        } else if (client.editable && client.error === 402)
          await client.retry();
      } catch {
        await dialog(t('cloudStorageError'), []);
      }
    }
  }
  async function resolveConflict(): Promise<void> {
    if (resolving) return;
    resolving = true;
    const choice = await dialog(t('cloudConflictMessage'), [
      'cloudKeepMine',
      'cloudTakeTheirs',
      'cloudSaveCopy',
    ]);
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
        t(errorKey(error instanceof CloudError ? error.status : 503)),
        [],
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
      await dialog(t('cloudLeaveLive'), []);
      return;
    }
    if (creating) return;
    creating = true;
    if ((await dialog(t('cloudPublicNotice'), ['cloudSave'])) !== 'cloudSave') {
      creating = false;
      document.dispatchEvent(new Event('markasso-cloud-change'));
      return;
    }
    retryCreate = true;
    const snapshot = history.present;
    try {
      await client.create(snapshot);
      opened = true;
      retryCreate = false;
      updateUrl();
      if (history.present.elements !== snapshot.elements)
        client.schedule(history.present);
    } catch (error) {
      if (!(error instanceof CloudError && error.status === 402)) {
        retryCreate = false;
        await dialog(
          t(errorKey(error instanceof CloudError ? error.status : 503)),
          [],
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
  window.addEventListener('pagehide', () => {
    void client.flush(true);
  });
  window.addEventListener('online', () => {
    if (client.editable && client.state === 'offline') void client.retry();
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
      openingFailed = false;
      openError = 0;
      history.readOnly = !client.editable;
      render();
      if (history.readOnly) showCloudToast(t('cloudReadOnly'));
    } catch (error) {
      openingFailed = true;
      openError = error instanceof CloudError ? error.status : 503;
      client.detach();
      render();
      await dialog(t(errorKey(openError)), []);
    }
    document.dispatchEvent(new Event('markasso-cloud-change'));
  }
  const api = {
    open,
    hasLicense: () => !!client.license,
    available(action: (typeof CLOUD_ACTIONS)[number]): boolean {
      if (action === 'cloudLicense') return true;
      if (creating) return false;
      if (action === 'cloudSave') return !history.readOnly;
      if (!opened || !client.id) return false;
      return action !== 'cloudEditLink' || client.editable;
    },
    async run(action: (typeof CLOUD_ACTIONS)[number]): Promise<void> {
      if (!this.available(action)) return;
      if (action === 'cloudSave') return save();
      if (action === 'cloudLicense') {
        if (client.license) {
          if (
            (await dialog(t('cloudKeyStored'), ['cloudRemoveKey'])) ===
            'cloudRemoveKey'
          )
            client.setLicense('');
        } else await license();
        return;
      }
      if (action === 'cloudDuplicate') {
        client.detach();
        opened = false;
        history.readOnly = false;
        load(history.present, true);
        window.history.replaceState(null, '', '/');
        render();
        document.dispatchEvent(new Event('markasso-cloud-change'));
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
