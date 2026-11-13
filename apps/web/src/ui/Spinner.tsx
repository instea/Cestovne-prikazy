import { useTranslation } from 'react-i18next';

export function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex min-h-screen items-center justify-center"
    >
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

/**
 * In-page loading indicator (lists, forms, pages). With `label` the text is
 * visible (e.g. "Loading leaves…"); without it a screen-reader-only
 * "Loading…" is rendered.
 */
export function Spinner({ label }: { label?: string } = {}) {
  const { t } = useTranslation();
  if (label === undefined) {
    return (
      <div role="status" className="flex justify-center py-8">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-center gap-3 py-4">
      <span className="h-6 w-6 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
      <span>{label}</span>
    </div>
  );
}
