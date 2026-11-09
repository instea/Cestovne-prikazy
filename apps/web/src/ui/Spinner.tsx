import { useTranslation } from 'react-i18next';

/** In-page loading indicator (lists, forms). */
export function Spinner() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex justify-center py-8">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

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
