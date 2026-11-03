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
import { copyToClipboard, showShareToast } from './share_actions';

export const CLOUD_ACTIONS = [
  'cloudSave',
  'cloudReadLink',
  'cloudEditLink',
  'cloudMac',
  'cloudDuplicate',
  'cloudLicense',
] as const;
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
function createController(history: History) {
  const indicator = document.createElement('button');
  indicator.className = 'cloud-status';
  indicator.hidden = true;
  indicator.setAttribute('aria-live', 'polite');
  document.body.append(indicator);
  let resolving = false;
  let loading = false;
  let previousElements = history.present.elements;
  let retryCreate = false;
  let creating = false;
  let opened = false;
  let openingFailed = false;
  const client = new CloudClient(localStorage, fetch, () => {
    document.dispatchEvent(new Event('markasso-cloud-change'));
    indicator.hidden = !client.id && client.state === 'saved';
    indicator.textContent =
      client.error && client.state !== 'conflict'
        ? t(errorKey(client.error))
        : t(`cloud${client.state[0]!.toUpperCase()}${client.state.slice(1)}`);
    if (client.state === 'conflict') void resolveConflict();
    if (client.error === 402) void license();
  });
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
    if (openingFailed) {
      void open();
      return;
    }
    if (history.readOnly && opened) {
      cloudAction(history, 'cloudDuplicate');
      return;
    }
    if (!client.id) {
      void save();
      return;
    }
    if (client.state === 'conflict') void resolveConflict();
    else if (client.error === 402) void license();
    else void client.retry();
  });
  async function open(): Promise<void> {
    history.readOnly = true;
    try {
      load(await client.open(new URL(location.href)), true);
      opened = true;
      openingFailed = false;
      history.readOnly = !client.editable;
      indicator.hidden = false;
      if (history.readOnly) indicator.textContent = t('cloudReadOnly');
    } catch (error) {
      openingFailed = true;
      client.detach();
      indicator.hidden = false;
      indicator.textContent = t(
        errorKey(error instanceof CloudError ? error.status : 503),
      );
      await dialog(indicator.textContent, []);
    }
    document.dispatchEvent(new Event('markasso-cloud-change'));
  }
  return {
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
        indicator.hidden = true;
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
}
export async function initCloudBoards(history: History): Promise<void> {
  const controller = createController(history);
  controllers.set(history, controller);
  if (parseBoardUrl(new URL(location.href))) await controller.open();
}
