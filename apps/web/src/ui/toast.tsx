import { useSyncExternalStore } from 'react';
import { dismissToast, getToasts, subscribeToasts } from './toast-store';

/** Toast area for mutation errors (SET-03). */
export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts);
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex flex-col gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="flex items-start gap-3 rounded bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span>{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="ml-auto font-bold"
            onClick={() => dismissToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
