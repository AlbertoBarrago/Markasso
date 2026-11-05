import { t } from '../i18n';
import { notice } from './dialog';

/**
 * Reports a failed import (.markasso file, Mermaid source) in an app dialog.
 * The io modules stay free of UI code: they take this as their `onError`.
 * `detail` is the parser's own message, shown under the translated one.
 */
export function showImportError(messageKey: string, detail?: string): void {
  const message = t(messageKey);
  void notice(
    t('importFailedTitle'),
    detail ? `${message}\n\n${detail}` : message,
  );
}
