import { getLocale, t } from '../i18n';
import {
  type BoardListItem,
  type BoardSectionKey,
  groupBoards,
  searchBoards,
} from '../io/cloud_index';

/**
 * The Boards panel (issue #100): the cloud boards this browser knows, by day,
 * with search, modeled on the Mac app's Boards panel. It only renders and
 * reports intents; the cloud controller (cloud_boards.ts) owns tokens,
 * requests and navigation.
 */

export type BoardAction =
  | 'open'
  | 'copyRead'
  | 'copyEdit'
  | 'rename'
  | 'remove'
  | 'delete';

export interface BoardsPanelSource {
  /** Current list, most recent first; read again after every action. */
  items(): BoardListItem[];
  /** Id of the board open in this tab, if any. */
  currentId(): string | null;
  /** Stored thumbnail, or null (the row then shows a placeholder). */
  thumb(id: string): Promise<Blob | null>;
  /**
   * Runs an action. Resolves `close` when the panel should close (e.g. the
   * board opens in this tab), `refresh` when the list changed.
   */
  act(
    action: BoardAction,
    item: BoardListItem,
  ): Promise<'close' | 'refresh' | 'none'>;
}

const icon = (body: string) =>
  `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  copyRead: icon(
    '<path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/>',
  ),
  copyEdit: icon(
    '<path d="M13.5 3.5l3 3L7 16H4v-3z"/><path d="M11.5 5.5l3 3"/>',
  ),
  rename: icon('<path d="M4 6h12M4 10h8M4 14h5"/>'),
  remove: icon('<path d="M5 10h10"/><circle cx="10" cy="10" r="7.5"/>'),
  delete: icon('<path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/>'),
};

function sectionTitle(key: BoardSectionKey, locale: string): string {
  switch (key.kind) {
    case 'today':
      return t('boardsToday');
    case 'yesterday':
      return t('boardsYesterday');
    case 'weekday':
      return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
        key.date,
      );
    case 'month':
      return new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(key.date);
    case 'older':
      return t('boardsEarlier');
  }
}

/** Time for today and yesterday, date otherwise; empty for never used here. */
function itemMeta(
  item: BoardListItem,
  key: BoardSectionKey,
  locale: string,
): string {
  if (!item.usedAt) return '';
  const date = new Date(item.usedAt);
  return key.kind === 'today' || key.kind === 'yesterday'
    ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
      }).format(date);
}

let open: HTMLDialogElement | null = null;

/** Opens the panel (a second call while it is open just focuses it). */
export function openBoardsPanel(source: BoardsPanelSource): void {
  if (open) {
    open.querySelector<HTMLInputElement>('.bp-search')?.focus();
    return;
  }
  const locale = getLocale();
  const previous = document.activeElement;
  const urls: string[] = [];
  const modal = document.createElement('dialog');
  modal.className = 'app-dialog bp-dialog';
  modal.setAttribute('aria-labelledby', 'bp-title');
  const card = document.createElement('div');
  card.className = 'cd-card bp-card';
  card.innerHTML = `
    <div class="bp-head">
      <div>
        <div class="cd-kicker">${t('cloudPageTitle')}</div>
        <h2 class="cd-title" id="bp-title"></h2>
        <p class="cd-desc bp-intro"></p>
      </div>
      <button type="button" class="bp-close"></button>
    </div>
    <input class="cd-input bp-search" type="search" autocomplete="off">
    <div class="bp-list" role="list"></div>
  `;
  card.querySelector('#bp-title')!.textContent = t('boardsTitle');
  card.querySelector('.bp-intro')!.textContent = t('boardsIntro');
  const close = card.querySelector<HTMLButtonElement>('.bp-close')!;
  close.textContent = '×';
  close.setAttribute('aria-label', t('close'));
  const search = card.querySelector<HTMLInputElement>('.bp-search')!;
  search.placeholder = t('boardsSearch');
  search.setAttribute('aria-label', t('boardsSearch'));
  const list = card.querySelector<HTMLDivElement>('.bp-list')!;
  modal.append(card);

  const finish = (): void => {
    for (const url of urls) URL.revokeObjectURL(url);
    modal.close();
    modal.remove();
    open = null;
    if (previous instanceof HTMLElement) previous.focus();
  };

  const run = async (
    action: BoardAction,
    item: BoardListItem,
  ): Promise<void> => {
    const outcome = await source.act(action, item);
    if (outcome === 'close') finish();
    else if (outcome === 'refresh') render();
  };

  const actionButton = (
    action: Exclude<BoardAction, 'open'>,
    item: BoardListItem,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `bp-action${action === 'delete' ? ' bp-action--danger' : ''}`;
    const label = t(
      {
        copyRead: 'cloudReadLink',
        copyEdit: 'cloudEditLink',
        rename: 'boardsRename',
        remove: 'boardsRemove',
        delete: 'boardsDelete',
      }[action],
    );
    button.title = label;
    button.setAttribute(
      'aria-label',
      `${label}: ${item.name || t('boardsUntitled')}`,
    );
    button.innerHTML = ICONS[action];
    button.addEventListener('click', () => void run(action, item));
    return button;
  };

  function render(): void {
    const items = searchBoards(source.items(), search.value);
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'bp-empty';
      empty.textContent = search.value.trim()
        ? t('boardsNoMatch')
        : t('boardsEmpty');
      list.append(empty);
      return;
    }
    const current = source.currentId();
    for (const section of groupBoards(items)) {
      const heading = document.createElement('h3');
      heading.className = 'bp-section';
      heading.textContent = sectionTitle(section.key, locale);
      list.append(heading);
      for (const item of section.items) {
        const row = document.createElement('div');
        row.className = 'bp-row';
        row.setAttribute('role', 'listitem');
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'bp-open';
        const thumb = document.createElement('span');
        thumb.className = 'bp-thumb';
        const text = document.createElement('span');
        text.className = 'bp-text';
        const name = document.createElement('span');
        name.className = 'bp-name';
        name.textContent = item.name || t('boardsUntitled');
        const meta = document.createElement('span');
        meta.className = 'bp-meta';
        meta.textContent = [
          itemMeta(item, section.key, locale),
          item.id === current ? t('boardsOpenNow') : '',
          item.editable ? '' : t('boardsReadOnly'),
        ]
          .filter(Boolean)
          .join(' · ');
        text.append(name, meta);
        main.append(thumb, text);
        main.addEventListener('click', () => void run('open', item));
        const actions = document.createElement('span');
        actions.className = 'bp-actions';
        actions.append(actionButton('copyRead', item));
        if (item.editable) actions.append(actionButton('copyEdit', item));
        actions.append(
          actionButton('rename', item),
          actionButton('remove', item),
        );
        if (item.editable) actions.append(actionButton('delete', item));
        row.append(main, actions);
        list.append(row);
        void source
          .thumb(item.id)
          .then((blob) => {
            if (!blob || !modal.isConnected) return;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            const img = document.createElement('img');
            img.alt = '';
            img.src = url;
            thumb.append(img);
          })
          .catch(() => {
            /* No thumbnail store (private mode): the placeholder stays. */
          });
      }
    }
  }

  search.addEventListener('input', render);
  close.addEventListener('click', finish);
  modal.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) finish();
  });
  render();
  document.body.append(modal);
  open = modal;
  modal.showModal();
  search.focus();
}
