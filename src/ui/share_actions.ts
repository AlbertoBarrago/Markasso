import { t } from '../i18n';

/** Copy text to clipboard reliably: modern API first, textarea fallback second. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && document.hasFocus()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback below
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Show a small toast with the share/live outcome (success message or copyable fallback). */
export function showShareToast(
  success: boolean,
  url: string,
  okMsg?: string,
): void {
  const existing = document.getElementById('share-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'share-toast';
  if (success) {
    toast.className = 'share-toast share-toast--ok';
    toast.textContent = okMsg ?? t('shareLinkCopied');
  } else {
    toast.className = 'share-toast share-toast--fallback';
    toast.innerHTML = `<span>${t('shareLink')}</span><input class="share-toast-input" readonly value="${url.replace(/"/g, '&quot;')}" />`;
    requestAnimationFrame(() => {
      const inp = toast.querySelector<HTMLInputElement>('.share-toast-input');
      inp?.select();
    });
  }
  document.body.appendChild(toast);
  if (success) setTimeout(() => toast.remove(), 3000);
  toast.addEventListener('click', (e) => {
    if (e.target === toast) toast.remove();
  });
}
