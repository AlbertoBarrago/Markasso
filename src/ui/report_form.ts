import { t } from '../i18n';

type ReportCategory = 'bug' | 'visual' | 'performance' | 'other';

type SubmitResult =
  | { readonly ok: true; readonly issueUrl: string }
  | { readonly ok: false; readonly status: number };

async function submitReport(payload: {
  title: string;
  description: string;
  category: ReportCategory;
  steps: string;
}): Promise<SubmitResult> {
  const response = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, userAgent: navigator.userAgent }),
  });
  if (!response.ok) return { ok: false, status: response.status };
  const body = (await response.json()) as { url: string };
  return { ok: true, issueUrl: body.url };
}

export interface ReportFormHandle {
  open(): void;
}

export function initReportForm(appEl: HTMLElement): ReportFormHandle {
  let modalEl: HTMLElement | null = null;

  function open(): void {
    if (modalEl) return;

    modalEl = document.createElement('div');
    modalEl.id = 'report-modal';
    modalEl.innerHTML = `
      <div class="report-card" role="dialog" aria-modal="true" aria-label="${t('reportProblem')}">
        <button class="report-close" aria-label="Close">&times;</button>
        <h2 class="report-title">${t('reportProblem')}</h2>
        <p class="report-desc">${t('reportDesc')}</p>
        <form class="report-form" novalidate>
          <label class="report-label" for="report-title">${t('reportTitleLabel')}</label>
          <input class="report-input" id="report-title" name="title" type="text" maxlength="120" required />

          <label class="report-label" for="report-category">${t('reportCategoryLabel')}</label>
          <select class="report-input" id="report-category" name="category">
            <option value="bug">${t('reportCategoryBug')}</option>
            <option value="visual">${t('reportCategoryVisual')}</option>
            <option value="performance">${t('reportCategoryPerformance')}</option>
            <option value="other">${t('reportCategoryOther')}</option>
          </select>

          <label class="report-label" for="report-description">${t('reportDescriptionLabel')}</label>
          <textarea class="report-input report-textarea" id="report-description" name="description" maxlength="4000" required></textarea>

          <label class="report-label" for="report-steps">${t('reportStepsLabel')}</label>
          <textarea class="report-input report-textarea" id="report-steps" name="steps" maxlength="2000"></textarea>

          <p class="report-error" hidden></p>

          <div class="report-actions">
            <button type="button" class="report-btn report-btn--ghost" id="report-cancel">${t('reportCancel')}</button>
            <button type="submit" class="report-btn report-btn--primary" id="report-submit">${t('reportSubmit')}</button>
          </div>
        </form>
        <div class="report-success" hidden>
          <p class="report-success-title">${t('reportSuccessTitle')}</p>
          <p class="report-success-desc">${t('reportSuccessDesc')}</p>
          <a class="report-success-link" href="" target="_blank" rel="noopener noreferrer"></a>
          <div class="report-actions">
            <button type="button" class="report-btn report-btn--primary" id="report-done">${t('reportClose')}</button>
          </div>
        </div>
      </div>
    `;

    const close = (): void => {
      if (!modalEl) return;
      const el = modalEl;
      el.classList.add('report-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
      modalEl = null;
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    modalEl
      .querySelector<HTMLButtonElement>('.report-close')!
      .addEventListener('click', close);
    modalEl
      .querySelector<HTMLButtonElement>('#report-cancel')!
      .addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });
    document.addEventListener('keydown', onKey);

    const form = modalEl.querySelector<HTMLFormElement>('.report-form')!;
    const submitBtn =
      modalEl.querySelector<HTMLButtonElement>('#report-submit')!;
    const errorEl =
      modalEl.querySelector<HTMLParagraphElement>('.report-error')!;
    const successEl = modalEl.querySelector<HTMLDivElement>('.report-success')!;
    const successLink = modalEl.querySelector<HTMLAnchorElement>(
      '.report-success-link',
    )!;

    modalEl
      .querySelector<HTMLButtonElement>('#report-done')!
      .addEventListener('click', close);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const data = new FormData(form);
      const title = String(data.get('title') ?? '').trim();
      const description = String(data.get('description') ?? '').trim();
      const category = String(data.get('category') ?? 'bug') as ReportCategory;
      const steps = String(data.get('steps') ?? '').trim();

      if (title.length < 5 || description.length < 20) {
        errorEl.textContent = t('reportValidationError');
        errorEl.hidden = false;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = t('reportSubmitting');

      submitReport({ title, description, category, steps })
        .then((result) => {
          if (!result.ok) throw new Error(`status ${result.status}`);
          successLink.href = result.issueUrl;
          successLink.textContent = result.issueUrl;
          form.hidden = true;
          successEl.hidden = false;
        })
        .catch(() => {
          errorEl.textContent = t('reportSubmitError');
          errorEl.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = t('reportSubmit');
        });
    });

    appEl.appendChild(modalEl);
    requestAnimationFrame(() => {
      modalEl?.querySelector<HTMLInputElement>('#report-title')?.focus();
    });
  }

  return { open };
}
