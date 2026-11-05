import { t } from '../i18n';

/**
 * Markasso's own modal dialogs, replacing the browser's `alert`, `confirm`
 * and `prompt`: same card style as the What's New notice, translated, themed
 * and keyboard friendly (Escape cancels, focus returns to the opener).
 */

/** One button of a dialog; `hint` turns it into a described option card. */
export interface DialogChoice {
  /** i18n key of the label, also the value the dialog resolves with. */
  key: string;
  /** i18n key of the description shown under the label (option card). */
  hint?: string;
  primary?: boolean;
  /** Destructive action: drawn in the alert colour, focus starts on Cancel. */
  danger?: boolean;
}

/** A text field under the message. */
export interface DialogField {
  /** Accessible name, also the placeholder. */
  label: string;
  value?: string;
  type?: 'text' | 'password';
  /**
   * Shows a value to copy (e.g. a link): selected on focus, and the dialog
   * resolves with the chosen key instead of the field's text.
   */
  readOnly?: boolean;
}

export interface DialogOptions {
  /** Small heading above the title (e.g. "Markasso Cloud"). */
  kicker?: string;
  title: string;
  message: string;
  /** Without choices the dialog is a notice with a single OK. */
  choices?: DialogChoice[];
  field?: DialogField;
  /** A link under the field, opened in a new tab. */
  link?: { href: string; label: string };
}

let nextId = 0;

/**
 * Opens a modal and resolves with the chosen key, the typed text (when an
 * editable field is shown), or null on Cancel / Escape.
 */
export function dialog(options: DialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const id = `app-dialog-${nextId++}`;
    const modal = document.createElement('dialog');
    modal.className = 'app-dialog';
    const card = document.createElement('div');
    card.className = 'cd-card';
    if (options.kicker) {
      const kicker = document.createElement('div');
      kicker.className = 'cd-kicker';
      kicker.textContent = options.kicker;
      card.append(kicker);
    }
    const title = document.createElement('h2');
    title.className = 'cd-title';
    title.id = `${id}-title`;
    title.textContent = options.title;
    const message = document.createElement('p');
    message.className = 'cd-desc';
    message.id = `${id}-message`;
    message.textContent = options.message;
    modal.setAttribute('aria-labelledby', title.id);
    modal.setAttribute('aria-describedby', message.id);
    card.append(title, message);
    modal.append(card);

    const choices = options.choices ?? [];
    const danger = choices.some((choice) => choice.danger);
    let input: HTMLInputElement | undefined;
    if (options.field) {
      const field = options.field;
      input = document.createElement('input');
      input.className = 'cd-input';
      input.type = field.type ?? 'text';
      input.autocomplete = 'off';
      input.placeholder = field.label;
      input.setAttribute('aria-label', field.label);
      if (field.value !== undefined) input.value = field.value;
      if (field.readOnly) {
        input.readOnly = true;
        const target = input;
        input.addEventListener('focus', () => target.select());
      }
      input.autofocus = true;
      card.append(input);
    }
    if (options.link) {
      const link = document.createElement('a');
      link.className = 'cd-link';
      link.href = options.link.href;
      link.rel = 'noreferrer';
      link.target = '_blank';
      link.textContent = options.link.label;
      card.append(link);
    }
    const editable = !!input && !options.field?.readOnly;

    const finish = (value: string | null): void => {
      modal.close();
      modal.remove();
      if (previous instanceof HTMLElement) previous.focus();
      resolve(value);
    };

    const described = choices.filter((choice) => choice.hint);
    if (described.length) {
      const list = document.createElement('div');
      list.className = 'cd-options';
      described.forEach((choice, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cd-option';
        button.dataset.choice = choice.key;
        if (index === 0 && !input) button.autofocus = true;
        const name = document.createElement('span');
        name.className = 'cd-option-title';
        name.textContent = t(choice.key);
        const hint = document.createElement('span');
        hint.className = 'cd-option-hint';
        hint.textContent = t(choice.hint as string);
        button.append(name, hint);
        button.addEventListener('click', () => finish(choice.key));
        list.append(button);
      });
      card.append(list);
    }

    const actions = document.createElement('div');
    actions.className = 'cd-actions';
    const plain = choices.filter((choice) => !choice.hint);
    if (!choices.length) plain.push({ key: 'dialogOk', primary: true });
    else {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'cd-cancel';
      cancel.dataset.choice = 'dialogCancel';
      cancel.textContent = t('dialogCancel');
      // A destructive dialog must not confirm on a reflexive Enter.
      if (danger) cancel.autofocus = true;
      cancel.addEventListener('click', () => finish(null));
      actions.append(cancel);
    }
    for (const choice of plain) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = choice.primary ? 'cd-cta' : 'cd-secondary';
      if (choice.danger) button.className += ' cd-danger';
      button.dataset.choice = choice.key;
      if (choice.primary && !danger && !input && !described.length)
        button.autofocus = true;
      button.textContent = t(choice.key);
      button.addEventListener('click', () =>
        finish(
          editable && input ? input.value : choices.length ? choice.key : null,
        ),
      );
      actions.append(button);
    }
    card.append(actions);
    modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    document.body.append(modal);
    modal.showModal();
  });
}

/** A notice with a single OK, in place of `alert`. */
export async function notice(title: string, message: string): Promise<void> {
  await dialog({ title, message });
}

/**
 * A yes/no question in place of `confirm`: resolves true only when the
 * confirming button (`confirmKey`) is chosen.
 */
export async function confirmDialog(options: {
  title: string;
  message: string;
  confirmKey: string;
  danger?: boolean;
}): Promise<boolean> {
  const choice = await dialog({
    title: options.title,
    message: options.message,
    choices: [
      { key: options.confirmKey, primary: true, danger: !!options.danger },
    ],
  });
  return choice === options.confirmKey;
}
