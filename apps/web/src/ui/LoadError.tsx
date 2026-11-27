import { useTranslation } from 'react-i18next';

/** Red load-error alert with a Retry button (LST-01, SUM-01). */
export function LoadError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded bg-red-100 p-3 text-red-700"
    >
      <span>{message}</span>
      <button
        type="button"
        className="rounded border border-red-700 px-3 py-1 disabled:opacity-50"
        disabled={retrying}
        onClick={onRetry}
      >
        {t('app.retry')}
      </button>
    </div>
  );
}
