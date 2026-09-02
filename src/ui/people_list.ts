import { onLivePeers, type PeerInfo, setLiveName } from '../io/realtime';

/**
 * Renders the live-session participant list: an editable "you" row followed by
 * the other connected peers. Called with presence updates via `onLivePeers`.
 */
export function initPeopleList(container: HTMLElement): () => void {
  let editing = false;

  function buildRow(name: string, color: string, isSelf: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'pp-row';
    const dot = document.createElement('span');
    dot.className = 'pp-dot';
    dot.style.background = color;
    const label = document.createElement('span');
    label.className = 'pp-name';
    label.textContent = name;
    if (isSelf) {
      const you = document.createElement('span');
      you.className = 'pp-you';
      you.textContent = ' (you)';
      label.appendChild(you);
      row.classList.add('pp-self');
    }
    row.append(dot, label);
    return row;
  }

  function render(others: PeerInfo[], self: PeerInfo): void {
    container.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'pp-title';
    title.textContent =
      others.length === 0
        ? 'People — only you here'
        : `People — ${others.length} connected`;
    container.appendChild(title);

    const selfRow = buildRow(self.name, self.color, true);
    selfRow.addEventListener('click', () => {
      if (editing) return;
      editing = true;
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 24;
      input.className = 'pp-input';
      input.value = self.name;
      selfRow.replaceWith(input);
      input.focus();
      input.select();
      let cancelled = false;
      const finish = (): void => {
        if (!editing) return;
        editing = false;
        const val = input.value.trim();
        if (!cancelled && val) {
          // `setLiveName` re-runs `render` via the presence subscription.
          setLiveName(val);
        } else {
          render(others, self);
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        else if (e.key === 'Escape') {
          cancelled = true;
          input.blur();
        }
      });
      input.addEventListener('blur', finish);
    });
    container.appendChild(selfRow);

    for (const peer of others) {
      container.appendChild(buildRow(peer.name, peer.color, false));
    }
  }

  return onLivePeers((others, self) => {
    render(others, self);
  });
}
