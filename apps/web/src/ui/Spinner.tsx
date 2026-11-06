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
