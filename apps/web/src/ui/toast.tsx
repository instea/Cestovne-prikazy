import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { dismissToast, getToasts, subscribeToasts } from './toast-store';

/** Toast area for mutation errors (SET-03). */
export function Toaster() {
  const { t } = useTranslation();
  const items = useSyncExternalStore(subscribeToasts, getToasts);
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex flex-col gap-2"
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="flex items-start gap-3 rounded bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span>{toast.message()}</span>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="ml-auto font-bold"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
